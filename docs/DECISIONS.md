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
