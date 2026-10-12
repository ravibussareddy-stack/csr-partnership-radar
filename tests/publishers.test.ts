/** npm run test:publishers — a publisher is excluded as funder only when it reported the item. */
import assert from "node:assert/strict";
import { isReportingOutlet } from "../lib/publishers";

const alert = { source: "google-alerts", sourceName: "Google Alerts" };
assert.equal(isReportingOutlet("Sportskeeda", { url: "https://www.sportskeeda.com/esports/x", ...alert }), true, "its own article");
assert.equal(isReportingOutlet("Sportskeeda", { url: "https://indiacsr.in/sportskeeda-stem-lab", source: "indiacsr", sourceName: "India CSR" }), false, "funds a STEM lab, reported by India CSR");
assert.equal(isReportingOutlet("India CSR", { url: "https://indiacsr.in/a", source: "indiacsr", sourceName: "India CSR" }), true, "feed source");
assert.equal(isReportingOutlet("The CSR Journal", { url: "https://thecsrjournal.in/a", source: "thecsrjournal" }), true);
assert.equal(isReportingOutlet("Times of India", { url: "https://timesofindia.indiatimes.com/city/pune/x", ...alert }), true, "subdomain host");
assert.equal(isReportingOutlet("Mint", { url: "https://www.livemint.com/x", source: "mint-companies" }), true, "livemint");
assert.equal(isReportingOutlet("Google", { url: "https://indiacsr.in/google-org-grant", ...alert }), false, "the alert channel is not the outlet");
assert.equal(isReportingOutlet("PTI", { url: "https://indiacsr.in/a", source: "indiacsr" }), true, "wire agencies never fund");
assert.equal(isReportingOutlet("Tata Steel", { url: "https://www.tatasteel.com/x" }), false, "not a publisher");
console.log("publishers: all assertions passed");
