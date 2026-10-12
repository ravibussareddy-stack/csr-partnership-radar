"use client";
/**
 * Discussion under an article: team comments with @mentions, and questions to the Radar AI. Questions
 * are answered by the intake workflow, not in the browser or on Vercel, so an answer shows up a few
 * minutes later; the thread polls while a question is open. By default the answer comes only from
 * the Radar's own sources for this article (retrieval, cited [n]); "Also search the web" adds Google.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { loadThread, postComment, type Thread } from "@/app/actions";

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

const SUGGESTIONS = [
  "Who should I contact there, and what's the best angle for our skilling programme?",
  "Has this company funded NGOs in Pune or Maharashtra before? How much?",
  "What do they want to show in their CSR report, and which of our outcomes match?",
];

export function Discussion({ itemId }: { itemId: number }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"comment" | "ask">("ask");
  const [web, setWeb] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    loadThread(itemId).then((t) => alive && setThread(t));
    return () => {
      alive = false;
    };
  }, [itemId]);

  // Poll while a question waits for its answer.
  const waiting = thread?.entries.some((e) => e.kind === "question" && e.status === "open");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => loadThread(itemId).then(setThread), 20000);
    return () => clearInterval(t);
  }, [waiting, itemId]);

  if (!thread) return <p className="muted small">Loading discussion…</p>;
  if (thread.needsUnlock) {
    return (
      <p className="muted small">
        <Link href="/inbox">Sign in</Link> to see your team&rsquo;s comments and ask the Radar about this article.
      </p>
    );
  }

  const send = () => {
    const body = text.trim();
    if (body.length < 2) return;
    start(async () => {
      setThread(await postComment(itemId, body, mode === "ask", web));
      setText("");
    });
  };
  const mention = (name: string) => {
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${name} `);
    setMode("comment");
    box.current?.focus();
  };
  const roots = thread.entries.filter((e) => !e.parentId);
  const replies = (id: number) => thread.entries.filter((e) => e.parentId === id);
  const others = thread.members.filter((m) => m.id !== thread.me?.id);

  return (
    <section className="discussion" aria-label="Discussion">
      <h4>Discussion &amp; questions <span className="muted small">· {roots.length}</span></h4>
      {roots.length === 0 && <p className="muted small">No comments yet. Ask the Radar a question, or tag a teammate.</p>}
      <ol className="thread">
        {roots.map((e) => (
          <li key={e.id} className={`post post-${e.kind}`}>
            <p className="post-meta">
              <b>{e.author ?? "Someone"}</b> {e.kind === "question" ? (e.scope === "web" ? "asked the Radar (with web search)" : "asked the Radar") : "commented"} · {when.format(new Date(e.at))}
            </p>
            <p className="post-body">{highlight(e.body, thread.members.map((m) => m.name))}</p>
            {replies(e.id).map((r) => (
              <div key={r.id} className={`post post-${r.kind} reply`}>
                <p className="post-meta"><b>{r.author}</b> · {when.format(new Date(r.at))}</p>
                <p className="post-body">{r.body}</p>
                {r.sources.length > 0 && (
                  <ul className="research">{r.sources.map((s) => <li key={s.title + s.url}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}</li>)}</ul>
                )}
              </div>
            ))}
            {e.kind === "question" && e.status === "open" && <p className="muted small answering">Radar is researching this… answers usually arrive within 10 minutes.</p>}
            {e.kind === "question" && e.status === "failed" && <p className="muted small">The Radar couldn&rsquo;t answer this one (AI quota). It will retry on the next run.</p>}
          </li>
        ))}
      </ol>
      <div className="composer">
        <div className="composer-mode" role="radiogroup" aria-label="Post as">
          <button type="button" role="radio" aria-checked={mode === "ask"} className={mode === "ask" ? "chip on" : "chip"} onClick={() => setMode("ask")}>Ask the Radar</button>
          <button type="button" role="radio" aria-checked={mode === "comment"} className={mode === "comment" ? "chip on" : "chip"} onClick={() => setMode("comment")}>Comment to team</button>
          {others.length > 0 && <span className="muted small">Tag:</span>}
          {others.map((m) => <button key={m.id} type="button" className="chip" onClick={() => mention(m.name)}>@{m.name}</button>)}
        </div>
        {mode === "ask" && (
          <label className="web-toggle small">
            <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Also search the web{" "}
            <span className="muted">(off: answers only from this article and the Radar&rsquo;s data on this company)</span>
          </label>
        )}
        {mode === "ask" && text === "" && (
          <div className="suggest">{SUGGESTIONS.map((q) => <button key={q} type="button" className="chip" onClick={() => setText(q)}>{q}</button>)}</div>
        )}
        <textarea
          ref={box}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "ask" ? "Ask anything about this article or company…" : "Add a comment; type @Name to tag a teammate"}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send()}
        />
        <button type="button" className="pill-link strong" disabled={pending || text.trim().length < 2} onClick={send}>
          {pending ? "Posting…" : mode === "ask" ? "Ask" : "Post comment"}
        </button>
      </div>
    </section>
  );
}

function highlight(body: string, names: string[]) {
  if (names.length === 0) return body;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "gi");
  return body.split(re).map((part, k) => (k % 2 === 1 ? <mark key={k} className="mention">{part}</mark> : part));
}
