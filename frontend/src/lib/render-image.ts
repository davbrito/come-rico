import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import type { ReactNode } from "react";

// Renders JSX to a PNG Response via satori (JSX -> SVG) + resvg (SVG -> PNG),
// bypassing @vercel/og's ImageResponse: its Node bundle dynamic-requires "fs"
// from harfbuzzjs in a way esbuild's ESM output can't support, crashing any
// build-time script (tsx) or plain Node server that imports it outside
// Vercel's Edge Runtime.
export async function renderPng(
  node: ReactNode,
  options: {
    width: number;
    height: number;
    fonts?: { name: string; data: ArrayBuffer; weight?: number; style?: "normal" | "italic" }[];
  },
): Promise<Response> {
  const svg = await satori(node as never, {
    width: options.width,
    height: options.height,
    fonts: options.fonts?.map((font) => ({
      name: font.name,
      data: font.data,
      weight: (font.weight ?? 400) as never,
      style: font.style ?? "normal",
    })) ?? [],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: options.width },
  });
  const png = resvg.render().asPng();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, immutable, no-transform, max-age=31536000",
    },
  });
}
