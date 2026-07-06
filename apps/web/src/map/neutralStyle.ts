import type { StyleSpecification } from "maplibre-gl";

/**
 * NEUTRAL basemap — no modern elements (roads, present-day cities),
 * so as not to create anachronisms under the historical layers.
 *
 * Data (public domain, Natural Earth, served locally):
 *   - ne_land: 1:50m land (or 1:10m with `pnpm setup:data --hd`)
 *   - ne_minor_islands: 1:10m minor islands/atolls — essential for
 *     colonial history (Oceania, Caribbean)
 *
 * Phase 1: basemap served as vector tiles from PostGIS with
 * zoom-based generalization (full 1:10m coastline without heavy files).
 */
export const neutralStyle: StyleSpecification = {
  version: 8,
  name: "historia-neutral",
  sources: {
    land: {
      type: "geojson",
      data: "/data/ne_land.geojson",
      attribution: "Basemap: Natural Earth (public domain)",
    },
    minorIslands: {
      type: "geojson",
      data: "/data/ne_minor_islands.geojson",
    },
  },
  layers: [
    {
      id: "ocean",
      type: "background",
      paint: { "background-color": "#cdd9d3" },
    },
    {
      id: "land",
      type: "fill",
      source: "land",
      paint: { "fill-color": "#f1ead9" },
    },
    {
      id: "coastline",
      type: "line",
      source: "land",
      paint: {
        "line-color": "#9a8f7a",
        "line-width": 0.8,
      },
    },
    {
      id: "minor-islands",
      type: "fill",
      source: "minorIslands",
      paint: { "fill-color": "#f1ead9" },
    },
    {
      // Slightly heavier line: keeps atolls visible at medium zoom levels
      id: "minor-islands-outline",
      type: "line",
      source: "minorIslands",
      paint: {
        "line-color": "#9a8f7a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 1],
      },
    },
  ],
};
