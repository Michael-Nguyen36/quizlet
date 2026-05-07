// Convert icons/icon.svg into the PNG sizes the manifest and iOS expect.
//
//   npm install         (one-time, in this tools/ folder)
//   npm run icons

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, "..", "icons");
const svgPath = resolve(iconsDir, "icon.svg");
const svg = await readFile(svgPath);

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: t.size } });
  const png = r.render().asPng();
  const out = resolve(iconsDir, t.name);
  await writeFile(out, png);
  console.log(`wrote ${out} (${t.size}x${t.size})`);
}
