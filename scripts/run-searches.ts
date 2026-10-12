/** npm run searches — run only the saved Google searches (Gemini grounding), e.g. after editing them. */
import "./env";
import { loadConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";
import { runSearches } from "./ingest/search";

async function main() {
  const db = await getDb();
  const r = await runSearches(db, await loadConfig(db));
  console.log(`searches: ${r.runs} run, ${r.found} sourced results, ${r.inserted} new`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
