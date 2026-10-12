/**
 * Intake inbox adapter (IMAP, read-only). One mailbox collects:
 *   - Google Alerts emails (Ananya's saved searches as alerts)      → source "google-alerts", one item per result
 *   - LinkedIn notification emails (forwarded by a Gmail filter)    → source "linkedin-email", one item per email
 *   - anything forwarded by hand (WhatsApp/SMS share-to-mail, etc.) → source "email-intake", one item per email
 * Credentials: INTAKE_IMAP_USER + INTAKE_IMAP_PASSWORD (a Gmail app password), optional
 * INTAKE_IMAP_HOST (imap.gmail.com) and INTAKE_MAILBOX (INBOX, or a Gmail label like "csr-radar").
 * Privacy: by default (INTAKE_FILTER=tagged) the IMAP SEARCH runs server-side and only fetches
 * mail from Google Alerts or LinkedIn, or with "[CSR-IN]" in the subject, so a personal inbox
 * can be used without downloading anything else. INTAKE_FILTER=all reads a dedicated inbox fully.
 * Items go into raw_items and through the normal pre-filter → classify → score pipeline.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { DB } from "@/lib/db/client";
import { rawItems } from "@/lib/db/schema";
import { contentHash } from "@/lib/hash";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { canonicalUrl, matchKeywords, stripHtml, truncate } from "@/lib/text";

export interface EmailItem {
  source: "google-alerts" | "linkedin-email" | "email-intake";
  url: string;
  title: string;
  body: string;
  publishedAt: Date | null;
}

const LOOKBACK_DAYS = Number(process.env.INTAKE_LOOKBACK_DAYS ?? 7);
/** Subject tag for messages forwarded into the pipeline by hand. */
export const INTAKE_TAG = "[CSR-IN]";

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Google wraps result links as https://www.google.com/url?...&url=<real>&...; unwrap them. */
export function unwrapGoogleUrl(href: string): string | null {
  try {
    const u = new URL(decodeEntities(href));
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") {
      const real = u.searchParams.get("url") ?? u.searchParams.get("q");
      return real && /^https?:/i.test(real) && !/(^|\.)google\./.test(new URL(real).hostname) ? real : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Splits a Google Alerts email (HTML) into one item per result: title, snippet, real URL. */
export function parseGoogleAlert(html: string, date: Date | null): EmailItem[] {
  const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const items: EmailItem[] = [];
  const seen = new Set<string>();
  anchors.forEach((m, i) => {
    const real = unwrapGoogleUrl(m[1]);
    if (!real) return;
    const title = stripHtml(m[2]);
    if (title.length < 12) return; // "Flag as irrelevant", source names, icons
    const url = canonicalUrl(real);
    if (seen.has(url)) return;
    seen.add(url);
    // Snippet = text between this result link and the next link.
    const end = anchors[i + 1]?.index ?? Math.min(html.length, (m.index ?? 0) + 2000);
    const snippet = truncate(stripHtml(html.slice((m.index ?? 0) + m[0].length, end)), 600);
    items.push({ source: "google-alerts", url, title, body: snippet, publishedAt: date });
  });
  return items;
}

const TRACKING = /(unsubscribe|optout|opt-out|manage|preferences|settings|privacy|help|mailto:|google\.com\/alerts)/i;

function firstUsefulLink(mail: ParsedMail): string | null {
  const html = typeof mail.html === "string" ? mail.html : "";
  const fromHtml = [...html.matchAll(/href="(https?:[^"]+)"/gi)].map((m) => decodeEntities(m[1]));
  const fromText = (mail.text ?? "").match(/https?:\/\/[^\s<>()"']+/g) ?? [];
  for (const raw of [...fromText, ...fromHtml]) {
    const href = unwrapGoogleUrl(raw) ?? raw;
    if (!TRACKING.test(href)) return href;
  }
  return null;
}

/** LinkedIn links carry tracking params; keep the path that identifies the post/job/message. */
function cleanLinkedIn(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("linkedin.com")) return `${u.origin}${u.pathname}`;
  } catch {
    /* fall through */
  }
  return canonicalUrl(url);
}

/** LinkedIn alert emails list several posts/jobs; one item per entry link with a real title. */
export function parseLinkedInDigest(html: string, date: Date | null): EmailItem[] {
  const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const out: EmailItem[] = [];
  const seen = new Set<string>();
  anchors.forEach((m, i) => {
    const href = decodeEntities(m[1]);
    if (!/linkedin\.com\/(comm\/)?(jobs\/view|feed\/update|posts|pulse|events)\//i.test(href)) return;
    const title = stripHtml(m[2]);
    if (title.length < 12) return;
    const url = cleanLinkedIn(href);
    if (seen.has(url)) return;
    seen.add(url);
    const end = anchors[i + 1]?.index ?? Math.min(html.length, (m.index ?? 0) + 1500);
    const body = truncate(stripHtml(html.slice((m.index ?? 0) + m[0].length, end)), 500);
    out.push({ source: "linkedin-email", url, title, body, publishedAt: date });
  });
  return out;
}

export function itemsFromMail(mail: ParsedMail): EmailItem[] {
  const from = mail.from?.value?.[0]?.address?.toLowerCase() ?? "";
  const date = mail.date ?? null;
  const subject = (mail.subject ?? "")
    .replace(INTAKE_TAG, "")
    .replace(/^\s*((fwd?|fw|re)\s*:\s*)+/i, "")
    .trim();
  const html = typeof mail.html === "string" ? mail.html : "";
  const text = mail.text ?? stripHtml(html);
  const id = (mail.messageId ?? `${from}-${date?.toISOString()}-${subject}`).replace(/[<>\s]/g, "");

  if (from.startsWith("googlealerts-noreply@google.com") || /google alert/i.test(subject)) {
    const items = parseGoogleAlert(html, date);
    if (items.length) return items;
  }
  if (from.endsWith("linkedin.com") || /linkedin\.com/i.test(html.slice(0, 5000))) {
    const split = parseLinkedInDigest(html, date);
    if (split.length > 1) return split;
    const link = firstUsefulLink(mail);
    return [
      {
        source: "linkedin-email",
        url: link ? cleanLinkedIn(link) : `email:${id}`,
        title: subject || "LinkedIn notification",
        body: truncate(text.replace(/\s+/g, " "), 2000),
        publishedAt: date,
      },
    ];
  }
  const link = firstUsefulLink(mail);
  return [
    {
      source: "email-intake",
      // A forwarded message about a known article dedupes against the feed item (same URL).
      url: link ? canonicalUrl(link) : `email:${id}`,
      title: subject || truncate(text, 120) || "Forwarded message",
      body: truncate(text.replace(/\s+/g, " "), 3000),
      publishedAt: date,
    },
  ];
}

export async function fetchIntakeEmail(db: DB): Promise<{ status: string; emails: number; items: number; inserted: number }> {
  const user = process.env.INTAKE_IMAP_USER;
  const pass = process.env.INTAKE_IMAP_PASSWORD;
  if (!user || !pass) return { status: "not configured (INTAKE_IMAP_USER / INTAKE_IMAP_PASSWORD)", emails: 0, items: 0, inserted: 0 };

  const client = new ImapFlow({
    host: process.env.INTAKE_IMAP_HOST ?? "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  let emails = 0;
  const items: EmailItem[] = [];
  await client.connect();
  try {
    await client.mailboxOpen(process.env.INTAKE_MAILBOX ?? "INBOX", { readOnly: true });
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
    const query =
      process.env.INTAKE_FILTER === "all"
        ? { since }
        : { since, or: [{ from: "googlealerts-noreply@google.com" }, { from: "linkedin.com" }, { subject: INTAKE_TAG }] };
    const uids = (await client.search(query, { uid: true })) || [];
    if (uids.length === 0) return { status: "ok", emails: 0, items: 0, inserted: 0 };
    for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
      if (!msg.source) continue;
      emails++;
      items.push(...itemsFromMail(await simpleParser(msg.source)));
    }
  } finally {
    await client.logout().catch(() => {});
  }

  // Data minimisation: LinkedIn mail is mostly personal notifications (profile views, feed
  // posts). Only LinkedIn items that mention CSR (or a CSR policy term) are kept; the rest is
  // dropped here and never stored. Google Alerts and [CSR-IN] forwards are CSR by construction.
  const csrTerms = [...DEFAULT_CONFIG.keywords.csr, ...DEFAULT_CONFIG.keywords.policy];
  const kept = items.filter((it) => it.source !== "linkedin-email" || matchKeywords(`${it.title}\n${it.body}`, csrTerms).length > 0);
  const dropped = items.length - kept.length;

  let inserted = 0;
  for (const it of kept) {
    const out = await db
      .insert(rawItems)
      .values({ source: it.source, url: it.url, title: it.title, body: it.body, publishedAt: it.publishedAt, contentHash: contentHash(it.title, it.body) })
      .onConflictDoNothing({ target: rawItems.url })
      .returning({ id: rawItems.id });
    inserted += out.length;
  }
  return { status: `ok (${dropped} non-CSR LinkedIn notifications dropped, not stored)`, emails, items: kept.length, inserted };
}
