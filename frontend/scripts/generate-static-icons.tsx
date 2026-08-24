// Bakes the favicon/PWA icons/OG image into dist/client as real static
// files — the frontend deploys as a pure static site now (vercel.json's
// buildCommand/outputDirectory, no Nitro server behind it), so the server
// route handlers under src/routes/_icons/ and src/routes/og-image.tsx
// (still used by `pnpm dev`, which does run a real dev server) never
// execute in production. All four images are fully deterministic — no
// request params — so generating them once here is equivalent.
//
// Not TanStack Start's own prerender (spa.prerender / the `pages` plugin
// option): its prerender pipeline is built for HTML/text output and
// mangles binary responses — writing the fetched bytes turned the PNG
// signature's leading 0x89 byte into the UTF-8 replacement character,
// producing corrupt, unopenable images. Writing the raw ArrayBuffer via
// node:fs directly (below) doesn't go through that pipeline at all.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateFavicon, generatePwaIcon, svgFaviconMarkup } from "../src/lib/og-favicon";
import { generateOgImage } from "../src/lib/og-image";

const outDir = fileURLToPath(new URL("../dist/client", import.meta.url));

async function writeImageResponse(response: Response, filename: string) {
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(outDir, filename), buffer);
  console.log(`wrote ${filename} (${buffer.byteLength} bytes)`);
}

await mkdir(outDir, { recursive: true });

await Promise.all([
  writeImageResponse(await generateFavicon(), "favicon.png"),
  writeImageResponse(await generatePwaIcon(192), "icon-192.png"),
  writeImageResponse(await generatePwaIcon(512), "icon-512.png"),
  // og-image.png, not og-image (no extension) — vercel.json rewrites the
  // extension-less /og-image URL used in meta tags to this file, since a
  // static file with no extension can't reliably get the right
  // Content-Type served automatically.
  writeImageResponse(await generateOgImage(), "og-image.png"),
  writeFile(path.join(outDir, "favicon.svg"), svgFaviconMarkup()),
]);
