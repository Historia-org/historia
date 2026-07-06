#!/usr/bin/env node
/**
 * Télécharge le fond de carte neutre (Natural Earth, domaine public)
 * vers apps/web/public/data/. À lancer une fois : `pnpm setup:data`
 *
 * Couverture des îles (volet colonisation) :
 *   - ne_50m_land : terres + îles moyennes (Antilles, Nouvelle-Calédonie, Tahiti...)
 *   - ne_10m_minor_islands : petites îles et atolls (Wallis, Tuamotu, Grenadines...)
 *
 * Option --hd : remplace le 50m par ne_10m_land (~25 Mo, chargement plus lent,
 * trait de côte le plus fin). En Phase 1, le fond sera servi en tuiles
 * vectorielles depuis PostGIS (généralisation par zoom) et ces fichiers
 * statiques disparaîtront.
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
  process.stdout.write(`Téléchargement ${out} (${hd ? "10m" : "50m/10m"})... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`ÉCHEC (${res.status}) — ${url}`);
    process.exitCode = 1;
    continue;
  }
  const data = await res.text();
  JSON.parse(data); // validation
  await writeFile(join(outDir, out), data);
  console.log(`ok (${(data.length / 1024 / 1024).toFixed(1)} Mo)`);
}
