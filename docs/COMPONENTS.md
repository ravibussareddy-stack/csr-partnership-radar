# Components Map — CSR Partnership Radar

Keep this file current whenever a component is added, changed or removed.

**Status key:** ✅ built · 🟡 partial / minimal · ⬜ not built (TODO)

**Where things run:** _GitHub Actions_ runs ingestion every day at 00:30 UTC (06:00 IST), so data is fresh before the Monday 07:00 IST digest. _Vercel_ only reads from the database. No crawling and no LLM calls happen inside Vercel request handlers.

## Data flow

```
RSS feeds ──► Source adapter ──► raw_items ──► Pre-filter ──► Gemini classifier ──► classifications
 (config)     (robots + rate      (idempotent    (keywords,     (strict JSON, zod,     (cached by
               limit)              by URL)        sectors)       key fallback)          content_hash)
                                                                      │
                                       companies ◄── Entity resolver ◄┘ (minimal: exact name)
                                                                      │
                                                     Scoring (rules, config weights) ──► signals ──► Digest page (/)
```

## Components

| # | Component | Status | Where | What it does | Notes / TODO |
|---|---|---|---|---|---|
| 1 | **Source adapters: RSS** | ✅ Phase 1 | `scripts/ingest/rss.ts`, `scripts/ingest/robots.ts` | Generic RSS/Atom adapter driven by `config.sources`. Checks robots.txt (cached per host), enforces a per-host minimum interval (larger of config and `Crawl-delay`), sets a descriptive User-Agent. | Uses the RSS summary only. Full-article fetch is not built. |
| 1b | Source adapter: Gmail (newsletters / alerts) | ⬜ | — | Pull CSR newsletters and Google Alerts from a mailbox. | TODO(phase-2) |
| 1c | Source adapter: WhatsApp intake | ⬜ | — | Colleagues forward links/messages into the system. | TODO(phase-2) |
| 1d | Source adapter: BRSR / annual report crawler | ⬜ | — | CSR spend and allocation from BRSR filings and annual reports. | TODO(phase-2) |
| 1a | Feed list | ✅ | `config/defaults.ts` → `sources` | India CSR, The CSR Journal (CSR category), Hindu BusinessLine Companies, Mint Companies, ET Corporate Trends. Each was reachable and allowed by robots.txt on 2026-10-11. | Google News RSS is excluded (robots.txt disallows it). Business Standard and PIB returned 403. |
| 2 | **Raw store** | ✅ Phase 1 | `lib/db/schema.ts` → `raw_items` | Stores every fetched item. Unique on `url` (re-runs are no-ops). Keeps a `content_hash` (sha256 of normalised title + body), `prefilter_passed` and `classify_status`. | |
| 3 | **Pre-filter** | ✅ Phase 1 | `lib/prefilter.ts` | Deterministic keyword gate from config: needs a CSR keyword, a CSR-policy keyword, **or** a CSR-focused source. CSR in any sector passes, because outside-sector CSR is kept for review. Set `keywords.requireSectorMatch: true` to also require a focus-sector keyword. Items that fail never reach Gemini. | |
| 4 | **Gemini classifier** | ✅ Phase 1 | `lib/gemini.ts`, `prompts/classify.ts`, `scripts/ingest/classify.ts` | Gemini Flash via REST `generateContent` with `responseSchema`; validated with zod. Prompt v2 keeps all corporate CSR: new initiatives, allocation increases, partner searches, policy changes, and **ongoing programmes / spend reports**. Extracted fields: focus sectors **and** other sectors, companies, geographies, NGO partnering (yes/no/unknown) and partner names, programme start year, amount (₹ crore) and financial year. The cache is keyed by content hash **and** prompt version: after a prompt bump, items in the lookback window are re-classified once. Retries once on invalid JSON. Caches by `content_hash`. Multi-key fallback on 429/quota only, with exponential backoff (3 tries per key). Logs the key **label**, never the value. If every key fails, the item is marked `unclassified` and the run continues; unclassified items are retried on the next run. Non-quota 4xx errors (bad key, bad model id) do **not** fall back: they stop Gemini calls for the run. Capped by `MAX_CLASSIFY_PER_RUN`. | Model id comes from `GEMINI_MODEL`. Prompt version is stored in `classifications.model` as `<model>@<PROMPT_VERSION>`. |
| 5 | Entity resolver | 🟡 minimal | `scripts/ingest/score.ts` (`upsertCompany`) | Exact match of the normalised company name against `companies.canonical_name` / `aliases`; inserts the company if no match. | TODO(phase-2): alias merging, fuzzy matching, MCA CIN lookup. |
| 6 | Dedupe | 🟡 minimal | `raw_items.url` unique, `classifications.content_hash` unique | Same URL is never stored twice. Identical content is never classified twice. | TODO(phase-2): near-duplicate clustering (the same story across outlets). |
| 7 | **Scoring** | ✅ Phase 1 | `lib/scoring.ts`, `scripts/ingest/score.ts` | Deterministic score from signal type + recency + sector fit + geography fit + source weight + NGO-partnering bonus. Programme age and amount appear in the reason (no points). CSR entirely outside the focus sectors is capped at `outsideSectorMaxTier` (Watch, "for review"), with weights and thresholds from config. Gives a tier (Call this week / Watch / Background; items with no signal type are always Background) and a one-line reason built from the rules that fired. Unclassified items get a rules-only score (keyword-inferred type, sectors and geographies), a visible flag, and a tier capped by `unclassifiedMaxTier`. | Re-scored on every run for items in the lookback window, so recency stays correct. |
| 8 | Company state | ⬜ | `companies` table only | Per-company history (last signal, education CSR activity in the last 3 years, warm/cold). | TODO(phase-2): company profiles. |
| 9 | **Config** | ✅ Phase 1 | `config/defaults.ts`, `lib/config.ts` → `config` table | Sectors, geographies, keywords, source list, scoring weights. Seeded from defaults. The DB row is the source of truth, so these can change without a deploy. | TODO: edit UI. For now, edit the row or `config/defaults.ts` and run `npm run db:seed -- --force`. |
| 10 | Feedback loop | ⬜ | — | Ananya marks items useful / not useful / wrong tier; the feedback tunes weights and builds eval labels. | TODO(phase-2): feedback UI. |
| 11 | **Digest delivery: web page** | ✅ Phase 1 | `app/page.tsx` | Monday digest at `/`: last 7 days, grouped by tier, with company, signal type, date, source link, reason, a key-label or "unclassified" badge, and fact chips (outside focus · for review, works with NGOs / in-house, running since YEAR · N yrs, ₹ amount · FY). Renders with an empty DB, with no DB configured, and with unclassified items. | |
| 11b | Digest delivery: email (Monday 07:00 IST) | ⬜ | — | Email the digest every Monday morning. | TODO(phase-2): email delivery. |
| 12 | **Eval harness** | 🟡 scaffold | `evals/labelled.jsonl`, `evals/run.ts` | Runs pre-filter → classifier → scoring on hand-labelled items (no DB needed) and reports precision/recall for `is_signal` and tier accuracy. 10 real items were captured from the live feeds on 2026-10-11. Recency is computed against each row's `as_of`, so results stay stable. Rows labelled `TODO` are skipped. | Labels to be filled in by hand. |
| 13 | Timeline prediction | ⬜ | — | Predict when a company is likely to pick partners. | TODO(later) |
| — | **Ingestion orchestrator** | ✅ Phase 1 | `scripts/ingest/index.ts`, `.github/workflows/ingest.yml` | `npm run ingest`: fetch → store → pre-filter → classify → score. Runs daily on GitHub Actions with secrets. | |

## Database tables

| Table | Purpose |
|---|---|
| `raw_items` | id, source, url (unique), title, body, published_at, content_hash, fetched_at, prefilter_passed, classify_status (`pending`/`filtered_out`/`classified`/`unclassified`) |
| `classifications` | item_id, content_hash (unique), is_signal, signal_type, sectors[], other_sectors[], geographies[], companies[], actively_partnering, partners[], programme_start_year, amount_inr_crore, financial_year, why_it_matters, confidence, model (`<model>@<prompt version>`), key_label, created_at |
| `signals` | one row per item the pipeline treats as a signal (items Gemini says are not signals get no row): item_id (unique), company_id, signal_type, score, tier, reason, classified (bool), created_at, updated_at |
| `companies` | id, canonical_name (unique), aliases[], is_active |
| `config` | id, sectors, geographies, keywords, sources, scoring_weights (jsonb), updated_at |
