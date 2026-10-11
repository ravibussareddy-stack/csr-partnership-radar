import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: DB | null = null;
let closer: (() => Promise<void>) | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function isPglite(url = process.env.DATABASE_URL ?? ""): boolean {
  return url.startsWith("pglite://");
}

/**
 * Neon (HTTP driver) for production and CI. `pglite://<dir>` gives an embedded
 * Postgres for local development without a Neon project.
 */
export async function getDb(): Promise<DB> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (isPglite(url)) {
    // Dynamic imports keep PGlite (a dev dependency) out of the Vercel bundle path.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(url.slice("pglite://".length));
    cached = drizzle(client, { schema }) as unknown as DB;
    closer = () => client.close();
  } else {
    cached = drizzleNeon(neon(url), { schema }) as unknown as DB;
  }
  return cached;
}

/** Scripts call this before exiting (PGlite otherwise keeps the process alive). */
export async function closeDb(): Promise<void> {
  await closer?.();
  cached = null;
  closer = null;
}

export { schema };
