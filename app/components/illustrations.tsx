/**
 * Original illustrated scenes (inline SVG, no external assets). Style: flat CSR vector art
 * (globe, sprouting leaves, people on dashed orbits, growth arrows, gears, water drops) set in a
 * painterly valley landscape (sky, drifting clouds, layered hills, a village). Colours come from
 * CSS tokens so the scene switches to a night palette in dark mode. Motion is CSS-only and is
 * switched off under prefers-reduced-motion (see globals.css).
 */

function Cloud({ x, y, s = 1, className = "" }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`cloud ${className}`}>
        <ellipse cx="0" cy="18" rx="62" ry="20" />
        <ellipse cx="-30" cy="8" rx="30" ry="22" />
        <ellipse cx="8" cy="-4" rx="36" ry="30" />
        <ellipse cx="40" cy="8" rx="26" ry="20" />
      </g>
    </g>
  );
}

function Person({ x, y, tone, className = "" }: { x: number; y: number; tone: string; className?: string }) {
  return (
    <g className={`bubble ${className}`} transform={`translate(${x} ${y})`}>
      <circle r="26" className={`bubble-ring ${tone}`} />
      <circle r="21" className="bubble-face" />
      <circle cy="-6" r="7" className="bubble-person" />
      <path d="M-12 12 a12 10 0 0 1 24 0 Z" className="bubble-person" />
    </g>
  );
}

function Gear({ x, y, r, className = "" }: { x: number; y: number; r: number; className?: string }) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`gear ${className}`}>
        {teeth.map((a) => (
          <rect key={a} x={-r * 0.18} y={-r * 1.25} width={r * 0.36} height={r * 0.5} rx={r * 0.08} transform={`rotate(${a})`} />
        ))}
        <circle r={r} />
        <circle r={r * 0.42} className="gear-hole" />
      </g>
    </g>
  );
}

