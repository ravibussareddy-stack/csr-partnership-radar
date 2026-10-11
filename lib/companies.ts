/** Company-name normalisation shared by the portal import, news matching and the digest. */

const LEGAL_SUFFIX = /\b(private limited|limited|llp|foundation|trust|group|india|corporation|company|co|inc)\b/g;

/** "Alcobrew Distilleries (India) Pvt. Ltd." → "alcobrew distilleries india private limited" */
export function nameKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  s = s.replace(/\bpvt\b/g, "private").replace(/\bltd\b/g, "limited").replace(/\bcorp\b/g, "corporation");
  return s.replace(/\s+/g, " ").trim();
}

/** Looser key without legal suffixes, for matching names as written in news ("Hindustan Zinc"). */
export function baseKey(name: string): string {
  return nameKey(name).replace(LEGAL_SUFFIX, " ").replace(/\s+/g, " ").trim();
}

/** "FY 2024-25" → 2024 */
export function parseFy(label: string): number | null {
  const m = label.match(/(\d{4})\s*-\s*\d{2,4}/);
  return m ? Number(m[1]) : null;
}

export function fyLabel(start: number): string {
  return `FY${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Portal sector names come in mixed case ("Health care" / "Health Care"). */
export function normSector(s: string): string {
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
