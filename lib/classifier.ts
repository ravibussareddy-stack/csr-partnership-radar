import type { AppConfig } from "@/config/defaults";
import { GeminiError, type GeminiPool } from "@/lib/gemini";
import {
  buildPrompt,
  classificationSchema,
  PROMPT_VERSION,
  responseSchema,
  type Classification,
} from "@/prompts/classify";

export type ClassifyOutcome =
  | { ok: true; data: Classification; keyLabel: string; model: string }
  | { ok: false; reason: string; stopRun: boolean };

export interface ClassifiableItem {
  title: string;
  body: string;
  source: string;
  publishedAt: Date | null;
}

/**
 * One item → validated classification. Invalid JSON is retried once.
 * Never throws: every failure becomes { ok: false } so the run continues.
 * stopRun = true means no key can serve more calls this run (skip remaining items).
 */
export async function classifyItem(
  item: ClassifiableItem,
  cfg: AppConfig,
  pool: GeminiPool,
): Promise<ClassifyOutcome> {
  const prompt = buildPrompt(item, cfg);
  const schema = responseSchema(cfg);
  const validator = classificationSchema(cfg);
  let lastProblem = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await pool.generateJson(prompt, schema);
      let parsed: unknown;
      try {
        parsed = JSON.parse(res.text);
      } catch {
        lastProblem = "invalid JSON";
        continue;
      }
      const v = validator.safeParse(parsed);
      if (!v.success) {
        lastProblem = `schema mismatch: ${v.error.issues[0]?.path.join(".")} ${v.error.issues[0]?.message}`;
        continue;
      }
      return { ok: true, data: v.data, keyLabel: res.keyLabel, model: `${res.model}@${PROMPT_VERSION}` };
    } catch (err) {
      if (err instanceof GeminiError) {
        const stopRun = err.kind === "all_keys_exhausted" || err.kind === "no_keys" || err.kind === "fatal";
        return { ok: false, reason: `${err.kind}: ${err.message}`, stopRun };
      }
      return { ok: false, reason: `unexpected: ${(err as Error).message}`, stopRun: false };
    }
  }
  return { ok: false, reason: lastProblem, stopRun: false };
}
