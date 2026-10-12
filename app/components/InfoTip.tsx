"use client";
/**
 * Small ⓘ that explains the element next to it on hover, focus or tap. The popup is rendered into
 * document.body with fixed positioning and kept inside the viewport (flipping below when there is no
 * room above), so containers that clip their overflow (hero cards, calendar cells) can't cut it off.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WIDTH = 300;
const GAP = 8;
const MARGIN = 12;

export function InfoTip({ text, label = "What is this?" }: { text: React.ReactNode; label?: string }) {
  const btn = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const w = Math.min(WIDTH, window.innerWidth - MARGIN * 2);
    const h = pop.current?.offsetHeight ?? 120;
    const left = Math.min(Math.max(MARGIN, b.left + b.width / 2 - w / 2), window.innerWidth - w - MARGIN);
    const below = b.top - h - GAP < MARGIN;
    const top = below ? Math.min(b.bottom + GAP, window.innerHeight - h - MARGIN) : b.top - h - GAP;
    setPos({ left, top, below });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const raf = requestAnimationFrame(place); // re-place once the popup's real height is known
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && btn.current?.contains(e.target as Node)) return;
      setOpen(false);
      setPinned(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.addEventListener("keydown", close);
    if (pinned) window.addEventListener("pointerdown", close);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [open, pinned, place]);

  return (
    <span
      ref={btn}
      className="info"
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !pinned && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => !pinned && setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPinned((p) => !p);
        setOpen(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setPinned((p) => !p);
          setOpen(true);
        }
      }}
    >
      <span aria-hidden="true">i</span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={pop}
            id={id}
            role="tooltip"
            className={`info-float${pos?.below ? " below" : ""}`}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: Math.min(WIDTH, typeof window !== "undefined" ? window.innerWidth - MARGIN * 2 : WIDTH) }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
