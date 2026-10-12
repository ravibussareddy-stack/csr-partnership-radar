/** npm run searches [-- --kind=policy] — run only the saved Google searches (Gemini grounding), e.g. after editing them. */
import "./env";
import { loadConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import { runSearches } from "./ingest/search";

async function main() {
  const db = await getDb();
  const cfg = await loadConfig(db);
  const kind = process.argv.find((a) => a.startsWith("--kind="))?.slice(7);
  const r = await runSearches(db, kind ? { ...cfg, searches: cfg.searches.filter((s) => (s.kind ?? "news") === kind) } : cfg);
  console.log(`searches: ${r.runs} run, ${r.found} sourced results, ${r.inserted} new`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
