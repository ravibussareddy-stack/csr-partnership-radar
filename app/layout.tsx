import type { Metadata } from "next";
import { Nunito, Outfit } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Ambient } from "./components/Ambient";
import { DisplaySettings } from "./components/DisplaySettings";
import { FeedbackBox } from "./components/FeedbackBox";
import "./globals.css";

const display = Outfit({ subsets: ["latin"], variable: "--font-display", weight: ["300", "400", "500", "600"] });
const body = Nunito({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "CSR Partnership Radar",
  description: "Weekly CSR intelligence digest: who to call this week, who is warm, and when companies announce.",
};

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" width="30" height="30">
      <circle cx="16" cy="19" r="11" fill="var(--globe)" />
      <path d="M9 16 C12 13 15 14 15 17 C15 20 11 21 9 16 Z M18 21 C20 19 24 20 24 23 C22 25 19 24 18 21 Z" fill="var(--land)" />
      <path d="M16 8 V14" stroke="var(--stem)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 11 C12 9 9 10 8 12 C11 13 14 12 16 11 Z" fill="var(--leaf)" />
      <path d="M16 9 C19 6 22 6 24 8 C21 10 18 10 16 9 Z" fill="var(--leaf-alt)" />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "1 · Summary", d: "M4 5 H20 V9 H4 Z M4 12 H11 V19 H4 Z M14 12 H20 V19 H14 Z" },
  { href: "/digest", label: "2 · Digest", d: "M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z" },
  { href: "/inbox", label: "3 · People messages", d: "M4 6 H20 V16 H13 L8 20 V16 H4 Z" },
  { href: "/relationships", label: "Relationships", d: "M8 12 L11 15 L16 9 M4 12 C4 7 8 4 12 4 C16 4 20 7 20 12 C20 17 16 20 12 20 C8 20 4 17 4 12 Z" },
  { href: "/regulatory", label: "Regulatory", d: "M4 9 L12 4 L20 9 Z M6 10 V17 M10 10 V17 M14 10 V17 M18 10 V17 M4 19 H20" },
  { href: "/calendar", label: "CSR calendar", d: "M5 6 H19 V20 H5 Z M5 10 H19 M9 3 V7 M15 3 V7" },
  { href: "/funding", label: "Funding insights", d: "M5 19 V12 M10 19 V8 M15 19 V11 M20 19 V5 M3 19 H21" },
  { href: "/jobs", label: "Hiring radar", d: "M4 8 H20 V19 H4 Z M9 8 V5 H15 V8 M4 13 H20" },
  { href: "/questions", label: "Questions & answers", d: "M9 9 C9 6 15 6 15 9 C15 11 12 11 12 14 M12 17.5 V18 M4 4 H20 V16 H13 L8 20 V16 H4 Z" },
  { href: "/results", label: "Results", d: "M4 20 V10 M10 20 V4 M16 20 V13 M3 20 H21 M14 7 L17 4 L20 7" },
  { href: "/feedback", label: "Feedback log", d: "M5 4 H19 V20 H5 Z M8 8 H16 M8 12 H16 M8 16 H13" },
  { href: "/team", label: "Team", d: "M9 10 A3 3 0 1 0 9.01 10 Z M4 20 C4 15 14 15 14 20 M16 7 A2.5 2.5 0 1 0 16.01 7 Z M15 13 C19 13 21 15 21 18" },
  { href: "/community", label: "Community builder", d: "M8 11 A3 3 0 1 0 8.01 11 Z M16 11 A3 3 0 1 0 16.01 11 Z M3 20 C3 16 13 16 13 20 M11 20 C11 16 21 16 21 20" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Suspense fallback={null}>
          <DisplaySettings />
        </Suspense>
        <div className="backdrop" aria-hidden="true">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <span className="beam" />
        </div>
        <nav className="rail glass" aria-label="Main">
          <Link href="/" className="rail-logo" aria-label="CSR Partnership Radar home"><Logo /></Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rail-item" aria-label={n.label} title={n.label}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={n.d} /></svg>
              <span className="rail-label">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="content">
          {children}
          <Suspense fallback={null}>
            <FeedbackBox />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <Ambient />
        </Suspense>
      </body>
    </html>
  );
}
