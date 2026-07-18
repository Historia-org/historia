# Period basemap data for Paris ~1871

Survey of usable "period basemap" data to accompany the Paris Commune pilot
event (researched 2026-07-18). The neutral-basemap policy (ARCHITECTURE §3)
still applies: these are **opt-in overlays or import candidates**, not
replacements for the neutral style.

## Integrated

### IGN — Carte de l'État-Major (integrated as the "Period map" overlay)
- **What**: raster WMTS of the 19th-century État-Major map. Two layers on the
  open Géoplateforme endpoint (no API key):
  `GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40` (1:40 000, surveys 1820-1866, whole
  country) and `GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR10` (1:10 000 minutes, Paris
  area, surveys 1818-1824).
- **URL**: `https://data.geopf.fr/wmts?...&LAYER=GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40&...`
  (see `HistoriaMap.tsx`). Verified working over Paris.
- **License**: IGN open data (licence ouverte Etalab 2.0 since 2021).
- **Era caveats**: surveys largely **pre-Haussmann** — the great boulevard
  cuttings (1853-1870) are mostly absent; fine as landscape context (relief,
  fortifications incl. the Thiers wall and forts, faubourgs, villages).

## Vector import candidates (Phase 4 pipeline)

### ALPAGE (Vasserot layers) — best license fit
- Road network (1810-1836), buildings (1810-1860), plots, districts, from the
  Vasserot parcel atlas. Shapefiles, **ODbL** — directly compatible with
  Historia's data license.
- Download: https://alpage.huma-num.fr/gis-data/ (mirrors: Stanford
  EarthWorks/Princeton geoportals, search "Vasserot").
- **Caveat**: covers only **pre-1860 Paris** (inside the Fermiers-Généraux
  wall) — Montmartre, Belleville, Buttes-Chaumont (annexed 1860, central to
  the Commune) are NOT covered. Also pre-Haussmann.

### GeoHistoricalData — Paris street networks
- Vectorized street networks from the Verniquet map (1783-1799) and Jacoubet
  atlas (1825-1837); collaborative vectorization of other Paris plans
  (18th-20th c.) ongoing. **CC-BY 2.0**.
- Mirror: https://dataverse.harvard.edu/dataverse/geohistoricaldata
  (doi:10.7910/DVN/CCESX4). Main site (geohistoricaldata.org) was unreachable
  when checked.

### JADIS (BnF × EPFL)
- AI-georeferenced historical Paris maps (Gallica/IIIF) + vectorized urban
  blocks and street networks across time. **CC-BY 2.0**.
- https://bnf-jadis.github.io/ — worth mining for an 1860s-1871 street network.

### OpenHistoricalMap
- ODbL, import pipeline already planned (ARCHITECTURE §8). Paris 1871
  coverage unverified — check with the time slider / Overpass before relying
  on it. https://www.openhistoricalmap.org/

## Era-exact but needs work

### Atlas municipal des vingt arrondissements (1868 / 1878)
- The city's own plan, **era-exact and covers the annexed arrondissements**.
  Public-domain scans (Gallica / Bibliothèque de l'Hôtel de Ville).
- Not served as tiles anywhere found; would need georeferencing (e.g.
  [Allmaps](https://allmaps.org/) on the IIIF scans → XYZ/IIIF tiles), or
  vectorization as a contribution drive. Strong Phase 4+ candidate.

## Rejected

- **David Rumsey collection** (georeferenced 1871 Paris maps): CC-BY-**NC**-SA
  — non-commercial clause conflicts with Historia's open-reuse goals.
