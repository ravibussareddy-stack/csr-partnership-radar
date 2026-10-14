/**
 * npm run health — tells the team when the Radar is not running as intended. Emails NOTIFY_TO only when
 * something is wrong (at most one email per problem per day), so silence means healthy.
 *
 *   npm run health -- --run-failed   one workflow run failed, was cancelled or timed out (the watchdog
 *                                    workflow passes WF_NAME, WF_CONCLUSION, WF_RUN_ID, WF_URL)
 *   npm run health                   daily check:
 *                                    - the digest data was refreshed in the last 26 hours
 *                                    - the last daily run finished, with no failed feeds, no Gemini
 *                                      stop (quota / keys) and no work left over for lack of time
 *                                    - no workflow run failed in the last 24 hours (incl. the
 *                                      10-minute message-drop and team-task runs)
 *                                    - on Mondays, the Monday digest email went out
 *   add --dry-run to print instead of emailing.
 *
 * Runs in GitHub Actions (.github/workflows/watchdog.yml). Needs DATABASE_URL; GITHUB_TOKEN and
 * GITHUB_REPOSITORY (set by Actions) for run details; the Gmail app password used by notify.
 */
import "../env";
import { eq, max } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { modelMetrics, notifications, signals } from "@/lib/db/schema";
import { SUBJECT_TAG, transport } from "../notify/mail";

const SITE = process.env.SITE_URL ?? "https://csr-partnership-radar-two.vercel.app";
const REPO = process.env.GITHUB_REPOSITORY ?? "ravibussareddy-stack/csr-partnership-radar";
const HOUR = 3600_000;
const dryRun = process.argv.includes("--dry-run");

interface Issue {
  title: string;
  detail: string;
  fix: string;
}

