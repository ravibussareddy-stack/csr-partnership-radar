// Monday digest (read-only).
// TODO(phase-2): Monday 07:00 IST email delivery of this digest; feedback buttons per item (feedback loop).
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { TIERS, type Tier } from "@/lib/db/schema";
import { DIGEST_WINDOW_DAYS, loadDigest, type DigestItem } from "@/lib/digest";
import { SIGNAL_LABELS, TIER_LABELS } from "@/lib/scoring";
import { OTHER_SECTORS } from "@/prompts/classify";

const TZ = "Asia/Kolkata";
const fmtDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const fmtDateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ, timeZoneName: "short",
});

const TIER_HINTS: Record<Tier, string> = {
  call_this_week: "Warm. Worth a call before Friday.",
  watch: "Relevant, but not urgent. Also holds CSR outside your focus sectors, for review.",
  background: "Context: ongoing programmes and older activity. Useful for relationship mapping.",
};

// Names come from config defaults; the DB config may add sources later.
const SOURCE_NAMES = new Map(DEFAULT_CONFIG.sources.map((s) => [s.id, s.name]));

/** Monday of the current week, in IST. */
function weekOf(now: Date): string {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const offset = (ist.getDay() + 6) % 7;
  ist.setDate(ist.getDate() - offset);
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(ist);
}

export default function Page() {
  return (
    <main className="wrap">
      <header className="masthead">
        <p className="eyebrow">CSR Partnership Radar</p>
        <h1>Monday digest</h1>
        <p className="sub">
          CSR signals from the last {DIGEST_WINDOW_DAYS} days in education, skill development, digital literacy and
          youth employment, each with a decision.
        </p>
      </header>
      <Suspense fallback={<p className="muted">Loading this week&rsquo;s signals…</p>}>
        <Digest />
      </Suspense>
    </main>
  );
}

async function Digest() {
  await connection(); // always read fresh from the DB at request time
  const now = new Date();
  const data = await loadDigest(now);

  if (data.status === "no_database") {
    return <Notice title="No database configured">Set <code>DATABASE_URL</code> and run <code>npm run ingest</code>.</Notice>;
  }
  if (data.status === "error") {
    return <Notice title="Digest unavailable">{data.message} The next ingestion run will retry.</Notice>;
  }

  const byTier = Object.fromEntries(TIERS.map((t) => [t, data.items.filter((i) => i.tier === t)])) as Record<Tier, DigestItem[]>;
  const unclassified = data.items.filter((i) => !i.classified).length;

  return (
    <>
      <section className="summary" aria-label="Summary">
        <p>
          <strong>Week of {weekOf(now)}</strong>
          {data.lastUpdated && <> · data updated {fmtDateTime.format(data.lastUpdated)}</>}
        </p>
        <ul className="counts">
          {TIERS.map((t) => (
            <li key={t} className={`count tier-${t}`}>
              <span className="n">{byTier[t].length}</span> {TIER_LABELS[t]}
            </li>
          ))}
        </ul>
        {unclassified > 0 && (
          <p className="muted small">
            {unclassified} item{unclassified === 1 ? " was" : "s were"} scored by rules only because Gemini could
            not classify {unclassified === 1 ? "it" : "them"}. Unclassified items are capped at Watch.
          </p>
        )}
      </section>

      {data.items.length === 0 ? (
        <Notice title="No signals this week">
          Nothing in the last {DIGEST_WINDOW_DAYS} days passed the filters. The pipeline runs daily at 06:00 IST.
        </Notice>
      ) : (
        TIERS.map((t) => (
          <section key={t} className={`tier tier-${t}`} aria-labelledby={`h-${t}`}>
            <div className="tier-head">
              <h2 id={`h-${t}`}>
                {TIER_LABELS[t]} <span className="muted">({byTier[t].length})</span>
              </h2>
              <p className="muted small">{TIER_HINTS[t]}</p>
            </div>
            {byTier[t].length === 0 ? (
              <p className="muted small empty">Nothing in this tier this week.</p>
            ) : (
              <ol className="items">
                {byTier[t].map((item) => (
                  <Item key={item.id} item={item} />
                ))}
              </ol>
            )}
          </section>
        ))
      )}
    </>
  );
}

function Item({ item }: { item: DigestItem }) {
  return (
    <li className="item">
      <div className="item-top">
        <span className="company">
          {item.company && item.companyId ? (
            <Link className="company-link" href={`/companies/${item.companyId}`}>{item.company}</Link>
          ) : (
            item.company ?? "Company not identified"
          )}
        </span>
        <span className="chip">{SIGNAL_LABELS[item.signalType]}</span>
        {item.classified ? (
          <span className="badge" title="Gemini key label that classified this item">
            Gemini · {item.keyLabel}
          </span>
        ) : (
          <span className="badge badge-warn" title="Gemini did not classify this item; scored by keyword rules only">
            unclassified
          </span>
        )}
      </div>
      <a className="title" href={item.url} target="_blank" rel="noopener noreferrer">
        {item.title}
      </a>
      {item.whyItMatters && <p className="why">{item.whyItMatters}</p>}
      <Facts item={item} />
      <p className="reason">
        <span className="label">Why this tier:</span> {item.reason}
      </p>
      <p className="meta muted small">
        {fmtDate.format(item.date)} · {SOURCE_NAMES.get(item.source) ?? item.source}
      </p>
    </li>
  );
}

const OTHER_LABELS = new Map<string, string>(OTHER_SECTORS.map((o) => [o.id, o.label]));

function Facts({ item }: { item: DigestItem }) {
  if (!item.classified) return null;
  const year = new Date().getFullYear();
  const facts: { text: string; tone?: "review" | "good" }[] = [];
  if (item.outsideFocus) {
    const labels = item.otherSectors.map((id) => OTHER_LABELS.get(id) ?? id);
    facts.push({ text: `Outside focus${labels.length ? `: ${labels.join(", ")}` : ""} · for review`, tone: "review" });
  }
  if (item.activelyPartnering === "yes") {
    facts.push({ text: `Works with NGOs${item.partners.length ? `: ${item.partners.slice(0, 3).join(", ")}` : ""}`, tone: "good" });
  } else if (item.activelyPartnering === "no") {
    facts.push({ text: "Runs it in-house (no NGO partner mentioned)" });
  } else {
    facts.push({ text: "NGO partnering: not stated" });
  }
  if (item.programmeStartYear) {
    const yrs = year - item.programmeStartYear;
    facts.push({ text: `Running since ${item.programmeStartYear}${yrs > 0 ? ` · ${yrs} yr${yrs === 1 ? "" : "s"} old` : " · new this year"}` });
  }
  if (item.amountInrCrore) {
    facts.push({ text: `₹${item.amountInrCrore.toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr${item.financialYear ? ` · ${item.financialYear}` : ""}` });
  }
  return (
    <ul className="facts">
      {facts.map((f) => (
        <li key={f.text} className={f.tone ? `fact fact-${f.tone}` : "fact"}>
          {f.text}
        </li>
      ))}
    </ul>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="notice" role="status">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
