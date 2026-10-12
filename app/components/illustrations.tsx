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
    <header className="hero-glass glass compact">
      <div className="hero-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="greeting page-title">{title}</h1>
        {children && <div className="lede">{children}</div>}
      </div>
      <div className="hero-art scene-art">
        <HeroScene variant={variant} />
      </div>
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

/**
 * "Connected people": bold flat portraits inside overlapping device frames (browser, phone, chat,
 * cards), thick outlines, saturated colours. Original artwork. Frames float gently; motion is off
 * under prefers-reduced-motion.
 */
export function PeopleFrames() {
  const ink = "var(--pf-ink)";
  return (
    <svg className="people-frames" viewBox="0 0 440 380" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="pf-a"><rect x="58" y="70" width="150" height="214" rx="16" /></clipPath>
        <clipPath id="pf-b"><rect x="196" y="22" width="176" height="236" rx="20" /></clipPath>
        <clipPath id="pf-d"><rect x="72" y="262" width="150" height="104" rx="16" /></clipPath>
        <clipPath id="pf-e"><rect x="206" y="240" width="160" height="118" rx="16" /></clipPath>
      </defs>

      {/* browser frame: person with swept orange hair */}
      <g className="pf-float pf-d1">
        <rect x="58" y="70" width="150" height="214" rx="16" fill="var(--pf-blue)" stroke={ink} strokeWidth="5" />
        <g clipPath="url(#pf-a)">
          <path d="M120 150 C150 120 210 128 220 170 L220 300 L96 300 C92 240 96 180 120 150 Z" fill="var(--pf-skin-a)" />
          <path d="M104 168 C112 128 160 108 204 122 C226 130 236 150 232 170 C214 150 182 146 160 154 C140 160 120 166 104 168 Z" fill="var(--pf-hair-a)" />
          <path d="M150 128 C166 120 186 122 198 130" stroke="var(--pf-hair-a-line)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M156 252 C170 246 186 246 200 252 C190 262 168 262 156 252 Z" fill={ink} />
        </g>
        <circle cx="78" cy="88" r="5" fill="#f05a34" /><circle cx="94" cy="88" r="5" fill="#f6c445" /><circle cx="110" cy="88" r="5" fill="#2e9a5c" />
      </g>

      {/* phone frame: person with curly hair */}
      <g className="pf-float pf-d2">
        <rect x="196" y="22" width="176" height="236" rx="20" fill="var(--pf-pink)" stroke={ink} strokeWidth="5" />
        <g clipPath="url(#pf-b)">
          <path d="M214 300 L214 170 C214 120 250 96 290 100 C330 104 352 140 350 190 L350 300 Z" fill="var(--pf-skin-b)" />
          <g fill="var(--pf-hair-b)">
            {[[236, 112], [262, 96], [292, 92], [322, 100], [344, 120], [356, 148], [360, 178], [358, 210], [350, 240], [226, 136], [218, 164], [362, 260], [300, 84], [276, 86]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 20 : 17} />
            ))}
          </g>
          <path d="M240 168 C252 160 266 160 276 166" stroke={ink} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M244 186 C254 178 268 178 276 186 C268 194 252 194 244 186 Z" fill="#fff" stroke={ink} strokeWidth="3" />
          <circle cx="262" cy="186" r="5" fill={ink} />
          <path d="M236 232 C248 240 268 240 278 230" stroke="#e9573a" strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
        <g className="pf-pulse" transform="translate(340 44)" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <path d="M-10 4 A14 14 0 0 1 10 4" /><path d="M-6 8 A8 8 0 0 1 6 8" /><circle cx="0" cy="12" r="1.6" fill="#fff" />
        </g>
      </g>

      {/* chat bubble: an eye peeking, typing dots */}
      <g className="pf-float pf-d3">
        <rect x="28" y="170" width="190" height="86" rx="16" fill="var(--pf-yellow)" stroke={ink} strokeWidth="5" />
        <path d="M120 206 C134 194 156 194 168 206 C156 218 134 218 120 206 Z" fill="#fff" stroke={ink} strokeWidth="3" />
        <circle cx="146" cy="206" r="7" fill={ink} />
        <path d="M118 188 C132 180 152 180 166 186" stroke="var(--pf-hair-b)" strokeWidth="6" fill="none" strokeLinecap="round" />
        <g className="pf-typing" fill="#fff">
          <circle cx="58" cy="236" r="4.5" /><circle cx="74" cy="236" r="4.5" /><circle cx="90" cy="236" r="4.5" />
        </g>
      </g>

      {/* card: shoulders and collar */}
      <g className="pf-float pf-d4">
        <rect x="72" y="262" width="150" height="104" rx="16" fill="var(--pf-red)" stroke={ink} strokeWidth="5" />
        <g clipPath="url(#pf-d)">
          <path d="M84 380 C92 316 124 292 160 292 C198 292 226 316 232 380 Z" fill="var(--pf-yellow)" />
          <path d="M138 294 L160 330 L182 294 Z" fill="#fff" stroke={ink} strokeWidth="3" />
          <circle cx="204" cy="350" r="5" fill={ink} />
        </g>
        <g fill="#fff"><rect x="88" y="278" width="3" height="10" /><rect x="94" y="274" width="3" height="14" /><rect x="100" y="270" width="3" height="18" /></g>
      </g>

      {/* card: long wavy hair, green top */}
      <g className="pf-float pf-d5">
        <rect x="206" y="240" width="160" height="118" rx="16" fill="var(--pf-green)" stroke={ink} strokeWidth="5" />
        <g clipPath="url(#pf-e)">
          <path d="M236 240 C236 300 250 330 290 336 C330 330 344 300 344 240 Z" fill="var(--pf-skin-c)" />
          <path d="M224 240 C226 290 214 330 232 362 L254 362 C244 320 250 280 252 240 Z M356 240 C354 290 366 330 348 362 L326 362 C336 320 330 280 328 240 Z" fill="var(--pf-hair-c)" />
          <path d="M262 300 C276 306 304 306 318 300" stroke={ink} strokeWidth="2" fill="none" />
        </g>
      </g>
    </svg>
  );
}

