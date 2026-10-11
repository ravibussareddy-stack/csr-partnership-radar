# Components Map — CSR Partnership Radar

Keep this file current whenever a component is added, changed or removed.

**Status key:** ✅ built · 🟡 partial / minimal · ⬜ not built (TODO)

**Where things run:**
- **GitHub Actions** runs two scheduled workflows:
  - `ingest.yml`, daily at 00:30 UTC (06:00 IST): live feeds, then classify, score and stats.
  - `history.yml`, weekly on Sunday at 21:30 UTC (Monday 03:00 IST): news-archive history, headline classification and stats.
- **Vercel** only reads from the database. No crawling and no LLM calls happen inside Vercel request handlers.
- **Manual, about once a year:** import the National CSR Portal report. The portal is behind a CAPTCHA, so the CSV is downloaded by hand.

## Data flow

```
LIVE (daily)
RSS feeds ─► Source adapter ─► raw_items ─► Pre-filter ─► Gemini classifier ─► classifications
 (config)    (robots, rate      (by URL)     (CSR/policy    (strict JSON, zod,     (content_hash +
              limit, paging)                  keywords)      key fallback)          prompt version)
                                                                   │
                         companies ◄── Entity resolver ◄───────────┘
                                                                   │
                                Scoring (rules, config) ─► signals ─► Digest page (/)
                                                                   └─► company_news (dated, typed)

HISTORY
National CSR Portal CSV ─► history:import ─► companies (62k official names) + csr_spend (FY2014-25)
CSR news WP archives ─► history:news ─► company_news ─► history:classify-news (80 headlines/call)
csr_spend + company_news ─► history:stats ─► company_stats (history + forecasts + timing)
                                              └─► /companies/[id] profile · /planner
```

## Components

