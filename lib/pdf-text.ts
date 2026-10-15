/**
 * The PDF's built-in Helvetica covers Latin-1 plus a few typographic marks only: spell out ₹ and arrows,
 * and drop characters it cannot draw (emoji, Devanagari) rather than print boxes.
 */
const EXTRA = new Set("–—‘’“”•…€™");
export function pdfText(s: string): string {
  return s
    .replace(/₹\s?/g, "Rs ")
    .replace(/[→⟶➝]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/≈/g, "~")
    .replace(/[✓✔]/g, "")
    .normalize("NFKC")
    .split("")
    .filter((ch) => ch.charCodeAt(0) < 256 || EXTRA.has(ch))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}