/**
 * A rural classroom in warm morning light: tin roof and rafters, a hanging bulb, a sunlit window
 * throwing a shaft of light across a teacher, children silhouetted in the foreground.
 * Original artwork; the light shimmers and dust motes drift (off under reduced motion).
 */
export function ClassroomScene() {
  return (
    <svg className="classroom" viewBox="0 0 560 400" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cr-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2b20" />
          <stop offset="0.42" stopColor="#4a3627" />
          <stop offset="0.43" stopColor="#2d6f78" />
          <stop offset="1" stopColor="#1f4f57" />
        </linearGradient>
        <linearGradient id="cr-beam" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2c4" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#ffd98a" stopOpacity="0.25" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cr-bulb" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cr-desk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c98a4a" />
          <stop offset="1" stopColor="#7a4a22" />
        </linearGradient>
        <clipPath id="cr-clip"><rect width="560" height="400" rx="26" /></clipPath>
      </defs>
      <g clipPath="url(#cr-clip)">
        <rect width="560" height="400" fill="url(#cr-wall)" />
        {/* tin roof ridges + rafters */}
        <g opacity="0.55">
          {Array.from({ length: 28 }, (_, i) => (
            <path key={i} d={`M${i * 21 - 10} 0 L${i * 21 + 6} 46`} stroke="#6b5442" strokeWidth="6" />
          ))}
        </g>
        <rect x="0" y="46" width="560" height="12" fill="#2a1e15" />
        <rect x="0" y="92" width="560" height="9" fill="#2a1e15" opacity="0.8" />
        {/* chart on the wall */}
        <g transform="translate(150 118)">
          <rect width="150" height="96" rx="4" fill="#efe6cf" />
          <rect x="10" y="10" width="130" height="8" fill="#d1c2a0" />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={12 + i * 21} y="26" width="12" height="10" fill={["#5a8fd6", "#e07a5f", "#7ab87a", "#e0b24a", "#9a7ad6", "#5ab0b0"][i]} />)}
          <rect x="22" y="46" width="22" height="34" fill="#c9b994" /><rect x="58" y="46" width="22" height="34" fill="#c9b994" />
          <rect x="94" y="52" width="40" height="5" fill="#cbbd9b" /><rect x="94" y="62" width="34" height="5" fill="#cbbd9b" /><rect x="94" y="72" width="38" height="5" fill="#cbbd9b" />
        </g>
        {/* window + light shaft */}
        <rect x="468" y="120" width="92" height="110" fill="#fff6d8" />
        <rect x="468" y="120" width="92" height="110" fill="#ffffff" opacity="0.6" className="cr-window" />
        <path d="M470 124 L560 124 L380 400 L190 400 Z" fill="url(#cr-beam)" className="cr-beam" />
        <rect x="0" y="120" width="40" height="80" fill="#9fd08a" opacity="0.5" />
        {/* hanging bulb */}
        <line x1="300" y1="58" x2="300" y2="84" stroke="#1a120c" strokeWidth="3" />
        <path d="M282 84 L318 84 L312 92 L288 92 Z" fill="#2a3b3a" />
        <circle cx="300" cy="96" r="44" fill="url(#cr-bulb)" className="cr-glow" />
        <circle cx="300" cy="96" r="7" fill="#fffbe6" />
        {/* teacher */}
        <g transform="translate(278 168)">
          <path d="M8 0 C26 -6 44 6 44 26 C44 44 32 54 20 54 C6 54 -4 42 -2 24 C-1 12 2 4 8 0 Z" fill="#6b4226" />
          <path d="M6 2 C20 -10 46 -6 48 16 C40 8 26 6 12 10 Z" fill="#1d1612" />
          <path d="M-6 66 C2 56 40 54 52 64 L60 200 L-14 200 Z" fill="#e9dcc0" />
          <path d="M-6 66 C10 60 34 58 52 64 L56 120 L-10 120 Z" fill="#f1e7d0" opacity="0.6" />
          <path d="M-8 200 L60 200 L64 232 L-12 232 Z" fill="#2b2622" />
          <path d="M-14 96 C-24 104 -34 114 -38 122 L-30 128 C-22 118 -12 110 -4 106 Z" fill="#6b4226" />
          <rect x="-50" y="114" width="20" height="14" rx="2" fill="#fff" transform="rotate(-12 -40 120)" />
        </g>
        {/* dust motes in the beam */}
        <g fill="#fff8de" className="cr-dust">
          {[[420, 180], [392, 220], [440, 250], [360, 270], [404, 300], [330, 320], [372, 340], [450, 210], [300, 300]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.2 : 1.4} className={`mote m${i % 3}`} />
          ))}
        </g>
        {/* desk + children silhouettes */}
        <rect x="-10" y="318" width="420" height="18" rx="4" fill="url(#cr-desk)" />
        <g fill="#2b231d">
          {[[40, 338, 30], [112, 344, 34], [190, 336, 30], [262, 346, 33], [338, 340, 31], [430, 352, 36], [512, 344, 30]].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r * 0.58} />
              <path d={`M${x - r} ${y + r * 1.6} C${x - r} ${y + r * 0.5} ${x + r} ${y + r * 0.5} ${x + r} ${y + r * 1.6} Z`} />
            </g>
          ))}
        </g>
        <g fill="#4a3a2e" opacity="0.7">
          {[[150, 262, 16], [214, 268, 15], [96, 270, 15], [380, 272, 16], [446, 266, 15]].map(([x, y, r], i) => (
            <g key={i}><circle cx={x} cy={y} r={r * 0.6} /><path d={`M${x - r} ${y + r * 1.5} C${x - r} ${y + r * 0.5} ${x + r} ${y + r * 0.5} ${x + r} ${y + r * 1.5} Z`} /></g>
          ))}
        </g>
      </g>
    </svg>
  );
}

