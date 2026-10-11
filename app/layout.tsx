import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSR Partnership Radar",
  description: "Weekly CSR intelligence digest: who to call this week.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav wrap wide" aria-label="Main">
          <Link href="/" className="brand">CSR Partnership Radar</Link>
          <Link href="/">Monday digest</Link>
          <Link href="/planner">Expansion planner</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
