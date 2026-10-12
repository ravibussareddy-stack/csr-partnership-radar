"use client";
import { useState } from "react";

const PALETTE = ["#1baf7a", "#eb6834", "#2a78d6", "#d55181", "#c98500", "#4a3aa7", "#199e70", "#e34948"];

function initials(name: string): string {
  const words = name.replace(/\b(limited|ltd|private|pvt|india|foundation|the)\b/gi, "").trim().split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
}

/** Company logo from its website favicon; a coloured monogram when unknown or it fails to load. */
export function Logo({ name, domain, size = 44 }: { name: string; domain: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const color = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  if (domain && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="logo"
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          // Google returns a 16px globe for unknown domains; treat tiny icons as missing.
          if ((e.target as HTMLImageElement).naturalWidth < 32) setFailed(true);
        }}
      />
    );
  }
  return (
    <span className="logo monogram" style={{ width: size, height: size, background: color }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
