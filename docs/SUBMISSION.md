# CSR Partnership Radar — Submission (MESA Cohort C4)

**Live:** https://csr-partnership-radar-two.vercel.app · **Repo:** github.com/ravibussareddy-stack/csr-partnership-radar
**State as of 12 October 2026.** Every number below was measured on the production database on that date.

A weekly CSR intelligence tool for Ananya, partnerships head of a Pune education NGO. It reads CSR news, Google searches (via Gemini grounding), Google/LinkedIn alert emails and forwarded messages. Each item ends in **Call this week / Watch / Background**, with the reason.

---

## 1. Brief compliance

| Requirement | Status | Evidence |
|---|---|---|
| All AI on Google Gemini Flash; no other LLM provider | ✅ | `lib/gemini.ts` (REST, `GEMINI_MODEL`). Retrieval for "Ask the Radar" is BM25 in code, with no embeddings model. |
| Live data | ✅ | RSS feeds, Gemini + Google Search grounding, Gmail intake (Google Alerts, LinkedIn alerts, `[CSR-IN]` forwards), National CSR Portal FY2014-15 → FY2024-25 |
| Vercel only reads; no crawling or LLM calls in Vercel request handlers | ✅ | All AI and crawling run in GitHub Actions (`ingest.yml` daily, `team.yml` / `intake.yml` on demand + schedule). Vercel only writes user input (messages, comments, sectors, feedback) and can ask GitHub to start a workflow. |
| Next.js App Router + TypeScript, Neon Postgres via Drizzle | ✅ | Next 16 (Cache Components), Drizzle migrations `0000`–`0018` |
| Multi-key Gemini fallback via env vars; `.env.example` with names only | ✅ | `GEMINI_KEY_PRIMARY`, `GEMINI_KEY_FALLBACK_1..N`; no keys committed |
| Each item ends in Call this week / Watch / Background with a reason | ✅ | Deterministic, config-driven scoring with an eligibility gate (§2) |
| `docs/COMPONENTS.md` kept current | ✅ | Plus `docs/DECISIONS.md`, with the reasoning for each design choice |

---

## 2. Response to the reassessment (7.5/10)

I agree with the reviewer's central point: the hardest job is deciding which announcements are worth pursuing. Every finding was checked against the database before fixing; the root causes below are the verified ones.

