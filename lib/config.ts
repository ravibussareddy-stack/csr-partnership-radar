import { eq } from "drizzle-orm";
import { DEFAULT_CONFIG, type AppConfig } from "@/config/defaults";
import type { DB } from "@/lib/db/client";
import { config } from "@/lib/db/schema";

/** Reads the config row; falls back to defaults if the table has not been seeded. */
export async function loadConfig(db: DB): Promise<AppConfig> {
  const rows = await db.select().from(config).where(eq(config.id, 1)).limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_CONFIG;
  // Merge over defaults so a row seeded by an older version still has every key.
  const d = DEFAULT_CONFIG;
  return {
    sectors: row.sectors,
    geographies: row.geographies,
    keywords: {
      ...d.keywords,
      ...row.keywords,
      signalHints: { ...d.keywords.signalHints, ...row.keywords.signalHints },
    },
    sources: row.sources,
    scoringWeights: {
      ...d.scoringWeights,
      ...row.scoringWeights,
      signalType: { ...d.scoringWeights.signalType, ...row.scoringWeights.signalType },
    },
  };
}

/** Inserts the default config if missing. With force, overwrites the row. */
export async function seedConfig(db: DB, force = false): Promise<"inserted" | "updated" | "kept"> {
  const values = { id: 1, ...DEFAULT_CONFIG, updatedAt: new Date() };
  const existing = await db.select({ id: config.id }).from(config).where(eq(config.id, 1));
  if (existing.length === 0) {
    await db.insert(config).values(values);
    return "inserted";
  }
  if (!force) return "kept";
  await db.update(config).set(values).where(eq(config.id, 1));
  return "updated";
}
