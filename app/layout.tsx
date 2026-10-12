import type { Metadata } from "next";
import { Nunito, Outfit } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Ambient } from "./components/Ambient";
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
  { href: "/calendar", label: "CSR calendar", d: "M5 6 H19 V20 H5 Z M5 10 H19 M9 3 V7 M15 3 V7" },
  { href: "/funding", label: "Funding insights", d: "M5 19 V12 M10 19 V8 M15 19 V11 M20 19 V5 M3 19 H21" },
  { href: "/jobs", label: "Hiring radar", d: "M4 8 H20 V19 H4 Z M9 8 V5 H15 V8 M4 13 H20" },
  { href: "/community", label: "Community builder", d: "M8 11 A3 3 0 1 0 8.01 11 Z M16 11 A3 3 0 1 0 16.01 11 Z M3 20 C3 16 13 16 13 20 M11 20 C11 16 21 16 21 20" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
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
        <div className="content">{children}</div>
        <Suspense fallback={null}>
          <Ambient />
        </Suspense>
      </body>
    </html>
  );
}
