import { ImageResponse } from "@vercel/og";

// ── Font loading (Google Fonts CSS API) ─────────────────────────────────

const OG_TEXT = "ComeRico¿Qué vamos a comer hoy?.app";

async function loadGoogleFont(font: string, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src:\s*url\((.+?)\)/);
  if (!resource) throw new Error(`Failed to load font data for ${font}`);

  const response = await fetch(resource[1]);
  if (response.status !== 200) throw new Error(`Failed to fetch font file for ${font}`);
  return await response.arrayBuffer();
}

let manropeFont: ArrayBuffer | null = null;
let frauncesFont: ArrayBuffer | null = null;

async function loadManrope(): Promise<ArrayBuffer> {
  if (manropeFont) return manropeFont;
  manropeFont = await loadGoogleFont("Manrope:wght@400;700", OG_TEXT);
  return manropeFont!;
}

async function loadFraunces(): Promise<ArrayBuffer> {
  if (frauncesFont) return frauncesFont;
  frauncesFont = await loadGoogleFont("Fraunces:wght@700", OG_TEXT);
  return frauncesFont!;
}

// ── OG image template (Satori JSX) ──────────────────────────────────────

function OgTemplate() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#0f172a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative gradient circles */}
      <div
        style={{
          position: "absolute",
          top: -120,
          left: -140,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(249,115,22,0.35), transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -120,
          bottom: -120,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,68,68,0.2), transparent 70%)",
        }}
      />

      {/* Card */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "48px 64px",
          borderRadius: 32,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          zIndex: 1,
        }}
      >
        {/* Emoji */}
        <div style={{ fontSize: 64, marginBottom: 16 }}>🍽️</div>

        {/* Title */}
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 80,
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            textAlign: "center",
          }}
        >
          ComeRico
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: "Manrope",
            fontSize: 32,
            fontWeight: 400,
            color: "rgba(250,250,250,0.8)",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          ¿Qué vamos a comer hoy?
        </div>

        {/* Divider */}
        <div
          style={{
            width: 80,
            height: 2,
            borderRadius: 1,
            background: "linear-gradient(90deg, rgba(249,115,22,0.6), rgba(239,68,68,0.6))",
            marginTop: 24,
          }}
        />
      </div>

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          fontFamily: "Manrope",
          fontSize: 16,
          fontWeight: 400,
          color: "rgba(250,250,250,0.35)",
          textAlign: "center",
        }}
      >
        come-rico.app
      </div>
    </div>
  );
}

// ── Public API ──────────────────────────────────────────────────────────

export async function generateOgImage(): Promise<ImageResponse> {
  const [manropeData, frauncesData] = await Promise.all([loadManrope(), loadFraunces()]);

  return new ImageResponse(<OgTemplate />, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Manrope",
        data: manropeData,
        weight: 400,
        style: "normal",
      },
      {
        name: "Manrope",
        data: manropeData,
        weight: 700,
        style: "normal",
      },
      {
        name: "Fraunces",
        data: frauncesData,
        weight: 700,
        style: "normal",
      },
    ],
  });
}
