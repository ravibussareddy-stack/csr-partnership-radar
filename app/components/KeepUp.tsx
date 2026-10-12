"use client";
import { useEffect, useState } from "react";
import { weekEffort, type EffortDay } from "./Ambient";

/** "Keep up the good work" with this browser's effort this week (shown only once there is some). */
export function KeepUp({ name, dropsThisWeek }: { name: string; dropsThisWeek: number }) {
  const [e, setE] = useState<EffortDay | null>(null);
  useEffect(() => {
    const load = () => setE(weekEffort());
    queueMicrotask(load);
    window.addEventListener("radar-effort", load);
    return () => window.removeEventListener("radar-effort", load);
  }, []);
  if (!e) return null;
  const mins = Math.round(e.secs / 60);
  const parts = [
    mins > 0 && `${mins} min on the Radar`,
    e.opens > 0 && `${e.opens} breakdown${e.opens === 1 ? "" : "s"} reviewed`,
    e.companies > 0 && `${e.companies} company profile${e.companies === 1 ? "" : "s"} checked`,
    dropsThisWeek > 0 && `${dropsThisWeek} message${dropsThisWeek === 1 ? "" : "s"} dropped in`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="keepup glass-chip">
      <span className="keepup-star" aria-hidden="true">★</span>
      <span><b>Keep up the good work, {name}.</b> This week: {parts.join(" · ")}.</span>
    </div>
  );
}