function Arrow({ x, y, s = 1, className = "" }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(-40)`}>
      <g className={`arrow ${className}`}>
        <rect x="-5" y="0" width="10" height="46" rx="3" />
        <path d="M-15 4 L0 -16 L15 4 Z" />
      </g>
    </g>
  );
}

function Drop({ x, y, s = 1, className = "" }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className={`drop ${className}`} d="M0 -14 C6 -4 10 2 10 7 A10 10 0 0 1 -10 7 C-10 2 -6 -4 0 -14 Z" />
    </g>
  );
}

/** Wide banner scene. `variant` shifts the focal objects so each page feels a little different. */
export function HeroScene({ variant = "digest" }: { variant?: "digest" | "planner" | "calendar" | "company" }) {
  const globeX = variant === "calendar" ? 980 : variant === "planner" ? 960 : 990;
  return (
    <svg className="hero-scene" viewBox="0 0 1200 340" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="sun-core" />
          <stop offset="1" className="sun-edge" />
        </radialGradient>
      </defs>
      <circle cx="760" cy="70" r="90" fill="url(#sun)" className="sun" />
      {/* stars only show at night */}
      <g className="stars">
        {[[90, 40], [210, 80], [330, 30], [470, 60], [610, 25], [690, 95], [880, 40], [1120, 70], [540, 110], [150, 120]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} className={`star s${i % 3}`} />
        ))}
      </g>
      <Cloud x={160} y={70} s={1.1} className="drift-slow" />
      <Cloud x={520} y={46} s={0.8} className="drift-mid" />
      <Cloud x={820} y={120} s={1.3} className="drift-slow alt" />
      <Cloud x={380} y={140} s={0.6} className="drift-fast" />

      {/* layered valley */}
      <path className="hill-far" d="M0 250 C120 205 220 215 330 230 C450 246 520 196 640 205 C760 214 840 180 960 196 C1060 209 1130 190 1200 200 L1200 340 L0 340 Z" />
      <path className="hill-mid" d="M0 280 C140 246 260 262 380 270 C520 279 600 240 760 250 C880 258 980 236 1200 248 L1200 340 L0 340 Z" />
      <g className="village">
        {[[300, 262], [318, 258], [336, 264], [612, 246], [628, 242], [645, 248], [662, 244], [470, 270], [486, 266]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x="-5" y="-6" width="10" height="7" className="house" />
            <path d="M-7 -6 L0 -12 L7 -6 Z" className="roof" />
          </g>
        ))}
      </g>
      <path className="hill-near" d="M0 310 C160 286 300 300 460 306 C640 313 760 290 940 296 C1060 300 1140 292 1200 296 L1200 340 L0 340 Z" />

      {/* tree on the left edge, Ghibli-style canopy */}
      <g className="tree">
        <path className="trunk" d="M58 340 C62 300 54 268 70 236 C80 214 96 204 110 196 L116 204 C100 214 90 226 84 246 C76 274 82 306 84 340 Z" />
        <g className="canopy sway-slow">
          <circle cx="70" cy="170" r="54" />
          <circle cx="128" cy="150" r="46" />
          <circle cx="24" cy="132" r="40" />
          <circle cx="92" cy="110" r="44" />
          <circle cx="160" cy="190" r="30" />
        </g>
        <g className="canopy-light sway-slow">
          <circle cx="98" cy="120" r="20" />
          <circle cx="132" cy="146" r="14" />
          <circle cx="56" cy="150" r="16" />
        </g>
      </g>

      {/* CSR globe cluster */}
      <g transform={`translate(${globeX} 205)`}>
        <ellipse className="orbit dash" cx="0" cy="0" rx="170" ry="92" />
        <circle className="globe" r="92" />
        <path className="land" d="M-60 -30 C-40 -50 -10 -46 0 -30 C12 -12 -8 0 -20 6 C-40 16 -70 0 -60 -30 Z" />
        <path className="land" d="M20 10 C40 0 66 8 70 26 C74 46 50 60 30 52 C14 46 6 22 20 10 Z" />
        <g className="sprout sway">
          <path className="stem" d="M0 -88 C-2 -120 4 -150 0 -182" />
          <path className="leaf" d="M0 -120 C-30 -132 -52 -118 -62 -100 C-36 -96 -14 -104 0 -120 Z" />
          <path className="leaf alt" d="M0 -140 C28 -158 54 -150 66 -132 C40 -124 18 -128 0 -140 Z" />
          <path className="leaf" d="M0 -162 C-22 -184 -44 -182 -56 -168 C-36 -158 -16 -156 0 -162 Z" />
          <path className="leaf alt" d="M0 -176 C14 -196 32 -200 44 -192 C32 -178 16 -172 0 -176 Z" />
        </g>
        <Person x={-150} y={-46} tone="teal" className="float-a" />
        <Person x={150} y={30} tone="sun" className="float-b" />
        <Person x={-96} y={74} tone="sky" className="float-c" />
        <Arrow x={-40} y={20} s={0.9} className="bob" />
        <Arrow x={-6} y={4} s={0.6} className="bob delay" />
        <Arrow x={118} y={-90} s={0.8} className="bob" />
        <Gear x={-178} y={-110} r={18} className="spin" />
        <Gear x={176} y={-58} r={12} className="spin reverse" />
        <Drop x={70} y={-140} s={1.2} className="fall" />
        <Drop x={104} y={-110} s={0.8} className="fall delay" />
        <path className="heart" transform="translate(-130 10) scale(0.9)" d="M0 6 C-10 -4 -14 -12 -7 -16 C-3 -18 0 -14 0 -12 C0 -14 3 -18 7 -16 C14 -12 10 -4 0 6 Z" />
        <path className="heart" transform="translate(132 82) scale(0.8)" d="M0 6 C-10 -4 -14 -12 -7 -16 C-3 -18 0 -14 0 -12 C0 -14 3 -18 7 -16 C14 -12 10 -4 0 6 Z" />
      </g>
    </svg>
  );
}

export function Hero({
  eyebrow,
  title,
  children,
  variant,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  variant?: "digest" | "planner" | "calendar" | "company";
}) {
  return (
    <header className="hero">
      <div className="hero-text">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <div className="sub">{children}</div>}
      </div>
      <HeroScene variant={variant} />
    </header>
  );
}

/** Small section icons in the same style. */
export function Icon({ name }: { name: "leaf" | "calendar" | "compass" | "spark" | "people" | "sun" }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true, className: `icon icon-${name}` } as const;
  switch (name) {
    case "leaf":
      return (
        <svg {...common}><path d="M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19 Z" className="i-fill" /><path d="M5 19 L13 11" className="i-line" /></svg>
      );
    case "calendar":
      return (
        <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" className="i-fill" /><path d="M3 10 H21 M8 3 V7 M16 3 V7" className="i-line" /><circle cx="12" cy="15" r="2" className="i-dot" /></svg>
      );
    case "compass":
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" className="i-fill" /><path d="M15.5 8.5 L13 13 L8.5 15.5 L11 11 Z" className="i-dot" /></svg>
      );
    case "spark":
      return (
        <svg {...common}><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" className="i-fill" /></svg>
      );
    case "people":
      return (
        <svg {...common}><circle cx="9" cy="9" r="3.5" className="i-fill" /><circle cx="17" cy="10" r="2.5" className="i-dot" /><path d="M3 20 C3 15 15 15 15 20 Z" className="i-fill" /></svg>
      );
    case "sun":
      return (
        <svg {...common}><circle cx="12" cy="12" r="5" className="i-dot" /><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M5 5 L7 7 M17 17 L19 19 M5 19 L7 17 M17 7 L19 5" className="i-line" /></svg>
      );
  }
}
