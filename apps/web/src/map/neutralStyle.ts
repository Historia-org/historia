import type { StyleSpecification } from "maplibre-gl";

/**
 * Fond de carte NEUTRE — pas d'éléments modernes (routes, villes actuelles),
 * pour ne pas créer d'anachronisme sous les couches historiques.
 *
 * Données (domaine public, Natural Earth, servies en local) :
 *   - ne_land : terres 1:50m (ou 1:10m avec `pnpm setup:data --hd`)
 *   - ne_minor_islands : petites îles/atolls 1:10m — indispensable pour
 *     l'histoire coloniale (Océanie, Caraïbes)
 *
 * Phase 1 : fond servi en tuiles vectorielles depuis PostGIS avec
 * généralisation par zoom (trait 1:10m complet sans gros fichiers).
 */
export const neutralStyle: StyleSpecification = {
  version: 8,
  name: "historia-neutral",
  sources: {
    land: {
      type: "geojson",
      data: "/data/ne_land.geojson",
      attribution: "Fond : Natural Earth (domaine public)",
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
      // Trait légèrement plus marqué : garde les atolls visibles aux zooms moyens
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
