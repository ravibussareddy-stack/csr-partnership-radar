// Team: who is on the team, their active time this week, what they did (comments, questions, reads,
// not-relevant marks, outreach), mentions, and the dashboard feedback queue. Team-only, never cached.
import { PageTransition } from "@/app/components/PageTransition";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { InfoTip } from "@/app/components/InfoTip";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { currentMember } from "@/lib/session";
import { loadTeam } from "@/lib/team";
import { AddMember, MemberToggle, ReviewFeedback, SignOut } from "./TeamForms";

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const mins = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const KIND_LABEL: Record<string, string> = {
  comment: "comments", question: "questions", read: "read", irrelevant: "not relevant", contact: "outreach updates", dashboard_feedback: "dashboard feedback", sector: "sector changes", team: "team changes", answer: "answers received",
};
const FB_STATUS: Record<string, string> = { new: "Waiting for Ananya", confirmed: "Confirmed · being triaged", declined: "Declined", applied: "Applied", routed: "Sent to developer / designer", failed: "Failed" };

export default function Page() {
  return (
    <PageTransition>
    <main className="wrap wide">
      <PageBackdrop variant="team" />
      <Hero eyebrow="Team" title="What the team is working on" variant="planner" poster="team">
        Time spent, comments and questions, outreach and feedback, for everyone on the partnerships team.{" "}
        <InfoTip text="Active time counts only while a signed-in teammate has the Radar open and is using it (idle tabs don't count). Activity comes from actions in the app: comments, questions to the Radar, read / not-relevant marks, Community builder updates, sectors and dashboard feedback." />
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading the team…</div>}>
        <Body />
      </Suspense>
    </main>
    </PageTransition>
  );
}

