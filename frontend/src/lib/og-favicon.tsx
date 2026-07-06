import { ImageResponse } from "@vercel/og";

// ── Pabellón Venezolano icon ────────────────────────────────────────────

/**
 * Organic arrangement inside a circular plate:
 *
 *   ┌──────────────────┐
 *   │    🍚 Arroz      │
 *   │  (white grains)  │
 *   │      ──────      │
 *   │ 🫘   │    🥩      │
 *   │Beans │  Carne     │
 *   │(dark)│  (brown)   │
 *   │      │           │
 *   │  🍌 Plátano      │
 *   │  (gold slices)   │
 *   └──────────────────┘
 */

function SvgPlate() {
  return (
    <svg
      fill="none"
      viewBox="0 0 64 64"
      style={{ width: "100%", height: "100%" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width="64" height="64" fill="#0f172a" />
      {/* Copper accent circle */}
      <circle cx="56" cy="8" r="6" fill="#f97316" opacity="0.8" />
      {/* Plate shadow */}
      <circle cx="32" cy="33" r="22" fill="rgba(0,0,0,0.35)" />
      {/* Plate rim */}
      <circle cx="32" cy="32" r="21" fill="#e8e4df" />
      {/* Inner plate */}
      <g clipPath="url(#plate)">
        {/* White rice — top area with grain dots */}
        <path
          d="M13 32 Q20 12 40 13 Q50 13 51 25 L51 28 Q44 24 32 26 Q20 28 13 32Z"
          fill="#f5f0e8"
        />
        {[17, 22, 27, 33, 38].map((x) =>
          [15, 18, 21, 24].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#e8e0d0" />
          )),
        )}
        {/* Black beans — bottom-left */}
        <path d="M13 32 Q20 36 32 34 Q30 40 32 48 Q24 50 16 46 Q12 42 13 32Z" fill="#1a1a2e" />
        {/* Bean dots */}
        {[
          [18, 36],
          [22, 38],
          [17, 41],
          [24, 43],
          [20, 46],
        ].map(([cx, cy]) => (
          <ellipse key={`b${cx}-${cy}`} cx={cx} cy={cy} rx="1.8" ry="1.2" fill="#2a2a4e" />
        ))}
        {/* Shredded beef — right side */}
        <path
          d="M32 20 Q40 18 50 28 L51 43 Q44 48 36 46 Q30 42 32 34Q30 28 32 20Z"
          fill="#8B4513"
        />
        {/* Beef texture lines */}
        {[
          [36, 24],
          [42, 28],
          [38, 32],
          [44, 36],
          [36, 40],
        ].map(([x, y]) => (
          <path
            key={`meat-${x}-${y}`}
            d={`M${x} ${y} Q${x + 7} ${y + 3} ${x + 4} ${y + 6}`}
            stroke="#a0522d"
            strokeWidth="0.8"
            fill="none"
          />
        ))}
        {/* Fried plantain — bottom strip */}
        <rect x="14" y="47" width="22" height="5" rx="2" fill="#FFB300" />
        <rect x="38" y="47" width="12" height="5" rx="2" fill="#FFB300" />
        {/* Plantain highlight stripes */}
        <rect x="16" y="48" width="18" height="1.5" rx="0.7" fill="#ffd54f" />
        <rect x="40" y="48" width="8" height="1.5" rx="0.7" fill="#ffd54f" />
      </g>
      {/* Shine */}
      <ellipse cx="24" cy="22" rx="10" ry="6" fill="rgba(255,255,255,0.10)" />
      <defs>
        <clipPath id="plate">
          <circle cx="32" cy="32" r="19" />
        </clipPath>
      </defs>
    </svg>
  );
}

export async function generateFavicon(): Promise<ImageResponse> {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
      }}
    >
      <SvgPlate />
    </div>,
    { width: 64, height: 64 },
  );
}

export async function generatePwaIcon(size: number): Promise<ImageResponse> {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
      }}
    >
      <SvgPlate />
    </div>,
    { width: size, height: size },
  );
}