| Finding | Verdict | Root cause (verified) | Fix | Verified after the fix |
|---|---|---|---|---|
| Contradictory prioritisation (Aditya Birla, CG Power urgent while the analysis says "monitor") | **Agree** | The tier came from points; the analysis's own recommendation wasn't an input. A later rule ("pitch Pune" for out-of-region items) made it worse. | Classifier v7 adds `recommended_action` (reach out now / prepare / monitor / context). **Eligibility gate before Call this week**: a named funder (not a publisher), an NGO partner route, Pune/Maharashtra or national activity (or a company that already reports CSR spend in Maharashtra), *and* the analysis recommending outreach now. A failed gate shows its reason, e.g. "not a call: analysis recommends 'monitor'; no NGO partner route stated; outside your region (Nellore, Andhra Pradesh) and no CSR spend in Maharashtra → Watch". | Aditya Birla → Watch, with that reason. Calls went from 11 to **1** (Delta Exchange × Y4D Foundation, Maharashtra). The 8 good but non-urgent leads (AAI, MediaTek, BT, Bajaj Auto, Alcobrew, AM/NS, Carrier, Trelleborg) are labelled **Introduce soon** rather than inflating the call list. |
| Duplicate announcements (Delta Exchange, MediaTek, Alcobrew) | **Agree** | Merging skipped demo/pasted copies, and required the same signal type. | One card per **company + initiative + 3-day window** (same type, or headlines sharing ≥ 50% of their distinctive words). Real articles stay primary; every other source is kept under "Also reported by". A merged card counts under every channel it arrived through. | Consistency rule "one card per story": **pass**. |
| Alcobrew gets Pune +20 while the research says New Delhi | **Agree** | When the AI extracted no location, scoring scanned the raw text, and a demo message template contained "Pune NGO network group". | Location points now come **only** from places the AI extracted (the text scan is used only for unclassified items). The demo template was corrected. | Rule "a location bonus matches an extracted place": **pass (41 items)**. |
| Company profile links return "Company not found" | **Agree** | The data-quality audit merged duplicate company records; old IDs disappeared. | Every merge records old → new ID; old links redirect (`/companies/2` → `/companies/18697`, Alcobrew). The 17 earlier merges were backfilled. | Rule "every company link resolves": **pass (31)**. Live check of `/companies/2`, `/62348`, `/62677` all redirect to 18697. |
| Summary says 12 calls, Digest says 23 | **Partly agree** | Not a calculation error: the Summary excluded demo items and the Digest included them. Still confusing. | Demo samples are hidden by default on the Digest ("Show demo samples" toggle); both pages now count the same items. | Summary 1 call = Digest 1 call. |
| Forecast error 28.3% vs 25.6% naive | **Agree** | The weighted model does not beat "same as last year". | **Model selection by back-test**: the stats job now uses whichever method had the lower error, currently "same as last year", and the page says so. | Amount forecasts now equal the naive baseline (it can't beat itself). The stronger signal is timing: 42.9% of held-out years fell in the predicted window vs 25% by chance. |
| Monday email delivery unverifiable | **Agree it was unverified**, and it had **not** been sent | The 12 Oct scheduled run (01:45 UTC) ran before the Gmail credentials were added (04:08 UTC), so it logged "not configured". The workflow itself is correct; instant alerts have been sending since 04:18 UTC. | No code fix needed. Rendered locally to verify. | Preview subject: `[CSR Radar] Monday digest · W42 2026 · 1 to call · 32 to watch`, with Call / Watch / Your partners / Rules & regulation / Warm list sections. **Sent and verified 12 Oct 2026** via the "Monday digest email" workflow (log: `notify: sent "[CSR Radar] Monday digest · W42 2026 · 1 to call · 32 to watch"`); next scheduled send Mon 19 Oct 07:00 IST. |
| Pitch-kit evidence from a broker review site (Delta Exchange ₹7.6 cr) | **Agree** | Any page Google returned was accepted if it mentioned the company. | **Source-quality tiers**: official (company site, gov/regulator, exchange) > news / CSR news > other > low (review, listing, broker, social, forums). Low-quality sources are dropped; **proof figures need an official or news source**. Applied when kits are built and re-checked by the daily audit. | The audit removed **19** lines on its first pass (e.g. a csrbooks.com figure for AM/NS). AM/NS now has **0** proof lines rather than unofficial ones. |

**End-to-end consistency test** (`npm run test:consistency`, also part of the daily audit and shown on the Team page). Seven rules checked against the live digest:

| | Before the fixes | After |
|---|---|---|
| Violations | **7** (1 call without a real funder; 1 without an NGO route; 5 outside the region with no Maharashtra presence) | **0**, all 7 rules pass |

---

## 2b. Reviewer follow-ups (8.0/10)

Code changes made after the 8.0/10 reassessment. Production is re-scored with the new rules by the daily ingest (00:30 UTC); the numbers below are the rules, not new measurements.

| Follow-up | Change | Where |
|---|---|---|
| Summary and Digest counts disagreed (Digest showed 2 calls: a demo Bajaj Finserv pasted message was a call) | Demo items are excluded from **every** count: Digest header, tier / source / place chips, the week heading ("N insights + k demo" when samples are shown), impact stats (articles read, messages dropped) and the hiring list, matching the Summary and the email. Tier chips now show their counts. | `app/digest/page.tsx`, `app/components/InsightBoard.tsx`, `lib/data.ts`, `lib/history/queries.ts` |
| "Call" mixed open calls with warm approaches | Every call is labelled **Open opportunity** (partner search: call for proposals, RFP, EOI; respond before it closes) or **Warm lead** (funds the sectors through NGOs; introduce the NGO now for the next cycle), derived from the signal type. Shown on cards, the Summary's Call panel, the Monday email and call alerts. | `callType()` in `lib/insights.ts` |
| Watch was crowded with outside-focus items nobody would act on | Outside-focus items stay on Watch only when the analysis recommends **prepare**; **monitor / context** → Background, with the reason stated. | `lib/scoring.ts` |
| Publisher guard too broad (Sportskeeda funding a STEM lab is a real funder) | A publisher is dropped as funder only when it is the **outlet that reported the item** (item URL host or feed source matches); wire agencies and aggregators always are. Scoring, the daily audit and the consistency check use the same rule. | `isReportingOutlet()` in `lib/publishers.ts`; `npm run test:publishers` |
| No human-labelled measure of call quality | `npm run eval:sheet` exports ~30 recent real items (up to 10 calls, 10 watch, the rest background) with empty human-verdict columns (call / watch / background, open / warm, notes). `npm run eval` reports Call precision and recall, tier agreement with Cohen's kappa, the confusion matrix, Call-vs-Background contradictions and Open/Warm agreement. The labels are filled by a person, not by the system. | `evals/export-sheet.ts`, `evals/score.ts` |

---

## 3. What works well (unchanged strengths)

- Source-linked cards with a specific headline, "why it's worth your time", key points, a job to be done, and a **pitch kit** where every line links to a source.
- **Ask the Radar**: answers only from the article's own sources (RAG, cited [n]); web search is opt-in. Answered in **41 s** end to end on GitHub Actions.
- 11 years of National CSR Portal spend, recurring announcement windows, a CSR calendar (filterable by Maharashtra / Pune), and Funding insights with back-tests.
- **Relationships** watch: renewal timing vs announcement cycles, spend trends, hiring, plus news and rule impact, each with its reasoning.
- **Regulatory** page with Executed / Confirmed / Inferred labels and verbatim quotes only.
- **Daily self-audit**: merges duplicate companies, removes wrong-page or low-quality sources, re-checks job links, runs the consistency rules, and reports on the Team page.

---

## 4. Known limitations (verified, as of 12 Oct 2026)

Resolved during the final check: the Monday email was sent and received (W42), and `REVALIDATE_SECRET` is set in GitHub and Vercel (verified by the "Refresh site cache" workflow), so the live site refreshes after every run.


| Limitation | Why / impact | Mitigation |
|---|---|---|
| **Only 1 call this week** | A deliberate trade-off after the review: dependable over plentiful. 8 more leads with a named funder are "Introduce soon". | The gate's thresholds live in config (`scoringWeights`) and the classifier prompt. |
| Amount forecasts are no better than "same as last year" | The portal history is too noisy for the weighted model. | Model selection uses the better method; amounts are presented as a range; timing windows are the stronger signal. |
| LinkedIn content only via LinkedIn alert emails | Google grounding returned no linkedin.com sources when tested; scraping LinkedIn is against its terms. | Labelled demo samples show the LinkedIn and Personal messages views. |
| Demo data present | 15 messages and 12 LinkedIn samples, built from real articles and labelled Demo. | Excluded from counts, alerts, emails and the relationship watch; `npm run demo:clear` removes them. |
| Entity resolution is conservative | AI-assisted merges need ≥ 80% confidence and a database candidate, so some duplicates may survive a day. | Re-run daily; the Team page lists merges. |
| Grounding sometimes cites a page about another company | A limitation of the search tool. | The audit checks that the page names the company; 31 then 19 lines removed so far. Contact source checks run within the audit's daily page-fetch budget, so they finish over the next runs. |
| No strong correlations found | Announcements vs growth, size vs focus, etc. are all near r = 0. | Reported honestly on Funding insights. |
| Authentication is passcode-based | Lead passcode plus per-teammate passcodes (scrypt hashes); no SSO. | Contract data is team-only and never cached. |

---

## 5. How to verify

```bash
npm run test:consistency     # 7 end-to-end rules against the live digest
npm run test:joblinks        # job-link classifier tests
npm run test:paste           # message splitting tests
npm run test:publishers      # publisher-as-funder guard tests
npm run eval:sheet           # export the 30-item labelling sheet (needs DATABASE_URL)
npm run eval                 # score the filled sheet: Call precision, agreement, contradictions
npm run notify -- --digest --preview=monday.html   # render the Monday email without sending
```

Pages: `/` (Summary), `/digest`, `/regulatory`, `/relationships` and `/questions` (team only), `/calendar?geo=pune`, `/funding`, `/jobs`, `/community`, `/team` (Data health panel).

---

## 6. Prompt for the reviewer (copy and paste)

> Please reassess CSR Partnership Radar (https://csr-partnership-radar-two.vercel.app) against the MESA C4 brief and your previous review (7.5/10). For each earlier finding (contradictory prioritisation, duplicate announcements, Alcobrew's Pune bonus, broken company links, Summary vs Digest counts, forecast accuracy, Monday email, pitch-kit source quality), check the live site and say whether it is resolved, using docs/SUBMISSION.md §2 for the stated fix and evidence. Then confirm or dispute each item in §4 "Known limitations". In particular, judge whether the stricter "Call this week" gate (named funder, NGO partner route, Pune/Maharashtra/national or a company already funding in Maharashtra, and the analysis itself recommending outreach now, with good non-urgent leads labelled "Introduce soon") makes the recommendations dependable. Give an updated score with the same categories, and list any new verified defect with a concrete example and URL.
