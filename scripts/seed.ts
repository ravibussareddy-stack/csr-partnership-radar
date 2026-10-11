import "./env";
import { seedConfig } from "@/lib/config";
import { closeDb, getDb } from "@/lib/db/client";

async function main() {
  const force = process.argv.includes("--force");
  const result = await seedConfig(await getDb(), force);
  console.log(`config: ${result}${result === "kept" ? " (use --force to overwrite)" : ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
