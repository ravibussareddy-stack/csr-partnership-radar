import { createHash } from "node:crypto";

/** sha256 of normalised title + body. Used for classification caching and dedupe. */
export function contentHash(title: string, body: string): string {
  const norm = `${title}\n${body}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex");
}
