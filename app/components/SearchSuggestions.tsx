"use client";
import { useEffect, useRef } from "react";

/**
 * Google's Search Suggestions (grounding searchEntryPoint) rendered unmodified, as the grounding
 * terms require, inside a shadow root so its CSS can't leak into (or be broken by) the page.
 */
export function SearchSuggestions({ html, label }: { html: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const root = host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" });
    root.innerHTML = html;
    root.querySelectorAll("a").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  }, [html]);
  return <div ref={host} className="search-suggestions" aria-label={label} />;
}
