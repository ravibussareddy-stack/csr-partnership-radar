/**
 * Editorial poster art for page headers (original SVG, inspired by poster styles the product owner
 * shared: bold type over a blurred crowd, duotone photo with a red circle, vertical photo strips,
 * figures on a wall against a saturated wall). Also the Namaste / Vanakkam welcome for the Summary.
 * Motion is CSS-only and switches off under prefers-reduced-motion.
 */
type PosterVariant = "digest" | "regulatory" | "calendar" | "funding" | "relationships" | "hiring" | "community" | "team" | "sectors" | "messages";

const crowd = (seed: number, n = 26) =>
  Array.from({ length: n }, (_, i) => {
    const x = ((i * 97 + seed * 31) % 620) - 10;
    const y = 40 + ((i * 53 + seed * 17) % 300);
    const r = 22 + ((i * 13) % 18);
    return { x, y, r, k: i };
  });

function Person({ x, y, s = 1, className = "pp-ink" }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className={className}>
      <circle cx="0" cy="-58" r="15" />
      <path d="M-26 40 C-28 -10 -20 -38 0 -40 C20 -38 28 -10 26 40 Z" />
    </g>
  );
}

function Reader({ x, y, flip = false, hat = false }: { x: number; y: number; flip?: boolean; hat?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <circle cx="0" cy="-62" r="13" className="pp-ink" />
      {hat && <path d="M-17 -68 H17 L12 -76 H-12 Z M-22 -67 H22" className="pp-hat" />}
      <path d="M-22 -2 C-24 -32 -16 -48 0 -49 C16 -48 24 -32 22 -2 Z" className="pp-ink" />
      <path d="M-20 -6 H26 L30 30 H22 L18 6 H-16 L-14 44 H-24 Z" className="pp-ink" />
      <rect x="-4" y="-34" width="36" height="24" rx="2" className="pp-paper" transform="rotate(-8)" />
      <path d="M2 -28 H26 M2 -22 H24 M2 -16 H20" className="pp-lines" transform="rotate(-8)" />
    </g>
  );
}

