import { ImageResponse } from "@vercel/og";
import { renderToStaticMarkup } from "react-dom/server";

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

/**
 * Kurzgesagt-style flat illustration: bold saturated color blocks, a single
 * soft highlight blob per shape for volume, and no fussy linework. `detailed`
 * only toggles whether the highlight blobs render — at favicon sizes
 * (16–32px) they'd collapse into noise, so small renders skip them.
 */
function SvgPlate({ detailed = true }: { detailed?: boolean }) {
  return (
    <svg
      fill="none"
      viewBox="0 0 64 64"
      style={{ width: "100%", height: "100%" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rounded background */}
      <rect width="64" height="64" rx="16" fill="url(#bg)" />
      {/* Sun accent circle */}
      <circle cx="50" cy="14" r="6" fill="url(#sun)" />
      {/* Plate shadow */}
      <ellipse cx="32" cy="35" rx="21" ry="20" fill="rgba(0,0,0,0.25)" />
      {/* Plate */}
      <circle cx="32" cy="32" r="21" fill="url(#rim)" />
      <g clipPath="url(#plate)">
        {/* Arroz */}
        <path
          d="M13 32 Q20 11 40 12 Q51 12 52 25 L52 29 Q43 24 32 26 Q20 28 13 32Z"
          fill="url(#rice)"
        />
        {detailed && <ellipse cx="27" cy="18" rx="9" ry="4" fill="#ffffff" opacity="0.55" />}
        {/* Caraotas */}
        <path
          d="M13 32 Q19 37 32 35 Q31 42 32 49 Q23 51 15 46 Q11 41 13 32Z"
          fill="url(#beans)"
        />
        {detailed && <ellipse cx="19" cy="39" rx="4.5" ry="2.6" fill="#a78bfa" opacity="0.5" />}
        {/* Carne mechada */}
        <path
          d="M32 20 Q41 17 51 27 L52 44 Q44 49 35 47 Q29 43 32 34 Q29 27 32 20Z"
          fill="url(#beef)"
        />
        {detailed && <ellipse cx="41" cy="26" rx="6" ry="3.5" fill="#ffd8b0" opacity="0.55" />}
        {/* Plátano */}
        <rect x="14" y="47" width="22" height="6" rx="3" fill="url(#platano)" />
        <rect x="38" y="47" width="13" height="6" rx="3" fill="url(#platano)" />
        {detailed && [
          <rect key="hl1" x="16" y="48.5" width="16" height="1.6" rx="0.8" fill="#ffcf8f" opacity="0.85" />,
          <rect key="hl2" x="40" y="48.5" width="8" height="1.6" rx="0.8" fill="#ffcf8f" opacity="0.85" />,
        ]}
      </g>
      {/* Overall glass highlight */}
      <ellipse cx="23" cy="21" rx="11" ry="7" fill="rgba(255,255,255,0.12)" />
      <defs>
        <clipPath id="plate">
          <circle cx="32" cy="32" r="19" />
        </clipPath>
        <linearGradient id="bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#241b4e" />
          <stop offset="1" stopColor="#120f2e" />
        </linearGradient>
        <linearGradient id="sun" x1="44" y1="8" x2="56" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb648" />
          <stop offset="1" stopColor="#f9622c" />
        </linearGradient>
        <linearGradient id="rim" x1="11" y1="11" x2="53" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffaf1" />
          <stop offset="1" stopColor="#f0e6d6" />
        </linearGradient>
        <linearGradient id="rice" x1="13" y1="12" x2="52" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f0e7d3" />
        </linearGradient>
        <linearGradient id="beans" x1="11" y1="32" x2="32" y2="51" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4c3b8c" />
          <stop offset="1" stopColor="#241a4a" />
        </linearGradient>
        <linearGradient id="beef" x1="29" y1="17" x2="52" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
        <linearGradient id="platano" x1="14" y1="47" x2="51" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#f5a300" />
        </linearGradient>
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
      <SvgPlate detailed={false} />
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
      <SvgPlate detailed={size >= 192} />
    </div>,
    { width: size, height: size },
  );
}

/**
 * Raw SVG markup for the /favicon.svg endpoint, rendered from the same
 * simplified (non-detailed) plate used by generateFavicon.
 */
export function svgFaviconMarkup(): string {
  return renderToStaticMarkup(<SvgPlate detailed={true} />);
}
