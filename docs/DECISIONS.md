# Design decisions — CSR Partnership Radar

Each entry records what was decided, why, and what was rejected. Newest first within each area.

## Relationships (existing funders and contracts)

| Decision | Why | Rejected alternative |
|---|---|---|
| A **Relationships** page where the team enters current funders: company, programme, sectors, districts, value, start/renewal dates, status, contact *role*, notes. | The brief asks what a change means for *existing* client relations. The Radar can't know her contracts unless she tells it, and a form is the least effort for a handful of funders. | Importing from email or a CRM: no CRM exists in the brief, and parsing contracts from email is unreliable and privacy-heavy. |
| Team-only, never cached; the Summary page's "Your partners" panel renders per request, and only for signed-in teammates. | Contract values and renewal dates are confidential. Every other page is public and served from cache, so this data must never enter a cached render. | Showing partner alerts in the cached digest: would leak contract data to anyone with the URL. |
| Contact stored as a **role** ("CSR Manager, West"), not a name, email or phone. | Same data-minimisation rule as the rest of the app; the role is enough to frame the impact. | Storing personal contact details. |
| The company is matched to National CSR Portal records (exact name key → unique base name → alias). | Spend trends and announcement cycles live on the portal record; an unmatched name still gets news and rule checks, and the page says so. | Fuzzy matching: risks attaching the wrong company's spend history to a contract. |
| **Deterministic checks** for renewal timing, portal spend trend (±25% year-on-year in focus sectors, Pune, Maharashtra) and CSR hiring. | These are arithmetic on known data: rules are cheaper, reproducible and explainable, and the reasoning text quotes the exact numbers. 25% is used because smaller year-on-year moves are common noise in portal data (the back-test's median forecast error is ~28%). | Asking the LLM to judge numbers it can compute exactly. |
| Renewal alert: **Risk within 60 days** (budgets are usually committed by then), **Watch within 180 days**; "start the talk by" = the earlier of 30 days before the company's announcement window and 90 days before renewal. | Companies choose next-cycle partners before they announce; the recurring window (from 2009+ announcements) is the best evidence of when that happens. | A fixed reminder N days before renewal, which ignores the company's own cycle. |
| **Gemini Flash** judges whether new company news and rule changes affect *this* contract, returning a level (Risk / Watch / Opportunity), the impact, and the reasoning. Each item–relationship pair is read once. | Relevance depends on the contract's sector, geography and timing, which rules can't capture well. Reading each pair once keeps calls proportional to new items. | Flagging every item that names the company: too noisy. |
| A rule change labelled **Inferred** (not official) is capped at **Watch**, and the reasoning says why. | A draft or debate shouldn't be presented as a certain risk to a funded contract. | Trusting the model's level for unofficial rules. |

## Summary page

| Decision | Why | Rejected alternative |
|---|---|---|
| One-page overview: a short header with five numbers, then six key-point panels (Call this week, Your partners, Likely to fund Pune & MH in 30 days, Hiring, Rules & regulation, Team & engagement). Each shows its top three items as one-liners and links to the detail page. | Feedback: the previous Summary was too long. An overview should be readable in under a minute and route to detail rather than repeat it. | Full cue cards and long lists on the landing page (the previous version). |

## Regulatory

| Decision | Why | Rejected alternative |
|---|---|---|
| Replaced the MCA/SEBI site-focused searches with queries for **news coverage** of official notices, unspent-CSR compliance, parliamentary replies and SSE/BRSR. | The site-focused queries returned 0 results (official pages are rarely dated or indexed for recent-news queries). The replacements returned 13 sourced results on their first run vs 3. Coverage usually links to the official source, and the classifier still labels each item's status. | Scraping mca.gov.in / sebi.gov.in: unreliable structure, and they aren't news feeds. |
| Three statuses: **Executed** (in force), **Confirmed** (officially notified, not yet in force), **Inferred** (draft, debate, expert view, media expectation). Summary highlights are capped at the strongest status of the items they cite. | Separates fact from expectation, and the summary can never overstate what its sources support. | A single "policy" label. |
| Quotes are kept only if they appear **word for word** in the article; quotes over 600 characters are trimmed at a word boundary, not rejected. | Verbatim quotes are only useful if they are real. Trimming fixed 3 items that failed classification because of one long quote. | Paraphrased "quotes", or failing the whole item on a long quote. |

## Ask the Radar (RAG)

| Decision | Why | Rejected alternative |
|---|---|---|
| Default answers come only from what the Radar holds about the article (article passages, analysis, researched sources, the company's other items and headlines, portal data, team comments), ranked with **BM25**, top 14 snippets, cited [n]. Web search is opt-in. | Answers stay relevant to the article and checkable. In testing, the open web answer added district names the article didn't support; the RAG answer said the article only names Maharashtra. | Always searching the web; an embeddings model (would add a second model to a "Gemini Flash only" brief, with little gain on corpora of ~50 snippets). |
| Questions are answered by the 10-minute intake workflow, not by Vercel. | The brief: no LLM calls in Vercel request handlers. Optional `GITHUB_DISPATCH_TOKEN` triggers the workflow immediately. | Calling Gemini from a server action. |

## LinkedIn and demo data

| Decision | Why | Rejected alternative |
|---|---|---|
| **No LinkedIn search via Google.** Five LinkedIn-restricted grounded searches were built and tested; Google grounding returned no linkedin.com sources at all (queries targeted linkedin.com/posts; every source was another site). They were removed rather than left running uselessly. | Grounding doesn't expose LinkedIn content, and scraping LinkedIn is against its terms. | Scraping LinkedIn; keeping dead daily searches. |
| LinkedIn content arrives through her **LinkedIn alert emails** (already wired). For demonstration, `npm run demo:seed` adds **12 LinkedIn samples and 15 personal messages**, each built from a real recent article (link kept), labelled **Demo**, removable with `npm run demo:clear`, and hidden with "Hide demo". | The brief asked for 10–20 visible items in those views; demo items must be clearly labelled and invent nothing (no people, quotes or facts beyond the article). | Unlabelled synthetic posts or messages. |

| Demo items are excluded from Summary counts, email alerts, the Monday digest and the relationship watch; they stay visible (with the Demo badge) in the Digest and People messages views. | Each demo item restates a real story that is already counted; counting it again inflated "Call this week" from 12 to 35 and would have emailed her duplicates. | Capping demo items' tier (still double-counted). |

## Data quality

| Decision | Why | Rejected alternative |
|---|---|---|
| A deterministic **publisher list** (`lib/publishers.ts`): news sites, wire services, CSR news portals and platforms can never be resolved as the funding company; the funder is the first named company that isn't one. | The prompt rule wasn't enough: "Sportskeeda" (a sports news site) kept becoming a "call", an email alert and a pitch kit. A list is cheap, testable and certain. | Relying only on the prompt. Treating "company name appears in the URL host" as the publisher: wrongly drops companies' own press releases. |

## Pitch kit (job to be done)

| Decision | Why | Rejected alternative |
|---|---|---|
| For companies she is likely to contact (Call / Watch in 14 days, and current relationships): one grounded search for **what they want from CSR**, **recent news**, and **proof** (published outcome metrics). A line is kept only if a Google source supports it; proof lines must contain a number; refreshed every 30 days. Shown under "Job to be done" and on the company profile. | She needs material to convince, but invented metrics (e.g. "NPS +5%") would undermine her credibility. Every line carries its source link. | Generating persuasive metrics without sources. |

## Filters

| Decision | Why | Rejected alternative |
|---|---|---|
| City/state filter on the digest (item geographies), Hiring radar (job location), Community builder and calendar (where the company **spends CSR**, from portal states and districts). | Contacts and announcement cycles have no location of their own; where the company funds CSR is the location that matters for an NGO in Pune. | Filtering contacts by guessed personal location: not available and not appropriate. |
| Calendar geography is India / Maharashtra / Pune district, as URL parameters. | Matches the Funding insights lens and the data on each cycle (latest-year Maharashtra and Pune spend); URL parameters keep the page cacheable and shareable. Past announcements are not filtered, because news rarely says where money will be spent. | A per-city calendar filter: the cycle data has no reliable city-level breakdown beyond Pune. |
| Sector focus chips on company profiles (share of the last 3 reported years) and on calendar entries. | Shows at a glance whether a company funds her sectors, with the portal as the source. | — |

## Team

| Decision | Why | Rejected alternative |
|---|---|---|
| Mentions are in-app only (Team page, "Mentions for you"). | Agreed with the product owner: email adds noise without improving the work. | Email notifications for mentions. |
| Teammates get their own passcodes (scrypt hash only); the lead keeps `INTAKE_PASSCODE`. | Attribution of comments, time and outreach needs identities; no email or phone is needed for that. | Shared passcode (no attribution); third-party auth (a new service). |
| Active time counts only while the tab is visible and used, sent once a minute; unsent seconds survive page loads. | Idle tabs shouldn't inflate time; short visits shouldn't be lost. | Counting tab-open time. |

## Weekly digest email

| Decision | Why | Rejected alternative |
|---|---|---|
| The Monday email adds: partner alerts from the last 7 days (with reasons), regulatory highlights, and the team's week (active minutes, comments, questions, reads, outreach). Cards use the specific headline and the "why it's worth your time" line. | The email is the one place she reads everything at once; it should match the Summary page's priorities. It goes only to `NOTIFY_TO` (her own address), so partner details stay private. | A separate weekly team report. |

## Self-checking (how errors are caught without a developer)

| Decision | Why | Rejected alternative |
|---|---|---|
| A daily **data-quality audit** (`npm run audit`, in `ingest.yml`) with results on the Team page ("Data health"): merges duplicate or unmatched companies; unlinks publishers recorded as funders; removes pitch-kit lines whose cited page doesn't mention the company; hides contacts whose source page doesn't name them. Job links are re-checked daily (`jobs:validate`). | The problems found by hand (duplicate companies, Sportskeeda as a funder, a Tata Elxsi page cited for MediaTek, a closed Trelleborg job marked verified) are all checkable by rules or one cheap call. Running them daily and showing what was fixed makes the system self-correcting and auditable. | Relying on a developer noticing; asking the LLM to "double-check itself" (no ground truth). |
| Company merges: Gemini only **chooses among candidates pulled from the database** (name tokens), at ≥ 0.8 confidence; "same entity" or "corporate foundation of" merges into the CSR Portal record; old names become **aliases** so future news resolves directly. | Aliases fix the cause (future items) as well as the symptom (today's duplicates), and the portal record carries spend and timing, so profiles stop being empty. The first run merged 17 (e.g. MediaTek → MediaTek India Technology Pvt Ltd; AM/NS India → ArcelorMittal Nippon Steel India Ltd; Jindal Stainless Foundation → Jindal Stainless Ltd). | Free-text matching by the model (could invent a company); fuzzy string matching alone (merges different companies that share words). |
| Source check = the cited page's visible text names the company/person (all distinctive words, or the joined form for short names like "AM/NS"), and the company's own website always counts; unreadable pages are left alone. | Catches wrong-page citations without false alarms on short names or blocked sites. The first version wrongly rejected amns.in for "AM/NS India"; it was fixed before kits were regenerated. | Requiring an exact full-name match (misses "AM/NS", "L&T"). |
| A job link is "verified" only if the page text shows the company or the role; a 200 response alone isn't enough. | Aggregators return an empty JavaScript shell for closed jobs (the Trelleborg posting was a 1.9 KB page). | Trusting HTTP status. |

## Speed of answers

| Decision | Why | Rejected alternative |
|---|---|---|
| Team tasks run in their own workflow (`team.yml`), started by the app the moment a question is asked (GitHub `workflow_dispatch`, needs `GITHUB_DISPATCH_TOKEN` in Vercel), with a 5-minute schedule as fallback. Pasted messages trigger `intake.yml` the same way. | The ~10-minute wait was queueing, not computing: the old intake ran every 10 minutes and shared a concurrency group with the 30-minute daily ingest. Retrieval is milliseconds and the Gemini answer ~10 s; a GitHub job starts in ~20-40 s, so ~1-2 minutes end to end. | A vector database: it speeds up retrieval, which isn't the bottleneck, and would add an embeddings model to a Gemini-Flash-only brief. Calling Gemini from Vercel: breaks the brief's "no LLM calls in Vercel" rule. |

## Calendar and UI

| Decision | Why |
|---|---|
| Calendar events: one chip per company per day (other outlets' links kept under it), only real article links (no pasted/demo items, no category or tag pages), "+N more" opens the full list, and Maharashtra / Pune filter **both** the likely companies and the dated announcements (by where the company reports CSR spend). | The same story from several outlets showed as duplicates; pasted items have no public link; listing pages aren't the story; the filter previously only affected one panel, which looked broken. |
| ⓘ explanations render at page level with fixed positioning and stay inside the viewport. | CSS-only popups were clipped by any container that hides overflow (hero cards, calendar cells). |
| Page transitions use React `<ViewTransition>` (fade and lift, ~0.3 s), off under reduced motion. | Smooth without a JS animation library; browsers without the API simply switch pages. |
| The Google "search suggestion" chip opens Google, by design. | Google's grounding terms require showing that chip as a link to the Google search; article titles link to the articles. A caption now says so. |
| Spend-trend alerts say "latest reported year (FY2024-25)" and why it matters now. | The portal publishes a year 12-18 months after it ends; the newest year is the best public signal for the next budget cycle. |

## Geography in scoring

| Decision | Why | Rejected alternative |
|---|---|---|
| Activity in the NGO's sectors but outside Pune/Maharashtra is **not capped**: it can be "Call this week", tagged **Pitch Pune**, with the reason "outside your region (…): a chance to pitch a Pune programme". States bordering Maharashtra get +6 (proximity). Only items outside both the region and the sectors are capped at Watch. | Product-owner guidance: a company funding education or skilling elsewhere is a lead to invite into Pune; proximity makes extension easier. | A hard Watch cap for anything outside the region (tried first; it hid real leads like the ₹5 cr Nellore ITI commitment). |
| One card per story: same company, same signal type, within 3 days → merged, with "Also reported by" links. | The same news from several outlets appeared as duplicate cards and calls. | Fuzzy headline clustering (slower; the company + type + date key is enough here). |
| "Searched on Google this week" lives inside the filterable board and follows its filters. | It ignored the place filter, which looked broken. | — |

## Dependable calls (after the 7.5/10 reassessment)

| Decision | Why | Rejected alternative |
|---|---|---|
| Classifier v7 returns `recommended_action`; **Call this week requires** reach_out_now + a named funder + an NGO partner route + (Pune/Maharashtra, national, or a company that already reports CSR spend in Maharashtra). A failed condition is written into the reason. | The tier contradicted the analysis (e.g. "monitor" advice on an urgent card). Gating on the analysis's own recommendation and on objective facts makes every call explainable and consistent; Maharashtra spend is the objective "credible expansion" test that keeps out-of-region "pitch Pune" leads honest. | More points or penalties (still contradicts); a fixed top-N cap (arbitrary). |
| Good non-urgent leads (action "prepare", named funder) are labelled **Introduce soon** on cards and the Summary. | Strict calls (1 this week) shouldn't hide 8 worthwhile introductions. | Promoting them to Call (the reviewer's false-positive problem). |
| Location points only from places the AI extracted. | The raw-text scan gave Alcobrew a false Pune +20 from a forwarded message's wording. | — |
| Amount forecast = the method with the lower back-test error (now "same as last year"). | The weighted model lost (28.3% vs 25.6%); using it anyway would be knowingly worse. | Keeping the weaker model. |
| Source-quality tiers; proof needs an official or news source. | A broker review site supported a ₹7.6 cr budget claim; an NGO needs evidence a funder would accept. | Accepting any page that mentions the company. |
| A seven-rule consistency test runs daily and on demand. | The reviewer's defects were all rule violations that a test can catch before a person does. | Manual spot checks. |

## Reviewer follow-ups (after the 8.0/10 reassessment)

| Decision | Why | Rejected alternative |
|---|---|---|
| Outside-focus items stay on **Watch** only when the analysis recommends "prepare"; "monitor" or "context" outside her four sectors → **Background**. | Watch filled up with CSR in health, environment etc. that nobody would act on; the analysis's own action already says whether an introduction is worth it. | Dropping outside-focus items entirely (loses the occasional company worth introducing a Pune programme to). |
| Calls are labelled **Open opportunity** (partner search / call for proposals / RFP / EOI) or **Warm lead** (funds the sectors through NGOs; approach for the next cycle), derived from the signal type. | The two need different actions (apply before a deadline vs. introduce the NGO), and the reviewer read a warm lead as an open call. | A separate classifier field (an extra AI judgement for something the signal type already says). |
| Regional expansion is Watch only in Pune / Maharashtra; elsewhere (neighbouring states too) Background. | A furniture plant in Hyderabad is no lead for a Pune NGO; the +6 proximity bonus had kept it on Watch. | Keeping the proximity bonus for expansions (it is meant for CSR activity that could extend to Pune, not for factories). |
| The same-story rule now also applies to the Regulatory page (one card per event, dated by the official release, later articles as coverage), the company profile and the Hiring radar (one entry per company + role). Shared helper `lib/dedupe.ts`. | The digest merged duplicates but the supporting pages did not: five entries for one coal-sector CSR framework launch, three lines for one Alcobrew announcement, two NetApp postings for one role. Dating an event by its official release stops a revisit in October looking like a new September rule. | An AI clustering step (more cost and another model judgement; word overlap plus dates is enough for headlines about one event). Policy headlines use a looser match (2 shared distinctive words, 40%) within 45 days because outlets word the same launch very differently. |
