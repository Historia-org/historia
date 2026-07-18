import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { neutralStyle } from "./neutralStyle";

/** Initial view: Paris (pilot event: 1871 Commune). */
const PARIS: [number, number] = [2.3522, 48.8566];

/**
 * Temporal tiles: Martin serves tiles.features(z, x, y, ?date=...) from
 * PostGIS. Proxied by Vite under /tiles (see vite.config.ts) — the URL must
 * be absolute because MapLibre resolves tile templates outside the DOM.
 *
 * The template keeps a "date=current" placeholder: the actual date is injected
 * per request by transformRequest, and date changes call map.refreshTiles()
 * instead of source.setTiles() — setTiles leaves already-retained tiles
 * unrefreshed, which kept ghost geometries from previous dates on screen.
 */
const TILES_TEMPLATE = `/tiles/features/{z}/{x}/{y}?date=current`;

/** Side colors: communards red / Versailles army blue / neutral sepia. */
const SIDE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "side"],
  "communards",
  "#b03a2e",
  "versaillais",
  "#2e5090",
  "#6b6156",
];

const popupHtml = (f: MapGeoJSONFeature) => {
  const p = f.properties as Record<string, string | undefined>;
  const period = p.valid_to_edtf
    ? `${p.valid_from_edtf} → ${p.valid_to_edtf}`
    : `from ${p.valid_from_edtf}`;
  return `
    <div class="feature-popup">
      <strong>${p.name ?? f.id}</strong>
      <div class="feature-popup-meta">
        <span>${p.type}${p.side ? ` · ${p.side}` : ""}</span>
        <span>${period}</span>
      </div>
    </div>`;
};

interface HistoriaMapProps {
  /** Tile date (ISO). Snapped to a breakpoint by the parent for cacheability. */
  date: string;
}

/**
 * Period basemap overlay: IGN "Carte de l'État-Major" (surveys 1820-1866),
 * the closest openly-tiled map to the 1871 pilot event. Served without an API
 * key from the Géoplateforme open WMTS endpoint (IGN open data, Etalab
 * licence). Raster overlay only — Historia's own data stays vector on top.
 */
const ETAT_MAJOR_TILES =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40&STYLE=normal&FORMAT=image/jpeg" +
  "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

export default function HistoriaMap({ date }: HistoriaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;
  const [periodMap, setPeriodMap] = useState(false);
  const [periodOpacity, setPeriodOpacity] = useState(0.8);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: neutralStyle,
      center: PARIS,
      zoom: 11.3,
      attributionControl: { compact: true },
      transformRequest: (url) => {
        if (url.includes("/tiles/features/")) {
          return {
            url: `${location.origin}${new URL(url, location.origin).pathname}?date=${dateRef.current}`,
          };
        }
      },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    if (import.meta.env.DEV) {
      // Dev-only handle for debugging/E2E checks from the console
      (window as unknown as Record<string, unknown>).__historiaMap = map;
    }

    map.on("load", () => {
      map.addSource("etat-major", {
        type: "raster",
        tiles: [ETAT_MAJOR_TILES],
        tileSize: 256,
        minzoom: 6,
        maxzoom: 15,
        attribution:
          'Period map: <a href="https://geoservices.ign.fr/scanem40">IGN — Carte de l\'État-Major (1820-1866)</a>',
      });
      map.addLayer({
        id: "etat-major",
        type: "raster",
        source: "etat-major",
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.8 },
      });

      map.addSource("historia", {
        type: "vector",
        tiles: [TILES_TEMPLATE],
        minzoom: 0,
        maxzoom: 14,
        attribution: "Historical data: Historia contributors (ODbL)",
      });

      map.addLayer({
        id: "walls",
        type: "line",
        source: "historia",
        "source-layer": "features",
        filter: ["==", ["get", "type"], "wall"],
        paint: {
          "line-color": "#7a6f5c",
          "line-width": 1.6,
          "line-dasharray": [3, 2],
        },
      });
      map.addLayer({
        id: "fronts",
        type: "line",
        source: "historia",
        "source-layer": "features",
        filter: ["==", ["get", "type"], "front"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": SIDE_COLOR,
          "line-width": 3,
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "barricades",
        type: "line",
        source: "historia",
        "source-layer": "features",
        filter: ["==", ["get", "type"], "barricade"],
        layout: { "line-cap": "round" },
        paint: { "line-color": SIDE_COLOR, "line-width": 4 },
      });
      // Barricades are ~100 m long: a halo keeps them findable at low zoom
      map.addLayer({
        id: "barricades-halo",
        type: "circle",
        source: "historia",
        "source-layer": "features",
        filter: ["==", ["get", "type"], "barricade"],
        maxzoom: 13,
        paint: {
          "circle-color": SIDE_COLOR,
          "circle-radius": 4,
          "circle-opacity": 0.35,
        },
      });
      map.addLayer({
        id: "sites",
        type: "circle",
        source: "historia",
        "source-layer": "features",
        filter: ["in", ["get", "type"], ["literal", ["fort", "battle"]]],
        paint: {
          "circle-color": SIDE_COLOR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 7],
          "circle-stroke-color": "#f4efe6",
          "circle-stroke-width": 1.5,
        },
      });

      const interactive = ["sites", "barricades", "barricades-halo", "fronts"];
      map.on("click", interactive, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup({ closeButton: false, maxWidth: "280px" })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(f))
          .addTo(map);
      });
      map.on("mouseenter", interactive, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", interactive, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Date change: refetch every tile of the source. transformRequest injects
  // the new date, so identical dates still share browser/CDN HTTP cache
  // entries thanks to breakpoint snapping by the parent.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource("historia")) map.refreshTiles("historia");
  }, [date]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("etat-major")) return;
    map.setLayoutProperty(
      "etat-major",
      "visibility",
      periodMap ? "visible" : "none"
    );
    map.setPaintProperty("etat-major", "raster-opacity", periodOpacity);
  }, [periodMap, periodOpacity]);

  return (
    <div className="map-container">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-layer-control">
        <label>
          <input
            type="checkbox"
            checked={periodMap}
            onChange={(e) => setPeriodMap(e.target.checked)}
          />
          Period map (1820-1866)
        </label>
        {periodMap && (
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={periodOpacity}
            aria-label="Period map opacity"
            onChange={(e) => setPeriodOpacity(Number(e.target.value))}
          />
        )}
      </div>
    </div>
  );
}
