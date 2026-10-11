/** Company entity resolution shared by the live pipeline and the archive crawler. */
import { baseKey, nameKey } from "@/lib/companies";
import type { DB } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";

export interface CompanyIndex {
  byKey: Map<string, number>;
  byBase: Map<string, number | null>; // null = ambiguous
}

export async function loadCompanyIndex(db: DB): Promise<CompanyIndex> {
  const idx: CompanyIndex = { byKey: new Map(), byBase: new Map() };
  const rows = await db
    .select({ id: companies.id, name: companies.canonicalName, aliases: companies.aliases, key: companies.nameKey, base: companies.baseKey })
    .from(companies);
  for (const co of rows) {
    for (const n of [co.name, ...co.aliases]) idx.byKey.set(nameKey(n), co.id);
    if (co.key) idx.byKey.set(co.key, co.id);
    const b = co.base ?? baseKey(co.name);
    if (!b) continue;
    idx.byBase.set(b, idx.byBase.has(b) && idx.byBase.get(b) !== co.id ? null : co.id);
  }
  return idx;
}

/**
 * Entity resolution: exact normalised name (incl. aliases and the 71k National CSR Portal
 * names), then a unique match without legal suffixes ("Hindustan Zinc" → "Hindustan Zinc
 * Limited"); otherwise a new news-origin company. TODO(phase-2): fuzzy matching, CIN.
 */
export async function resolveCompany(db: DB, name: string, idx: CompanyIndex): Promise<number> {
  const key = nameKey(name);
  const hit = idx.byKey.get(key) ?? idx.byBase.get(baseKey(name)) ?? undefined;
  if (hit) return hit;
  const [row] = await db
    .insert(companies)
    .values({ canonicalName: name.trim(), nameKey: key, baseKey: baseKey(name), origin: "news" })
    .onConflictDoUpdate({ target: companies.canonicalName, set: { isActive: true } })
    .returning({ id: companies.id });
  idx.byKey.set(key, row.id);
  return row.id;
}