async function github<T>(path: string): Promise<T | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(20000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type Job = { name: string; conclusion: string | null; steps?: { name: string; conclusion: string | null }[] };

/** Names of the steps that did not succeed, e.g. "ingest › Run pipeline (cancelled)". */
async function failedSteps(runId: string): Promise<string[]> {
  const r = await github<{ jobs: Job[] }>(`/actions/runs/${runId}/jobs`);
  return (r?.jobs ?? []).flatMap((j) =>
    (j.steps ?? []).filter((s) => s.conclusion && !["success", "skipped"].includes(s.conclusion)).map((s) => `${j.name} › ${s.name} (${s.conclusion})`),
  );
}

const FIX: Record<string, string> = {
  Ingest: "The digest and alerts were not refreshed. Re-run it from GitHub → Actions → Ingest → Run workflow; the log shows the step that failed.",
  "Monday digest email": "The Monday email may not have gone out. Check the Gmail app password secrets, then re-run Actions → Monday digest email.",
  History: "Company history and forecasts were not refreshed this week. Re-run Actions → History.",
  "Message drop intake": "Dropped messages may be waiting. They are retried every 10 minutes; if this repeats, check the Gemini keys.",
  "Team tasks": "Team questions may be waiting for an answer. They are retried every 5 minutes; if this repeats, check the Gemini keys.",
};

async function runFailed(): Promise<{ key: string; issues: Issue[] }> {
  const name = process.env.WF_NAME ?? "A workflow";
  const conclusion = process.env.WF_CONCLUSION ?? "failure";
  const runId = process.env.WF_RUN_ID ?? "";
  const url = process.env.WF_URL ?? `https://github.com/${REPO}/actions`;
  const steps = runId ? await failedSteps(runId) : [];
  const timedOut = steps.some((s) => s.endsWith("(cancelled)")) && conclusion === "cancelled";
  return {
    key: `ops:run:${name}:${new Date().toISOString().slice(0, 10)}`,
    issues: [
      {
        title: `${name} ${conclusion === "cancelled" ? "was cancelled" : conclusion === "timed_out" ? "timed out" : "failed"}`,
        detail: `${steps.length ? `Step${steps.length === 1 ? "" : "s"}: ${steps.join("; ")}. ` : ""}${timedOut ? "Usually the job's time limit. " : ""}Run: ${url}`,
        fix: FIX[name] ?? "Open the run log to see which step failed.",
      },
    ],
  };
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7)}`;
}

async function daily(db: Awaited<ReturnType<typeof getDb>>): Promise<{ key: string; issues: Issue[] }> {
  const now = Date.now();
  const issues: Issue[] = [];

  // 1. Is the digest fresh?
  const [{ last }] = await db.select({ last: max(signals.updatedAt) }).from(signals);
  const ageH = last ? (now - new Date(last).getTime()) / HOUR : Infinity;
  if (ageH > 26) {
    issues.push({
      title: `The digest is stale (last refreshed ${last ? `${Math.round(ageH)} hours ago` : "never"})`,
      detail: "The daily run has not completed scoring since then, so the site and alerts show old data.",
      fix: FIX.Ingest,
    });
  }

  // 2. How did the last daily run go?
  const [run] = await db.select().from(modelMetrics).where(eq(modelMetrics.key, "pipeline-run"));
  const r = run?.data as
    | { finishedAt: string; seconds: number; fetchFailures: number; sources: number; failed: number; deferred: number; geminiStopped: string | null; research: string }
    | undefined;
  if (r && (now - new Date(r.finishedAt).getTime()) / HOUR <= 26) {
    if (r.geminiStopped) {
      issues.push({
        title: "Gemini stopped part-way through the daily run",
        detail: `Reason: ${r.geminiStopped}. Items not analysed were scored by keyword rules only.`,
        fix: "Usually a quota or key problem: check the GEMINI_KEY_* secrets and the keys' quota in Google AI Studio.",
      });
    }
    if (r.deferred > 0 || r.research.startsWith("time budget")) {
      issues.push({
        title: `The daily run ran out of time (${r.deferred} item${r.deferred === 1 ? "" : "s"} left for the next run)`,
        detail: `The run took ${Math.round(r.seconds / 60)} min. Scoring still ran; the rest is picked up tomorrow. Research: ${r.research}.`,
        fix: "Fine once in a while (a heavy news day). If it repeats, raise INGEST_BUDGET_MIN or CLASSIFY_CONCURRENCY (repository variables).",
      });
    }
    if (r.fetchFailures > 0) {
      issues.push({
        title: `${r.fetchFailures} of ${r.sources} news feeds failed to fetch`,
        detail: "Those sites were unreachable or changed their feed; their news is missing today.",
        fix: "Run npm run sources:check to see which feed failed; it is retried tomorrow.",
      });
    }
  }

  // 3. Any failed runs in the last 24 hours (all workflows, including the frequent ones)?
  const since = new Date(now - 24 * HOUR).toISOString();
  const runs = await github<{ workflow_runs: { id: number; name: string; conclusion: string | null; html_url: string }[] }>(
    `/actions/runs?created=>=${since}&per_page=100&status=completed`,
  );
  const bad = (runs?.workflow_runs ?? []).filter((w) => w.name !== "Pipeline watchdog" && ["failure", "cancelled", "timed_out", "startup_failure"].includes(w.conclusion ?? ""));
  const byName = new Map<string, typeof bad>();
  for (const w of bad) (byName.get(w.name) ?? byName.set(w.name, []).get(w.name)!).push(w);
  for (const [name, list] of byName) {
    issues.push({
      title: `${name}: ${list.length} run${list.length === 1 ? "" : "s"} did not complete in the last 24 hours`,
      detail: `Latest: ${list[0].html_url}`,
      fix: FIX[name] ?? "Open the run log to see which step failed.",
    });
  }

  // 4. Mondays: did the digest email go out? (It is sent at 07:00 IST = 01:30 UTC.)
  const d = new Date(now);
  if (d.getUTCDay() === 1 && d.getUTCHours() >= 3) {
    const key = `digest:${isoWeek(d)}`;
    const [sent] = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.key, key));
    if (!sent) {
      issues.push({ title: "The Monday digest email has not been sent this week", detail: `No record for ${key}.`, fix: FIX["Monday digest email"] });
    }
  }
  return { key: `ops:daily:${d.toISOString().slice(0, 10)}`, issues };
}

function html(issues: Issue[]): string {
  const rows = issues
    .map((i) => `<tr><td style="padding:10px 12px;border-left:4px solid #c2462a;background:#fffdf8">
      <div style="font-size:15px;font-weight:700">${esc(i.title)}</div>
      <div style="font-size:13px;color:#5f6a62;margin-top:4px">${esc(i.detail)}</div>
      <div style="font-size:13px;margin-top:4px"><strong>What to do:</strong> ${esc(i.fix)}</div></td></tr><tr><td style="height:8px"></td></tr>`)
    .join("");
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1f2a24;background:#fbf7ee;padding:16px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#128a63;font-weight:700">CSR Partnership Radar · health check</div>
    <h2 style="margin:6px 0 14px">${issues.length} issue${issues.length === 1 ? "" : "s"} need${issues.length === 1 ? "s" : ""} attention</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">${rows}</table>
    <p style="font-size:12px;color:#5f6a62">Runs: <a href="https://github.com/${REPO}/actions">GitHub Actions</a> · Site: <a href="${SITE}">${SITE.replace(/^https:\/\//, "")}</a>. You get this email only when something is wrong.</p>
  </body></html>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  const db = await getDb();
  const { key, issues } = process.argv.includes("--run-failed") ? await runFailed() : await daily(db);
  if (issues.length === 0) {
    console.log("health: all good");
    return;
  }
  for (const i of issues) console.log(`health: ${i.title} — ${i.detail}`);
  const subject = `${SUBJECT_TAG} Health · ${issues.length === 1 ? issues[0].title : `${issues.length} issues: ${issues[0].title}`}`.slice(0, 180);
  if (dryRun) {
    console.log(`health: would send "${subject}"`);
    return;
  }
  const [already] = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.key, key));
  if (already) {
    console.log(`health: already reported today (${key})`);
    return;
  }
  const tr = transport();
  const to = process.env.NOTIFY_TO;
  if (!tr || !to) {
    console.warn("health: email not configured (NOTIFY_TO and a Gmail app password); issues printed above only");
    process.exitCode = 1;
    return;
  }
  const text = [subject, "", ...issues.map((i) => `- ${i.title}\n  ${i.detail}\n  What to do: ${i.fix}`)].join("\n");
  await tr.t.sendMail({ from: `CSR Radar <${tr.from}>`, to, subject, html: html(issues), text });
  await db.insert(notifications).values({ kind: "ops_alert", key, subject }).onConflictDoNothing();
  console.log(`health: sent "${subject}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
