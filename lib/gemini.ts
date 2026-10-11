/**
 * Minimal Gemini REST client (generateContent) with multi-key fallback.
 *
 * - Keys: GEMINI_KEY_PRIMARY, then GEMINI_KEY_FALLBACK_1..N (stops at the first gap).
 * - Falls back to the next key on 429 / quota errors, and on 401 / 403 (key rejected).
 * - Up to 3 tries per key with exponential backoff (429, 5xx, network errors).
 * - Logs key labels ("primary", "fallback_1"), never key values.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TRIES_PER_KEY = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export interface GeminiKey {
  label: string;
  value: string;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: "no_keys" | "all_keys_exhausted" | "transient" | "fatal",
  ) {
    super(message);
  }
}

export function loadKeys(env: NodeJS.ProcessEnv = process.env): GeminiKey[] {
  const keys: GeminiKey[] = [];
  if (env.GEMINI_KEY_PRIMARY) keys.push({ label: "primary", value: env.GEMINI_KEY_PRIMARY });
  for (let i = 1; ; i++) {
    const v = env[`GEMINI_KEY_FALLBACK_${i}`];
    if (!v) break;
    keys.push({ label: `fallback_${i}`, value: v });
  }
  return keys;
}

export function getModel(env: NodeJS.ProcessEnv = process.env): string {
  const model = env.GEMINI_MODEL?.trim();
  if (!model) throw new GeminiError("GEMINI_MODEL is not set", "fatal");
  return model;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfterMs?: number): number {
  const exp = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
  return Math.min(MAX_BACKOFF_MS, Math.max(exp, retryAfterMs ?? 0));
}

function isQuotaError(status: number, body: string): boolean {
  return status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(body);
}

/** Reads Retry-After or the google.rpc.RetryInfo retryDelay ("12s"). */
function retryAfterMs(res: Response, body: string): number | undefined {
  const header = res.headers.get("retry-after");
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) * 1000 : undefined;
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: { segment?: { startIndex?: number; endIndex?: number; text?: string }; groundingChunkIndices?: number[] }[];
  searchEntryPoint?: { renderedContent?: string };
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: GroundingMetadata;
  }[];
  promptFeedback?: { blockReason?: string };
}

export interface GeminiResult {
  text: string;
  keyLabel: string;
  model: string;
}

/**
 * Holds the key list for one run. A key that runs out of quota is skipped for
 * the rest of the run, so later items go straight to the next key.
 */
export class GeminiPool {
  private exhausted = new Set<string>();

  constructor(
    readonly keys: GeminiKey[] = loadKeys(),
    readonly model: string = getModel(),
    private log: (msg: string) => void = console.log,
  ) {}

  get available(): boolean {
    return this.keys.some((k) => !this.exhausted.has(k.label));
  }

  async generateJson(prompt: string, schema: object): Promise<GeminiResult> {
    return this.generate({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    });
  }

  /**
   * Plain-text generation with Google Search grounding. Returns the text plus groundingMetadata
   * (source chunks, the text segments they support, and Google's Search Suggestions HTML).
   */
  async generateGrounded(prompt: string): Promise<GeminiResult & { grounding: GroundingMetadata | null }> {
    const res = await this.generate({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] });
    return { ...res, grounding: res.raw?.candidates?.[0]?.groundingMetadata ?? null };
  }

  private async generate(request: object): Promise<GeminiResult & { raw?: GenerateResponse }> {
    if (this.keys.length === 0) throw new GeminiError("no Gemini keys configured", "no_keys");
    const body = JSON.stringify(request);
    const url = `${API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`;

    for (const key of this.keys) {
      if (this.exhausted.has(key.label)) continue;
      for (let attempt = 1; attempt <= TRIES_PER_KEY; attempt++) {
        let res: Response;
        let text: string;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key.value },
            body,
            signal: AbortSignal.timeout(60000),
          });
          text = await res.text();
        } catch (err) {
          // Network error / timeout: retry on the same key, never fall back.
          this.log(`gemini key=${key.label} attempt=${attempt} network error: ${(err as Error).name}`);
          if (attempt === TRIES_PER_KEY) throw new GeminiError("network error after retries", "transient");
          await sleep(backoffMs(attempt));
          continue;
        }

        if (res.ok) {
          const json = JSON.parse(text) as GenerateResponse;
          const cand = json.candidates?.[0];
          const out = (cand?.content?.parts ?? [])
            .filter((p) => !p.thought && typeof p.text === "string")
            .map((p) => p.text)
            .join("");
          if (!out) {
            const why = json.promptFeedback?.blockReason ?? cand?.finishReason ?? "empty response";
            // Returned as-is; the caller treats it as invalid JSON (retry once, then unclassified).
            this.log(`gemini key=${key.label} empty output (${why})`);
          }
          this.log(`gemini key=${key.label} ok`);
          return { text: out, keyLabel: key.label, model: this.model, raw: json };
        }

        if (isQuotaError(res.status, text)) {
          this.log(`gemini key=${key.label} attempt=${attempt} quota/429`);
          if (attempt < TRIES_PER_KEY) {
            await sleep(backoffMs(attempt, retryAfterMs(res, text)));
            continue;
          }
          this.exhausted.add(key.label);
          this.log(`gemini key=${key.label} exhausted, trying next key`);
          break; // next key
        }

        if (res.status >= 500) {
          this.log(`gemini key=${key.label} attempt=${attempt} HTTP ${res.status}`);
          if (attempt === TRIES_PER_KEY) throw new GeminiError(`HTTP ${res.status} after retries`, "transient");
          await sleep(backoffMs(attempt));
          continue;
        }

        const msg = text.match(/"message"\s*:\s*"([^"]{0,200})/)?.[1] ?? "";
        // 401 / 403: this key is rejected (invalid, revoked, blocked). Skip it for the run, try the next.
        if (res.status === 401 || res.status === 403) {
          this.exhausted.add(key.label);
          this.log(`gemini key=${key.label} rejected (HTTP ${res.status}), trying next key`);
          break;
        }
        // 400 / 404: bad request or unknown model, a config problem another key won't fix.
        throw new GeminiError(`HTTP ${res.status} key=${key.label}: ${msg}`, "fatal");
      }
    }
    throw new GeminiError("all Gemini keys exhausted (429/quota) or rejected (401/403)", "all_keys_exhausted");
  }
}
