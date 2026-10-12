// Community builder: people publicly named in CSR news/posts, with outreach tracking.
import { Suspense } from "react";
import { InfoTip } from "@/app/components/InfoTip";
import { Hero, PageBackdrop } from "@/app/components/illustrations";
import { getContacts } from "@/lib/data";
import { ContactBoard } from "./ContactBoard";

export default function Page() {
  return (
    <main className="wrap wide">
      <PageBackdrop variant="network" />
      <Hero eyebrow="Community builder" title="Grow the network" variant="planner">
        CSR heads quoted in announcements, authors of public CSR posts and managers running programmes, found in the news and posts the
        Radar reads. Track who you&rsquo;ve reached out to, who you&rsquo;re connected with, and who didn&rsquo;t work out.{" "}
        <InfoTip text="Only people publicly named in a professional capacity, with their role, organisation and the public source. No personal emails or phone numbers are collected; use 'Find on LinkedIn' to connect yourself. Mark 'Not useful' to hide someone." />
      </Hero>
      <Suspense fallback={<div className="glass card-pad">Loading contacts…</div>}>
        <Board />
      </Suspense>
    </main>
  );
}

async function Board() {
  const list = await getContacts();
  if (list.length === 0) {
    return <div className="notice glass"><h2>No contacts yet</h2><p>They appear after the daily pipeline scans new CSR items for named people.</p></div>;
  }
  return <ContactBoard initial={list.map((c) => ({ ...c, status: c.status as "new" }))} />;
}