| # | Component | Status | Where | What it does | Notes / TODO |
|---|---|---|---|---|---|
| 1 | **Source adapters: RSS** | ✅ | `scripts/ingest/rss.ts`, `scripts/ingest/robots.ts` | Generic RSS/Atom adapter driven by `config.sources`. Checks robots.txt (cached per host) and enforces a per-host minimum interval (the larger of 2 s and `Crawl-delay`). WordPress feeds can be paged (`pages`, `?paged=N`) because they show only the newest 10 posts. | Uses the RSS summary only. Full-article fetch is not built. |
| 1a | Feed list | ✅ | `config/defaults.ts` → `sources`, `npm run sources:check` | India CSR (5 pages), The CSR Journal CSR category (2 pages), CSR Mandate, CSR Times, Hindu BusinessLine Companies, Mint Companies, ET Corporate Trends. All verified with `sources:check` on 2026-10-11. | Rejected: Google News (robots.txt), Business Standard and PIB (403), thecsrupdates.com (timeout), education-news feeds (no CSR items). |
| 1b | Source adapter: Gmail (newsletters / alerts) | ⬜ | — | Pull CSR newsletters and Google Alerts from a mailbox. | TODO(phase-2) |
| 1c | Source adapter: WhatsApp intake | ⬜ | — | Colleagues forward links and messages into the system. | TODO(phase-2) |
| 1d | **National CSR Portal import** | ✅ | `scripts/history/import-portal.ts` (`npm run history:import -- <csv>`) | Imports the portal's "Dynamic CSR Report" CSV: company × FY × state × district × development sector × ₹ crore spent, FY2014-15 to FY2024-25 (758k lines, 71k company names). Zero-amount lines are skipped. Full refresh. | The portal is CAPTCHA-gated, so the CSV is downloaded by hand and not committed to git. Re-import when a new FY is published. |
| 1e | **CSR news archive backfill** | ✅ | `scripts/history/news.ts` (`npm run history:news`) | For the top companies by focus-sector spend (India and Maharashtra) plus every digest company, searches the WordPress REST archives of India CSR (since 2009), The CSR Journal (since 2014) and CSR Times (since 2019). Keeps headlines that name the company, with their dates. Respects robots.txt and per-host rate limits. | csrmandate.org is excluded (it answers non-browser clients with HTTP 444). `HISTORY_NEWS_TOP` sets how many companies (default 150 per ranking). |
| 1f | Financial disclosures (net profit → statutory CSR budget) | ⬜ | — | CSR obligation is 2% of the average net profit of the last 3 years (Section 135). With MCA financial statements (AOC-4 XBRL fields such as `NetProfitComputedUnderSection198…` and `CSRExpenditureProvision`) the next-year budget could be forecast from profits. | TODO: needs a data source with per-company profits. The company master files received so far hold no financial fields and cover Madhya Pradesh only. |
| 1g | BRSR / annual report crawler | ⬜ | — | CSR spend and plans from BRSR filings (FY22-23 onward, top 1,000 listed companies). | TODO(phase-2) |
| 2 | **Raw store** | ✅ | `raw_items` | Stores every fetched item. Unique on `url`, so re-runs are no-ops. Keeps a `content_hash`, `prefilter_passed` and `classify_status`. | |
| 3 | **Pre-filter** | ✅ | `lib/prefilter.ts` | Deterministic keyword gate from config: passes items with a CSR keyword, a CSR-policy keyword, **or** from a CSR-focused source. CSR in any sector passes, so outside-sector CSR is kept for review. `keywords.requireSectorMatch: true` also requires a focus-sector keyword. Items that fail never reach Gemini. | |
| 4 | **Gemini classifier (articles)** | ✅ | `lib/gemini.ts`, `lib/classifier.ts`, `prompts/classify.ts`, `scripts/ingest/classify.ts` | Gemini Flash via REST `generateContent` with a strict `responseSchema`, validated with zod; invalid JSON gets one retry. Prompt v2 keeps all corporate CSR, including ongoing programmes and spend reports. It extracts focus and other sectors, companies, geographies, NGO partnering (yes/no/unknown) with partner names, programme start year, amount (₹ crore) and FY. Results are cached by content hash **and** prompt version. Multi-key fallback on 429/quota only, with exponential backoff (3 tries per key). Logs show the key **label**, never the value. If every key fails, the item is marked `unclassified` and retried next run. Capped by `MAX_CLASSIFY_PER_RUN`. | Model id from `GEMINI_MODEL`. Stored as `<model>@<prompt version>`. A non-quota 4xx (bad key or model) stops Gemini calls for the run and doesn't fall back. |
| 4b | **Gemini classifier (headlines, batched)** | ✅ | `prompts/headlines.ts`, `scripts/history/classify-news.ts` | Classifies archive headlines 80 per call into kind (new initiative / partnership / spend-allocation / partner search / ongoing activity / not CSR) and sector (focus or other), so timing counts real announcements only. | Capped by `HEADLINE_MAX_CALLS`. |
| 5 | **Entity resolver** | 🟡 | `lib/companies.ts`, `scripts/ingest/score.ts` (`resolveCompany`) | Normalised name keys (Pvt/Ltd/& folded), matched against 62k official portal names and aliases. Falls back to a unique match with legal suffixes removed ("Hindustan Zinc" → "Hindustan Zinc Limited"); otherwise creates a news-origin company. | TODO: fuzzy matching, CIN, group/parent mapping (a foundation vs its company). |
| 6 | Dedupe | 🟡 | `raw_items.url`, `classifications.content_hash`, `company_news (company, url)` | The same URL is never stored twice, and identical content isn't classified twice per prompt version. | TODO: near-duplicate clustering (the same story across outlets). |
| 7 | **Scoring** | ✅ | `lib/scoring.ts`, `scripts/ingest/score.ts` | Deterministic score from signal type, recency, sector fit, geography fit, source weight and an NGO-partnering bonus. Programme age and amount appear in the reason without points. Outside-sector CSR is capped at Watch ("for review"); unclassified items at Watch; items with no signal type go to Background. Each item gets a tier and a one-line reason built from the rules that fired. | Re-scored every run within the lookback window. |
| 8 | **Company state / history** | ✅ | `scripts/history/stats.ts` → `company_stats` | Per company: spend by FY (total, focus, projects, Maharashtra, Pune), sectors and districts over the last 3 FYs, and links to digest items and announcements. Covers companies with ≥ ₹1 cr in the last 3 FYs plus every digest company (about 9.2k). | `HISTORY_MIN_RECENT_CR` sets the threshold. |
| 9 | **Config** | ✅ | `config/defaults.ts`, `lib/config.ts` → `config` | Sectors (with portal-sector mapping), geographies, keywords, sources and scoring weights. The DB row is the source of truth; fields added later are filled from defaults. | TODO: edit UI. |
| 10 | Feedback loop | ⬜ | — | Ananya marks items useful / not useful / wrong tier, and the feedback tunes weights and adds eval labels. | TODO(phase-2) |
| 11 | **Digest page** | ✅ | `app/page.tsx` | Monday digest at `/`: last 7 days grouped by tier. Shows company (linked to its profile), signal type, date, source link, reason, key-label or "unclassified" badge, and fact chips (outside focus · for review, works with NGOs / in-house, running since YEAR, ₹ amount · FY). | |
| 11b | Digest delivery: email (Monday 07:00 IST) | ⬜ | — | Email the digest every Monday morning. | TODO(phase-2) |
| 12 | Eval harness | 🟡 | `evals/labelled.jsonl`, `evals/run.ts` | Precision/recall of `is_signal` and tier accuracy on 10 hand-labelled live items. | Labels to be filled in by hand. |
| 13 | **Timeline & amount prediction** | ✅ | `lib/history/predict.ts`, `scripts/history/stats.ts` | **Amounts:** next-FY total and focus-sector spend = weighted average of the last 3 FYs (20/30/50) × capped growth (±25%), with a range; project count likewise. **Sector odds:** Laplace-smoothed share of the last 5 FYs with spend in each sector. **Timing:** busiest 3-month window of the company's dated announcements (≥ 4 events), otherwise the all-company pattern, with the next window start date and pattern strength (clear ≥ 45%, mild ≥ 33%, uniform = 25%). | Deterministic, no LLM. TODO: profit-based budget (1f), backtesting. |
| 14 | **Company profile** | ✅ | `app/companies/[id]/page.tsx` | 11-year chart (focus vs other sectors) with a forecast bar, forecast cards, next announcement window, sector odds, top districts, monthly announcement strip, digest items and recent announcements. | |
| 15 | **Expansion planner** | ✅ | `app/planner/page.tsx` | Pune and Maharashtra spend trends (focus vs other), announcement seasonality by sector (focus and outside sectors), and a ranked company table sortable by Maharashtra focus spend, Pune spend, forecast focus spend or forecast total, with search. | |
| — | **Ingestion orchestrator** | ✅ | `scripts/ingest/index.ts`, `.github/workflows/*.yml` | `npm run ingest` runs fetch → store → pre-filter → classify → score. Workflows add stats daily and history weekly. | |

