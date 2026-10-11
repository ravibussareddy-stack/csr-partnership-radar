# CSR Partnership Radar

A weekly CSR intelligence digest for a Pune education NGO. It surfaces new CSR initiatives, allocation increases, explicit NGO partner searches, and CSR policy changes in **education, skill development, digital literacy and youth employment**. Each item ends in a decision: **Call this week**, **Watch** or **Background**, with a one-line reason.

- **AI:** Google Gemini Flash only, via the REST API. The model id comes from `GEMINI_MODEL`.
- **App:** Next.js (App Router) + TypeScript on Vercel. It **only reads** from the database.
- **Data:** Postgres on Neon via Drizzle ORM.
- **Ingestion:** TypeScript scripts in `scripts/ingest/`, run daily by GitHub Actions at 00:30 UTC (06:00 IST).

Components map: [docs/COMPONENTS.md](docs/COMPONENTS.md).

## How it works

```
RSS feeds → raw_items → pre-filter → Gemini classify → score → signals → / (Monday digest)
```

1. **Fetch:** the feeds in `config.sources`. robots.txt is honoured and each host gets at most one request every 2 s (or its `Crawl-delay`). Items are stored by URL, so re-runs are idempotent.
2. **Pre-filter:** a keyword gate from config. Items that fail never reach Gemini.
3. **Classify:** Gemini returns strict JSON (response schema), validated with zod. Results are cached by content hash. On 429 or quota errors the call falls back across keys. If classification fails, the item is marked `unclassified` and the run carries on.
4. **Score:** a deterministic rules engine (signal type, recency, sector fit, geography fit, source weight). It outputs a tier and a reason such as `Partner search +45 · 2d old +15 · Education +10 · Pune +20 · source +6 = 96`.

## Local setup

Requires Node 20+ (22 recommended).

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

- **No Neon account needed for local dev:** set `DATABASE_URL=pglite://./.pglite` to use an embedded Postgres stored in a folder.
- Or paste a Neon connection string.
- Add `GEMINI_KEY_PRIMARY` (from https://aistudio.google.com/apikey). Without a key the pipeline still runs, but every item is unclassified and scored by rules only.

Then:

```bash
npm run db:migrate   # apply Drizzle migrations
npm run db:seed      # write default config (sectors, geos, keywords, feeds, weights)
npm run ingest       # fetch → store → pre-filter → classify → score
npm run dev          # http://localhost:3000
```

> PGlite allows one process at a time. Stop `npm run dev` before running `npm run ingest` against a `pglite://` database.

### Scripts

| Command | What it does |
|---|---|
| `npm run ingest` | Full pipeline. Flags: `--refilter` (re-run the pre-filter on the lookback window after keyword changes), `--no-fetch` (re-classify and re-score only). |
| `npm run eval` | Runs the pipeline on `evals/labelled.jsonl` and reports precision/recall of `is_signal` and tier accuracy. `--db-config` uses the DB config instead of defaults. |
| `npm run sources:check [-- <feed-url> …]` | Verify feeds (robots.txt, reachability, freshness, pre-filter yield) before adding them. |
| `npm run history:import -- <csv>` | Import the National CSR Portal "Dynamic CSR Report" CSV (FY2014-15 onward). |
| `npm run history:aliases` | Set company short names (manual list in `config/aliases.ts` + Gemini proposals, collision-checked). |
| `npm run history:news` | Backfill dated CSR headlines per company from CSR news archives (`-- --aliases-only` to search only aliases). |
| `npm run history:classify-news` | Batch-classify those headlines with Gemini (80 per call). |
| `npm run history:stats` | Recompute company history, forecasts and announcement timing. |
| `npm run db:generate` | Generate a new migration after editing `lib/db/schema.ts`. |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:seed` | Insert default config if missing (`-- --force` overwrites the row). |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript. |

## 10-year history and forecasts

The **Expansion planner** (`/planner`) and **company profiles** (`/companies/[id]`) use two historical sources:

1. **National CSR Portal** (MCA): company-wise CSR spend by FY, state, district and sector, FY2014-15 to FY2024-25. The portal's company-wise reports are behind a CAPTCHA, so download the "Dynamic CSR Report" CSV from https://www.csr.gov.in by hand, then:
   ```bash
   npm run history:import -- ~/Downloads/Dynamic_CSR_Report_YYYY-MM-DD.csv
   ```
   The CSV (about 130 MB) is not committed. Re-import once a year when a new FY appears.
2. **CSR news archives** (India CSR since 2009, The CSR Journal since 2014, CSR Times since 2019) through their public WordPress REST APIs: dated headlines per company, classified in batches by Gemini.
   ```bash
   npm run history:news && npm run history:classify-news && npm run history:stats
   ```
   The weekly `history.yml` workflow keeps this fresh.

Forecasts are deterministic and explained on each page (see `lib/history/predict.ts`).

## Configuration

Defaults live in [`config/defaults.ts`](config/defaults.ts) and are seeded into the single-row `config` table. After seeding, **the DB row is the source of truth**, so sectors, geographies, keywords, feeds and scoring weights can change without a deploy. To reset the row to the defaults: `npm run db:seed -- --force`, then `npm run ingest -- --refilter`.

Environment variables (see [`.env.example`](.env.example)):

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string, or `pglite://<dir>` locally. |
| `GEMINI_MODEL` | yes for classification | For example `gemini-3.8-flash`. |
| `GEMINI_KEY_PRIMARY` | yes for classification | |
| `GEMINI_KEY_FALLBACK_1..N` | no | Used only after 429 or quota errors. Number them with no gaps. |
| `MAX_CLASSIFY_PER_RUN` | no | Caps Gemini calls per run (default 60). |

Logs show which **key label** (`primary`, `fallback_1`, …) served each call, never the key itself.

## Deploy

### 1. Database (Neon)
Create a Neon project (the free tier is enough) and copy the pooled connection string. Then run `DATABASE_URL=... npm run db:migrate` once, or let the workflow do it.

### 2. GitHub Actions (ingestion)
Repo → Settings → Secrets and variables → Actions:
- **Secrets:** `DATABASE_URL`, `GEMINI_KEY_PRIMARY`, optional `GEMINI_KEY_FALLBACK_1`, `GEMINI_KEY_FALLBACK_2`.
- **Variables (optional):** `GEMINI_MODEL` (defaults to `gemini-3.8-flash` in the workflow), `MAX_CLASSIFY_PER_RUN`.

The workflow [`.github/workflows/ingest.yml`](.github/workflows/ingest.yml) runs daily at 00:30 UTC and can be triggered manually (Actions → Ingest → Run workflow).

To move existing local data into Neon without re-crawling (keeps ids):
```bash
SOURCE_DATABASE_URL=pglite://./.pglite TARGET_DATABASE_URL="<neon url>" npm run db:copy
```

### 3. Vercel (digest page)
Import the repo into Vercel and set **only** `DATABASE_URL` (the app needs no Gemini keys). `vercel.json` pins functions to Singapore (`sin1`), next to the Neon database (aws-ap-southeast-1; Mumbai isn't offered for this Neon org). The page renders fresh from the DB on every request.

## Not built yet (later phases)

Gmail adapter, WhatsApp intake, BRSR crawler, full entity resolver, company profiles, feedback UI, timeline prediction, and Monday email delivery. Each is marked `TODO(phase-2)` in code and tracked in [docs/COMPONENTS.md](docs/COMPONENTS.md).
