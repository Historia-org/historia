#!/usr/bin/env node
/**
 * Downloads the neutral basemap (Natural Earth, public domain)
 * into apps/web/public/data/. Run once: `pnpm setup:data`
 *
 * Island coverage (colonization angle):
 *   - ne_50m_land: land + medium islands (Antilles, New Caledonia, Tahiti...)
 *   - ne_10m_minor_islands: minor islands and atolls (Wallis, Tuamotu, Grenadines...)
 *
 * --hd option: replaces the 50m layer with ne_10m_land (~25 MB, slower load,
 * finest coastline). In Phase 1, the basemap will be served as vector tiles
 * from PostGIS (zoom-based generalization) and these static files will
 * disappear.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hd = process.argv.includes("--hd");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps", "web", "public", "data");

const BASE =
  "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master";

const FILES = [
  {
    url: hd
      ? `${BASE}/10m/physical/ne_10m_land.json`
      : `${BASE}/50m/physical/ne_50m_land.json`,
    out: "ne_land.geojson",
  },
  {
    url: `${BASE}/10m/physical/ne_10m_minor_islands.json`,
    out: "ne_minor_islands.geojson",
  },
];

await mkdir(outDir, { recursive: true });
for (const { url, out } of FILES) {
  process.stdout.write(`Downloading ${out} (${hd ? "10m" : "50m/10m"})... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED (${res.status}) — ${url}`);
    process.exitCode = 1;
    continue;
  }
  const data = await res.text();
  JSON.parse(data); // validation
  await writeFile(join(outDir, out), data);
  console.log(`ok (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
}
