/**
 * npm run test:email — parser tests for the intake inbox adapter.
 * The emails below are SYNTHETIC TEST FIXTURES in the formats Google Alerts / LinkedIn use.
 * They are never written to the database or shown in the digest.
 */
import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { itemsFromMail } from "../scripts/ingest/email";

const googleAlert = `From: Google Alerts <googlealerts-noreply@google.com>
Subject: Google Alert - CSR skilling Maharashtra
Date: Sat, 10 Oct 2026 08:00:00 +0000
Message-ID: <fixture-alert@google.com>
Content-Type: text/html; charset=UTF-8

<a href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://news.example.in/acme-skilling-pune%3Futm_source%3Dga&amp;ct=ga"><span>Acme Ltd launches CSR skilling centre in Pune</span></a>
<div>Acme Foundation will train 2,000 youth a year with an NGO partner.</div>
<a href="https://www.google.com/alerts/feedback?x=1">Flag as irrelevant</a>
<a href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://other.example.in/beta-seeks-ngos&amp;ct=ga"><span>Beta Corp invites proposals from NGOs for digital literacy</span></a>
<div>Expression of interest open till November.</div>
<a href="https://www.google.com/alerts/remove?s=x">Unsubscribe</a>`;

const linkedinDigest = `From: LinkedIn <jobs-noreply@linkedin.com>
Subject: 2 new jobs for CSR manager
Date: Sat, 10 Oct 2026 09:00:00 +0000
Message-ID: <fixture-li@linkedin.com>
Content-Type: text/html; charset=UTF-8

<a href="https://www.linkedin.com/comm/jobs/view/123456/?trackingId=abc&amp;refId=x">CSR Programme Manager - Gamma Foundation, Pune</a><p>Gamma Foundation · Pune · Education CSR</p>
<a href="https://www.linkedin.com/comm/jobs/view/789012/?trackingId=def">Head of CSR Partnerships - Delta Industries</a><p>Delta Industries · Mumbai</p>
<a href="https://www.linkedin.com/comm/psettings/email-unsubscribe?x">Unsubscribe</a>`;

const tagged = `From: Me <me@example.com>
Subject: [CSR-IN] Fwd: Epsilon Steel looking for skilling NGOs
Date: Sun, 11 Oct 2026 09:00:00 +0000
Message-ID: <fixture-fwd@example.com>
Content-Type: text/plain; charset=UTF-8

From a WhatsApp group: Epsilon Steel is shortlisting skilling NGOs in Nashik https://epsilon.example.com/csr?utm_campaign=x`;

const run = async (raw: string) => itemsFromMail(await simpleParser(raw));

async function main() {
const a = await run(googleAlert);
assert.equal(a.length, 2, "one item per alert result; feedback/unsubscribe links skipped");
assert.equal(a[0].source, "google-alerts");
assert.equal(a[0].url, "https://news.example.in/acme-skilling-pune", "Google redirect unwrapped, utm removed");
assert.match(a[0].body, /2,000 youth/);

const l = await run(linkedinDigest);
assert.equal(l.length, 2, "one item per LinkedIn alert entry");
assert.equal(l[0].url, "https://www.linkedin.com/comm/jobs/view/123456/", "LinkedIn tracking stripped");
assert.match(l[1].title, /Head of CSR Partnerships/);

const t = await run(tagged);
assert.equal(t.length, 1);
assert.equal(t[0].source, "email-intake");
assert.equal(t[0].title, "Epsilon Steel looking for skilling NGOs", "[CSR-IN] tag and Fwd: removed from the title");
assert.equal(t[0].url, "https://epsilon.example.com/csr");

console.log("email parser: all tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
