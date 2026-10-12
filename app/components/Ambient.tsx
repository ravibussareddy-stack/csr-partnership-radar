"use client";
/**
 * Page-wide client helpers mounted once in the layout:
 *  - Spotlight: a soft light follows the pointer across cards and panels (.glass, .cue, .month-tile).
 *  - Effort tracker: active time on the site and actions (breakdowns opened, company profiles
 *    viewed, messages dropped), kept in this browser (localStorage), shown as "Keep up the good work".
 *    When a team member is signed in, active minutes are also sent once a minute (trackTime) so the
 *    lead can see the team's time on the Team page; signed-out visits send nothing that is stored.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackTime } from "@/app/actions";

const KEY = "csr-radar-effort-v1";
export type EffortDay = { secs: number; opens: number; companies: number; drops: number };
type Store = Record<string, EffortDay>; // yyyy-mm-dd (IST) → counts

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function track(field: keyof EffortDay, by = 1) {
  try {
    const s = read();
    const d = (s[today()] ??= { secs: 0, opens: 0, companies: 0, drops: 0 });
    d[field] += by;
    // keep ~8 weeks
    for (const k of Object.keys(s).sort().slice(0, -56)) delete s[k];
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("radar-effort"));
  } catch {
    /* storage unavailable: analytics are optional */
  }
}

export function weekEffort(): EffortDay {
  const s = read();
  const from = new Date(Date.now() - 6 * 86400_000);
  const fromKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(from);
  const sum: EffortDay = { secs: 0, opens: 0, companies: 0, drops: 0 };
  for (const [k, v] of Object.entries(s)) {
    if (k < fromKey) continue;
    sum.secs += v.secs;
    sum.opens += v.opens;
    sum.companies += v.companies;
    sum.drops += v.drops;
  }
  return sum;
}

export function Ambient() {
  const path = usePathname();

  useEffect(() => {
    if (path.startsWith("/companies/")) track("companies");
  }, [path]);

  useEffect(() => {
    // Active time: count 15 s ticks while the tab is visible and the user was active recently.
    let lastActive = Date.now();
    const bump = () => (lastActive = Date.now());
    // Unsent seconds survive page loads (localStorage), so short visits still count for the team view.
    const UNSENT = "csr-radar-unsent-secs";
    const getUnsent = () => {
      try {
        return Number(localStorage.getItem(UNSENT) ?? 0) || 0;
      } catch {
        return 0;
      }
    };
    const setUnsent = (n: number) => {
      try {
        localStorage.setItem(UNSENT, String(n));
      } catch {
        /* optional */
      }
    };
    const send = () => {
      const s = getUnsent();
      if (s <= 0) return;
      setUnsent(0);
      trackTime(s, window.location.pathname).catch(() => setUnsent(getUnsent() + s));
    };
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActive < 60_000) {
        track("secs", 15);
        setUnsent(getUnsent() + 15);
      }
    }, 15_000);
    send();
    const flush = window.setInterval(send, 60_000);
    ["pointermove", "keydown", "scroll", "touchstart"].forEach((e) => window.addEventListener(e, bump, { passive: true }));

    // Spotlight
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const move = (e: PointerEvent) => {
      if (reduce) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".cue, .glass, .month-tile, .card");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.clearInterval(tick);
      window.clearInterval(flush);
      ["pointermove", "keydown", "scroll", "touchstart"].forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return null;
}
