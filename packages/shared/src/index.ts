/**
 * @historia/shared — types partagés client/serveur.
 * Miroir TypeScript du schéma SQL (infra/db/migrations) et base du futur
 * format HistoriaText (Phase 2).
 */

/** Date EDTF (ISO 8601-2) : "1871-05-22", "1871-05~" (≈mai 1871), "[1871-05-21..1871-05-23]" */
export type EdtfDate = string;

export type FeatureType =
  | "barricade"
  | "front"
  | "frontiere"
  | "batiment"
  | "bataille"
  | "unite_militaire"
  | string;

export interface HistoriaFeature {
  id: number;
  slug: string;
  type: FeatureType;
}

/** État daté d'une feature — immutable ; le sourçage porte sur l'état. */
export interface FeatureState {
  id: number;
  featureId: number;
  /** GeoJSON geometry (WGS84) */
  geometry: GeoJSON.Geometry;
  validFrom: EdtfDate;
  validTo: EdtfDate | null;
  properties: Record<string, unknown>;
  changesetId: number;
  isCurrent: boolean;
  isDeleted: boolean;
}

export interface HistoriaEvent {
  id: number;
  slug: string;
  title: string;
  periodStart: EdtfDate | null;
  periodEnd: EdtfDate | null;
  parentId: number | null;
}

export type ChangesetStatus =
  | "draft"
  | "submitted"
  | "published"
  | "rejected"
  | "reverted";

export interface SourceRef {
  slug: string;
  pages?: string;
  note?: string;
}

// Namespace GeoJSON minimal pour ne pas dépendre de @types/geojson en Phase 0
declare global {
  namespace GeoJSON {
    interface Geometry {
      type:
        | "Point"
        | "LineString"
        | "Polygon"
        | "MultiPoint"
        | "MultiLineString"
        | "MultiPolygon"
        | "GeometryCollection";
      coordinates?: unknown;
    }
  }
}