/** Subtle full-page backdrop per page, in one shared palette. */
export function PageBackdrop({ variant }: { variant: "classroom" | "seasons" | "map" | "network" | "messages" | "skyline" }) {
  return (
    <div className={`page-backdrop pb-${variant}`} aria-hidden="true">
      {variant === "classroom" && (
        <>
          <span className="pb-shaft s1" /><span className="pb-shaft s2" /><span className="pb-shaft s3" />
        </>
      )}
      {variant === "seasons" && (
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path d="M-50 620 Q600 -80 1250 620" fill="none" strokeDasharray="2 14" strokeLinecap="round" />
          {Array.from({ length: 12 }, (_, i) => {
            const t = (i + 0.5) / 12;
            const x = -50 + t * 1300;
            const y = 620 - 4 * t * (1 - t) * 700 + 0;
            return <circle key={i} cx={x} cy={y} r={i === 5 || i === 6 ? 16 : 9} />;
          })}
        </svg>
      )}
      {variant === "map" && (
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M-50 ${120 + i * 70} C 200 ${60 + i * 70}, 420 ${200 + i * 60}, 640 ${130 + i * 70} S 1000 ${40 + i * 80}, 1250 ${150 + i * 66}`} fill="none" />
          ))}
        </svg>
      )}
      {variant === "network" && (
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          {[[120, 140, 380, 260], [380, 260, 640, 160], [640, 160, 920, 300], [920, 300, 1100, 140], [380, 260, 520, 520], [520, 520, 820, 600], [820, 600, 920, 300], [120, 640, 520, 520]].map(([a, b, c, d], i) => (
            <line key={i} x1={a} y1={b} x2={c} y2={d} />
          ))}
          {[[120, 140], [380, 260], [640, 160], [920, 300], [1100, 140], [520, 520], [820, 600], [120, 640]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="10" />)}
        </svg>
      )}
      {variant === "messages" && (
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          {[[140, 160, 220], [860, 120, 260], [980, 520, 200], [220, 560, 240], [560, 680, 180]].map(([x, y, w], i) => (
            <g key={i} className={`pb-float f${i % 3}`}>
              <rect x={x} y={y} width={w} height={w * 0.42} rx="26" />
              <path d={`M${x + 30} ${y + w * 0.42} l0 26 l26 -26 Z`} />
            </g>
          ))}
        </svg>
      )}
      {variant === "skyline" && (
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice">
          <path d="M0 800 V640 H80 V560 H150 V610 H220 V500 H300 V590 H360 V540 H440 V620 H520 V470 H600 V580 H680 V530 H760 V610 H840 V490 H920 V600 H1000 V550 H1080 V630 H1200 V800 Z" />
        </svg>
      )}
    </div>
  );
}
