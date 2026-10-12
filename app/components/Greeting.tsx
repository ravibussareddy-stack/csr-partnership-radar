"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function partOfDay(): string {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Time-of-day greeting in IST, resolved in the browser so cached pages greet correctly. */
export function Greeting({ name }: { name: string }) {
  const hello = useSyncExternalStore(subscribe, partOfDay, () => "Hello");
  return <h1 className="greeting">{hello}, {name}</h1>;
}