async function Body() {
  await connection();
  const me = await currentMember();
  if (!me) {
    return <div className="notice glass"><h2>Sign in to see the team</h2><p><Link href="/inbox">Sign in on People messages</Link> with your name and passcode.</p></div>;
  }
  const { members, feed, mentions, feedback, quality } = await loadTeam(me.id);
  const lead = me.role === "lead";
  const waiting = feedback.filter((f) => f.status === "new");
  return (
    <>
      <p className="muted">Signed in as <b>{me.name}</b>{lead ? " (team lead)" : ""} · <SignOut /></p>
      <section className="section" aria-labelledby="h-members">
        <h2 id="h-members" className="section-title">Team <span className="muted">· {members.filter((m) => m.active).length} active</span></h2>
        <div className="member-grid">
          {members.map((m) => (
            <article key={m.id} className={`glass card-pad member spot${m.active ? "" : " inactive"}`}>
              <header className="cue-head">
                <span className="avatar" aria-hidden="true">{m.name.slice(0, 1)}</span>
                <div className="cue-who">
                  <span className="cue-company">{m.name}</span>
                  <span className="cue-type">{m.role === "lead" ? "Team lead" : "Member"}{m.lastSeenAt ? ` · last seen ${when.format(new Date(m.lastSeenAt))}` : " · not signed in yet"}</span>
                </div>
              </header>
              <p className="member-time"><b>{mins(m.weekSecs)}</b> this week · {mins(m.todaySecs)} today</p>
              {m.topPages.length > 0 && <p className="muted small">Mostly on: {m.topPages.map(([p, s]) => `${p} (${mins(s)})`).join(", ")}</p>}
              <ul className="facts">
                {Object.entries(m.week).map(([k, n]) => <li key={k} className="fact">{n} {KIND_LABEL[k] ?? k}</li>)}
                {Object.keys(m.week).length === 0 && <li className="fact">No activity this week</li>}
              </ul>
              {lead && m.role !== "lead" && <MemberToggle id={m.id} active={m.active} />}
            </article>
          ))}
          {lead && <div className="glass card-pad member"><AddMember /></div>}
        </div>
      </section>

      <div className="two-col">
        <section className="section" aria-labelledby="h-feed">
          <h2 id="h-feed" className="section-title">Recent activity</h2>
          {feed.length === 0 ? <p className="muted">Nothing yet.</p> : (
            <ol className="feed glass card-pad">
              {feed.map((f) => (
                <li key={f.id}>
                  <span><b>{f.who}</b> · {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.summary}</a> : f.summary}</span>
                  <span className="muted small">{when.format(new Date(f.at))}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="section" aria-labelledby="h-mentions">
          <h2 id="h-mentions" className="section-title">Mentions for you</h2>
          {mentions.length === 0 ? <p className="muted">No one has tagged you yet.</p> : (
            <ol className="feed glass card-pad">
              {mentions.map((m) => (
                <li key={m.id}>
                  <span>{m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.summary}</a> : m.summary}</span>
                  <span className="muted small">{when.format(new Date(m.at))}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="section" aria-labelledby="h-dq">
        <h2 id="h-dq" className="section-title">
          Data health {quality && <span className="muted small">· audited {when.format(new Date(quality.ranAt))}</span>}
          <InfoTip text="A daily automatic audit, so data problems are caught without a developer: it merges duplicate or unmatched companies into their CSR Portal record (keeping the old names as aliases), unlinks news sites recorded as funders, removes pitch-kit lines whose cited page doesn't mention the company, hides contacts whose source page doesn't name them, and re-checks job links. Each fix is listed here with examples." />
        </h2>
        {!quality ? <p className="muted">The first audit runs with tonight&rsquo;s pipeline.</p> : (
          <div className="dq-grid">
            {quality.checks.map((c) => (
              <article key={c.id} className="glass card-pad dq">
                <p className="small"><b>{c.label}</b></p>
                {c.id.startsWith("consistency_") ? (
                  <p className="dq-num">{c.found === 0 ? <><b>✓</b> passed</> : <><b>{c.found}</b> to review</>} <span className="muted small">· {c.checked} checked</span></p>
                ) : (
                  <p className="dq-num"><b>{c.fixed}</b> fixed <span className="muted small">of {c.checked} checked</span></p>
                )}
                {c.examples.length > 0 && <ul className="dq-ex">{c.examples.slice(0, 4).map((e) => <li key={e}>{e}</li>)}</ul>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="h-fb">
        <h2 id="h-fb" className="section-title">
          Dashboard feedback {waiting.length > 0 && <span className="badge-warn">{waiting.length} to review</span>}
          <InfoTip text="Feedback from the box at the bottom of every page. Ananya confirms or declines it. Confirmed feedback is triaged by Gemini on the next intake run: if a settings change can handle it (keywords, saved searches, followed pages, scoring weights within ±30%, the text size of the whole site between 90% and 125%), it is applied and listed here; otherwise it is written up as a developer or designer request, listed here in full and emailed with a [CSR Radar] Dev / Design request subject (to DEV_NOTIFY_TO / DESIGN_NOTIFY_TO if set, else NOTIFY_TO)." />
        </h2>
        {feedback.length === 0 ? <p className="muted">No feedback yet. Use the box at the bottom of any page.</p> : (
          <ol className="fb-list">
            {feedback.map((f) => (
              <li key={f.id} className={`glass card-pad fb fb-${f.status}`}>
                <p className="small"><span className={`fb-kind fb-${f.kind}`}>{f.kind === "pro" ? "👍 Works well" : f.kind === "con" ? "👎 Problem" : "💡 Idea"}</span> · {f.page} page · {f.by} · {when.format(new Date(f.createdAt))}</p>
                <p>{f.body}</p>
                <p className="small"><b>{FB_STATUS[f.status]}</b>{f.route ? ` · ${f.route}` : ""}</p>
                {f.resolution && <p className="small fb-resolution">{f.resolution}</p>}
                {lead && f.status === "new" && <ReviewFeedback id={f.id} />}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
