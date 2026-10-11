/**
 * npm run history:classify-news — classifies company_news headlines in batches
 * (BATCH headlines per Gemini call) into kind + sector, so timing uses real announcements.
 * Unclassified rows (kind is null) are picked up on every run; capped by HEADLINE_MAX_CALLS.
 */
import "../env";
import { eq, isNull, or, not, like } from "drizzle-orm";
import { loadConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import { companies, companyNews } from "@/lib/db/schema";
import { GeminiError, GeminiPool } from "@/lib/gemini";
import { buildHeadlinePrompt, HEADLINE_PROMPT_VERSION, headlineResponseSchema, headlineSchema } from "@/prompts/headlines";

const BATCH = 80;
const MAX_CALLS = Number(process.env.HEADLINE_MAX_CALLS ?? 100);

async function main() {
  const db = await getDb();
  const cfg = await loadConfig(db);
  const pool = new GeminiPool();
  const version = `${pool.model}@${HEADLINE_PROMPT_VERSION}`;
  const todo = await db
    .select({ id: companyNews.id, title: companyNews.title, company: companies.canonicalName })
    .from(companyNews)
    .innerJoin(companies, eq(companies.id, companyNews.companyId))
    .where(or(isNull(companyNews.kind), not(like(companyNews.model, `%@${HEADLINE_PROMPT_VERSION}`))))
    .limit(BATCH * MAX_CALLS);
  console.log(`classify-news: ${todo.length} headlines to classify (${Math.ceil(todo.length / BATCH)} calls max)`);

  const schema = headlineResponseSchema(cfg);
  const validator = headlineSchema(cfg);
  let done = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const prompt = buildHeadlinePrompt(chunk.map((r, j) => ({ i: j, company: r.company, title: r.title })), cfg);
    let parsed: ReturnType<typeof validator.parse> | null = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      try {
        const res = await pool.generateJson(prompt, schema);
        const v = validator.safeParse(JSON.parse(res.text));
        if (v.success) parsed = v.data;
      } catch (err) {
        if (err instanceof GeminiError && err.kind !== "transient") {
          console.warn(`classify-news: stopping (${err.kind}: ${err.message})`);
          console.log(`classified ${done}, failed ${failed + chunk.length}`);
          return;
        }
      }
    }
    if (!parsed) {
      failed += chunk.length;
      continue;
    }
    for (const r of parsed) {
      const row = chunk[r.i];
      if (!row) continue;
      await db.update(companyNews).set({ kind: r.kind, sector: r.sector, model: version }).where(eq(companyNews.id, row.id));
      done++;
    }
  }
  console.log(`classified ${done}, failed ${failed}. Next: npm run history:stats`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