export function Poster({ variant }: { variant: PosterVariant }) {
  const id = `pf-${variant}`;
  switch (variant) {
    case "digest":
    case "hiring": {
      const big = variant === "digest" ? "NOISE" : "SCROLL";
      return (
        <svg className="poster" viewBox="0 0 600 340" aria-hidden="true" focusable="false">
          <defs>
            <filter id={`${id}-b`}><feGaussianBlur stdDeviation="9" /></filter>
            <filter id={`${id}-m`}><feGaussianBlur stdDeviation="0 5" /></filter>
          </defs>
          <rect width="600" height="340" className="pp-dark" />
          <g filter={`url(#${id}-b)`} className="pp-crowd">{crowd(variant === "digest" ? 1 : 4).map((c) => <circle key={c.k} cx={c.x} cy={c.y} r={c.r} />)}</g>
          <text x="300" y="58" textAnchor="middle" className="pp-yellow pp-italic" fontSize="26">While others</text>
          <text x="300" y="140" textAnchor="middle" className="pp-yellow pp-black" fontSize="96" filter={`url(#${id}-m)`}>{big}</text>
          <text x="70" y="178" className="pp-white pp-italic" fontSize="22">{variant === "digest" ? "We make" : "We spot"}</text>
          <text x="530" y="178" textAnchor="end" className="pp-yellow pp-italic" fontSize="22">{variant === "digest" ? "it clear" : "who's hiring"}</text>
          <g className="pp-float">
            {variant === "digest" ? <Reader x={300} y={300} /> : <Person x={300} y={302} s={1.2} className="pp-ink-light" />}
          </g>
        </svg>
      );
    }
    case "regulatory":
    case "relationships":
    case "community": {
      const words = variant === "regulatory" ? ["Every", "rule", "tells a"] : variant === "relationships" ? ["Every", "partner", "tells a"] : ["Every", "face", "tells a"];
      return (
        <svg className="poster" viewBox="0 0 600 340" aria-hidden="true" focusable="false">
          <rect width="600" height="340" className="pp-grey" />
          {variant === "regulatory" ? (
            <g className="pp-civic">
              <path d="M40 120 L240 50 L440 120 Z" />
              <rect x="50" y="128" width="380" height="14" />
              {[70, 130, 190, 250, 310, 370].map((x) => <rect key={x} x={x} y="150" width="34" height="160" rx="4" />)}
              <rect x="30" y="310" width="430" height="30" />
            </g>
          ) : (
            <g className="pp-civic">
              {Array.from({ length: 6 }, (_, i) => <Person key={i} x={50 + i * 78} y={250 + (i % 2) * 30} s={1.1} className="pp-grey-person" />)}
            </g>
          )}
          <circle cx="420" cy="170" r="138" className="pp-red pp-pulse" />
          {variant === "relationships" && (
            <g transform="translate(330 220)" className="pp-hands">
              <path d="M-60 20 C-30 0 -10 -6 10 4 L40 20 L20 34 L-10 22 L-40 40 Z" />
              <path d="M70 18 C40 -2 20 -8 0 2 L-24 18 L-6 30 L22 20 L52 38 Z" />
            </g>
          )}
          <text x="455" y="88" className="pp-yellow pp-black" fontSize="44">”</text>
          {words.map((w, i) => <text key={w} x="455" y={130 + i * 34} className="pp-white" fontSize="30">{w}</text>)}
          <text x="455" y="250" className="pp-yellow pp-black" fontSize="44">Story.</text>
        </svg>
      );
    }
    case "calendar":
    case "sectors": {
      const letters = variant === "calendar" ? ["S", "E", "A", "S", "O", "N"] : ["F", "O", "C", "U", "S"];
      const tones = ["pp-s1", "pp-s2", "pp-s3", "pp-s4", "pp-s5", "pp-s6"];
      const w = 600 / letters.length;
      return (
        <svg className="poster" viewBox="0 0 600 340" aria-hidden="true" focusable="false">
          {letters.map((l, i) => (
            <g key={i} className="pp-strip" style={{ animationDelay: `${i * 0.12}s` }}>
              <rect x={i * w + 3} y="0" width={w - 6} height="340" rx="10" className={tones[i % tones.length]} />
              <StripIcon i={i} cx={i * w + w / 2} variant={variant} />
              <text x={i * w + w / 2} y="110" textAnchor="middle" className="pp-serif" fontSize="64">{l}</text>
            </g>
          ))}
        </svg>
      );
    }
    case "funding":
    case "team":
      return (
        <svg className="poster" viewBox="0 0 600 340" aria-hidden="true" focusable="false">
          <rect width="600" height="250" className={variant === "funding" ? "pp-orange" : "pp-teal"} />
          <rect y="236" width="600" height="104" className="pp-wall" />
          <path d="M0 236 H600" className="pp-ledge" />
          <text x="300" y="60" textAnchor="middle" className="pp-white" fontSize="18">{variant === "funding" ? "to experience" : "together, we are"}</text>
          <text x="300" y="118" textAnchor="middle" className="pp-white pp-serif-bold" fontSize="56">{variant === "funding" ? "growth" : "becoming"}</text>
          <Reader x={210} y={236} hat />
          <Reader x={400} y={236} flip />
          <path d="M190 290 L130 340 M240 290 L210 340 M380 290 L330 340 M420 290 L410 340" className="pp-shadow" />
        </svg>
      );
    case "messages":
    default:
      return (
        <svg className="poster" viewBox="0 0 600 340" aria-hidden="true" focusable="false">
          <rect width="600" height="340" className="pp-dark" />
          {[[70, 60, 200], [330, 40, 220], [120, 170, 240], [380, 190, 170]].map(([x, y, wd], i) => (
            <g key={i} className={`pp-float f${i % 3}`}>
              <rect x={x} y={y} width={wd} height={70} rx="22" className={i % 2 ? "pp-bubble-a" : "pp-bubble-b"} />
              <path d={`M${x + 26} ${y + 70} l0 18 l20 -18 Z`} className={i % 2 ? "pp-bubble-a" : "pp-bubble-b"} />
              <rect x={x + 22} y={y + 24} width={wd * 0.6} height="8" rx="4" className="pp-line-a" />
              <rect x={x + 22} y={y + 40} width={wd * 0.4} height="8" rx="4" className="pp-line-a" />
            </g>
          ))}
        </svg>
      );
  }
}

