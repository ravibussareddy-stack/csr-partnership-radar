/** npm run demo:clear — removes every demo item (is_demo = true) and anything derived from it. */
import "../env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { rawItems } from "@/lib/db/schema";

async function main() {
  const db = await getDb();
  const out = await db.delete(rawItems).where(eq(rawItems.isDemo, true)).returning({ id: rawItems.id });
  console.log(`demo: removed ${out.length} demo items`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
