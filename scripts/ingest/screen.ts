/**
 * Stage 2 of the pre-filter: items that failed the keyword check get a batched Gemini screen on
 * headline + first lines (BATCH items per call). Relevant ones are released to full
 * classification; the rest stay filtered out. Capped by keywords.contextScreen.maxCalls.
 */
import { eq, inArray } from "drizzle-orm";
import type { AppConfig } from "@/config/defaults";
import type { DB } from "@/lib/db/client";
import { rawItems } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { truncate } from "@/lib/text";
import { buildScreenPrompt, SCREEN_PROMPT_VERSION, screenResponseSchema, screenSchema } from "@/prompts/screen";

const BATCH = 80;

export async function contextScreen(
  db: DB,
  cfg: AppConfig,
  candidates: { id: number; title: string; body: string }[],
): Promise<{ screened: number; released: number; calls: number; status: string }> {
  const opt = cfg.keywords.contextScreen ?? { enabled: false, maxCalls: 0 };
  if (!opt.enabled || candidates.length === 0) return { screened: 0, released: 0, calls: 0, status: opt.enabled ? "nothing to screen" : "disabled" };
  let pool: GeminiPool;
  try {
    pool = new GeminiPool(undefined, undefined, () => {});
  } catch (err) {
    return { screened: 0, released: 0, calls: 0, status: `no Gemini (${(err as Error).message})` };
  }
  const todo = candidates.slice(0, BATCH * opt.maxCalls);
  let released = 0;
  let screened = 0;
  let calls = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const prompt = buildScreenPrompt(chunk.map((c, j) => ({ i: j, text: truncate(`${c.title}. ${c.body}`.replace(/\s+/g, " "), 300) })));
    let parsed: ReturnType<typeof screenSchema.parse> | null = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      try {
        const res = await pool.generateJson(prompt, screenResponseSchema);
        calls++;
        const v = screenSchema.safeParse(JSON.parse(res.text));
        if (v.success) parsed = v.data;
      } catch (err) {
        if (err instanceof GeminiError && err.kind !== "transient") {
          return { screened, released, calls, status: `stopped (${err.kind})` };
        }
      }
    }
    if (!parsed) continue;
    const yes = parsed.filter((r) => r.relevant && chunk[r.i]);
    for (const r of yes) {
      await db
        .update(rawItems)
        .set({ prefilterPassed: true, classifyStatus: "pending", prefilterNote: `context (${SCREEN_PROMPT_VERSION}): ${r.why}` })
        .where(eq(rawItems.id, chunk[r.i].id));
    }
    const noIds = parsed.filter((r) => !r.relevant && chunk[r.i]).map((r) => chunk[r.i].id);
    if (noIds.length) {
      await db.update(rawItems).set({ prefilterNote: `context (${SCREEN_PROMPT_VERSION}): not relevant` }).where(inArray(rawItems.id, noIds));
    }
    screened += parsed.length;
    released += yes.length;
  }
  return { screened, released, calls, status: "ok" };
}