function StripIcon({ i, cx, variant }: { i: number; cx: number; variant: "calendar" | "sectors" }) {
  const y = 230;
  if (variant === "sectors") {
    const icons = [
      <path key="book" d={`M${cx - 26} ${y - 20} H${cx - 2} V${y + 24} H${cx - 26} Z M${cx + 2} ${y - 20} H${cx + 26} V${y + 24} H${cx + 2} Z`} className="pp-icon" />,
      <g key="gear" className="pp-icon"><circle cx={cx} cy={y} r="18" /><circle cx={cx} cy={y} r="6" className="pp-hole" /></g>,
      <g key="screen" className="pp-icon"><rect x={cx - 26} y={y - 18} width="52" height="34" rx="4" /><rect x={cx - 10} y={y + 18} width="20" height="6" /></g>,
      <g key="person" className="pp-icon"><circle cx={cx} cy={y - 14} r="10" /><path d={`M${cx - 18} ${y + 22} C${cx - 18} ${y} ${cx + 18} ${y} ${cx + 18} ${y + 22} Z`} /></g>,
      <path key="leaf" d={`M${cx - 20} ${y + 20} C${cx - 20} ${y - 10} ${cx} ${y - 24} ${cx + 22} ${y - 24} C${cx + 22} ${y} ${cx + 4} ${y + 20} ${cx - 20} ${y + 20} Z`} className="pp-icon" />,
    ];
    return icons[i % icons.length];
  }
  const icons = [
    <circle key="sun" cx={cx} cy={y} r="22" className="pp-icon" />,
    <g key="rain" className="pp-icon"><ellipse cx={cx} cy={y - 8} rx="28" ry="14" /><path d={`M${cx - 14} ${y + 12} l-4 12 M${cx} ${y + 12} l-4 12 M${cx + 14} ${y + 12} l-4 12`} className="pp-rain" /></g>,
    <g key="diya" className="pp-icon"><path d={`M${cx - 26} ${y + 4} Q${cx} ${y + 30} ${cx + 26} ${y + 4} Z`} /><path d={`M${cx} ${y - 22} C${cx - 8} ${y - 8} ${cx + 8} ${y - 8} ${cx} ${y - 22} Z M${cx} ${y - 4} C${cx - 9} ${y - 12} ${cx - 5} ${y - 22} ${cx} ${y - 28} C${cx + 5} ${y - 22} ${cx + 9} ${y - 12} ${cx} ${y - 4} Z`} className="pp-flame" /></g>,
    <g key="kite" className="pp-icon"><path d={`M${cx} ${y - 30} L${cx + 22} ${y} L${cx} ${y + 30} L${cx - 22} ${y} Z`} /><path d={`M${cx} ${y + 30} q10 20 -6 34`} className="pp-rain" /></g>,
    <path key="leaf" d={`M${cx - 22} ${y + 20} C${cx - 22} ${y - 10} ${cx} ${y - 26} ${cx + 24} ${y - 26} C${cx + 24} ${y} ${cx + 4} ${y + 20} ${cx - 22} ${y + 20} Z`} className="pp-icon" />,
    <g key="flower" className="pp-icon">{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={cx} cy={y - 14} rx="8" ry="14" transform={`rotate(${a} ${cx} ${y})`} />)}<circle cx={cx} cy={y} r="7" className="pp-flame" /></g>,
  ];
  return icons[i % icons.length];
}

/** Warm welcome: hands joined in namaste / vanakkam, with a marigold ring and a soft diya glow. */
export function NamasteArt() {
  return (
    <svg className="namaste" viewBox="0 0 220 220" role="img" aria-label="Hands joined in a namaste greeting">
      <defs>
        <radialGradient id="nm-glow" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" className="nm-glow-core" />
          <stop offset="1" className="nm-glow-edge" />
        </radialGradient>
      </defs>
      <circle cx="110" cy="116" r="104" fill="url(#nm-glow)" />
      {/* rangoli / marigold ring */}
      <g className="nm-ring">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return <circle key={i} cx={110 + Math.cos(a) * 88} cy={116 + Math.sin(a) * 88} r={i % 2 ? 6 : 8} className={i % 3 ? "nm-marigold" : "nm-marigold-deep"} />;
        })}
      </g>
      {/* sleeves with saffron cuffs */}
      <path d="M52 214 C58 186 70 168 88 160 L106 214 Z" className="nm-sleeve" />
      <path d="M168 214 C162 186 150 168 132 160 L114 214 Z" className="nm-sleeve" />
      <path d="M84 162 L104 156 L106 170 L86 176 Z" className="nm-cuff" />
      <path d="M136 162 L116 156 L114 170 L134 176 Z" className="nm-cuff" />
      {/* left hand: palm, four fingers (separation lines), thumb in front */}
      <path d="M109 40 C103 40 99 46 98 56 C96 76 93 98 90 116 C88 130 87 146 88 160 L109 166 Z" className="nm-palm" />
      <path d="M108 46 C104 64 101 86 99 108 M104 52 C100 70 97 90 95 110 M100 64 C97 80 94 96 92 112" className="nm-finger" />
      <path d="M92 118 C84 110 81 98 84 90 C90 90 96 100 98 116 Z" className="nm-thumb-l" />
      {/* right hand, mirrored */}
      <path d="M111 40 C117 40 121 46 122 56 C124 76 127 98 130 116 C132 130 133 146 132 160 L111 166 Z" className="nm-palm-r" />
      <path d="M112 46 C116 64 119 86 121 108 M116 52 C120 70 123 90 125 110 M120 64 C123 80 126 96 128 112" className="nm-finger" />
      <path d="M128 118 C136 110 139 98 136 90 C130 90 124 100 122 116 Z" className="nm-thumb-r" />
      <path d="M110 42 V166" className="nm-crease" />
      {/* falling petals */}
      {[[40, 30], [176, 42], [30, 120], [190, 110]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="5" ry="8" className={`nm-petal p${i}`} />
      ))}
    </svg>
  );
}