## Database tables

| Table | Purpose |
|---|---|
| `raw_items` | id, source, url (unique), title, body, published_at, content_hash, fetched_at, prefilter_passed, classify_status |
| `classifications` | item_id, content_hash (unique), is_signal, signal_type, sectors[], other_sectors[], geographies[], companies[], actively_partnering, partners[], programme_start_year, amount_inr_crore, financial_year, why_it_matters, confidence, model, key_label, created_at |
| `signals` | item_id (unique), company_id, signal_type, score, tier, reason, classified, created_at, updated_at. Only items the pipeline treats as signals get a row. |
| `companies` | id, canonical_name (unique), aliases[], is_active, name_key (unique), base_key, is_psu, origin (`portal`/`news`) |
| `csr_spend` | company_id, fy_start, state, district, sector, sub_sector, amount_cr (National CSR Portal) |
| `company_news` | company_id, source, url, title, published_at, kind, sector, model (unique on company + url) |
| `company_stats` | company_id, last_fy, years_active, total/focus/Maharashtra-focus/Pune last-FY ₹ cr, predicted total/focus ₹ cr, data (jsonb: by-year, sectors, odds, districts, prediction, timing) |
| `config` | id, sectors, geographies, keywords, sources, scoring_weights (jsonb), updated_at |
