import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Fredoka({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"] });
const body = Nunito({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "CSR Partnership Radar",
  description: "Weekly CSR intelligence digest: who to call this week, who is warm, and when companies announce.",
};

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="19" r="11" fill="var(--globe)" />
      <path d="M9 16 C12 13 15 14 15 17 C15 20 11 21 9 16 Z M18 21 C20 19 24 20 24 23 C22 25 19 24 18 21 Z" fill="var(--land)" />
      <path d="M16 8 V14" stroke="var(--stem)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 11 C12 9 9 10 8 12 C11 13 14 12 16 11 Z" fill="var(--leaf)" />
      <path d="M16 9 C19 6 22 6 24 8 C21 10 18 10 16 9 Z" fill="var(--leaf-alt)" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <nav className="nav" aria-label="Main">
          <Link href="/" className="brand">
            <Logo />
            CSR Partnership Radar
          </Link>
          <Link href="/" className="tab">Monday digest</Link>
          <Link href="/calendar" className="tab">CSR calendar</Link>
          <Link href="/planner" className="tab">Expansion planner</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
