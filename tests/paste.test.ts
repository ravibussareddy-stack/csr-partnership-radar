/** npm run test:paste — message-drop parser tests (synthetic fixtures, never stored). */
import assert from "node:assert/strict";
import { splitMessages } from "../lib/paste";

const dashed = `Bajaj Finance is inviting NGO proposals for youth skilling in Pune, deadline 30 Oct.
-----------------------
Heard from a friend at Kotak: their education CSR budget is going up next year.
-----------------------
ok`;
const r1 = splitMessages(dashed);
assert.equal(r1.length, 2, "split on dashes; too-short 'ok' dropped");
assert.match(r1[1].text, /Kotak/);

const numbered = `Message 1: Infosys Foundation launching digital literacy labs in Nashik schools.
Message 2: CSR head at Tata Motors wants to meet NGOs working with school dropouts.
Message 3 - LinkedIn post: Mahindra Pride Classroom expanding to Pune colleges.`;
const r2 = splitMessages(numbered);
assert.equal(r2.length, 3, "split on Message N headers");
assert.equal(r2[0].text, "Infosys Foundation launching digital literacy labs in Nashik schools.", "header removed");

const whatsapp = `[10/10/26, 9:41 AM] Messages and calls are end-to-end encrypted.
[10/10/26, 9:42 AM] Priya: Persistent Systems CSR team is looking for skilling partners in Pune
https://example.com/persistent-csr
[11/10/26, 6:05 PM] Rahul: <Media omitted>
[11/10/26, 6:06 PM] Rahul: Also Cummins India Foundation has a call for proposals for youth employability`;
const r3 = splitMessages(whatsapp);
assert.equal(r3.length, 2, "WhatsApp export: system and media lines skipped");
assert.match(r3[0].text, /Persistent Systems[\s\S]*example\.com/, "continuation line kept");
assert.ok(!/Priya/.test(r3[0].text), "sender name dropped");
assert.equal(r3[0].date?.toISOString(), "2026-10-10T04:12:00.000Z", "IST timestamp converted to UTC");

console.log("paste parser: all tests passed");
