import "./env";
import { closeDb, getDb, isPglite } from "@/lib/db/client";

async function main() {
  const db = await getDb();
  const migrationsFolder = "./drizzle";
  if (isPglite()) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db as never, { migrationsFolder });
  }
  console.log("migrations applied");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
