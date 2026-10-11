/**
 * Manual company aliases (short names used in news), keyed by the official portal name.
 * These are always applied and win over generated aliases (scripts/history/aliases.ts).
 * Use "!" + alias to block a generated alias that is wrong or ambiguous.
 */
export const MANUAL_ALIASES: Record<string, string[]> = {
  "TATA CONSULTANCY SERVICES LIMITED": ["TCS", "Tata Consultancy Services"],
  "LARSEN AND TOUBRO LIMITED": ["L&T", "Larsen & Toubro"],
  "OIL AND NATURAL GAS CORPORATION LIMITED": ["ONGC"],
  "HINDUSTAN UNILEVER LIMITED": ["HUL"],
  "MAHINDRA AND MAHINDRA LIMITED": ["Mahindra & Mahindra", "M&M"],
  "BHARAT PETROLEUM CORPORATION LIMITED": ["BPCL"],
  "HINDUSTAN PETROLEUM CORPORATION LIMITED": ["HPCL"],
  "INDIAN OIL CORPORATION LIMITED": ["IndianOil", "IOCL"],
  "NTPC LIMITED": ["NTPC"],
  "COAL INDIA LIMITED": ["CIL"],
  "ITC LIMITED": ["ITC"],
};
