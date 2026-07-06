/**
 * @historia/shared — shared client/server types.
 * TypeScript mirror of the SQL schema (infra/db/migrations) and basis for the
 * future HistoriaText format (Phase 2).
 */

/** EDTF date (ISO 8601-2): "1871-05-22", "1871-05~" (≈May 1871), "[1871-05-21..1871-05-23]" */
export type EdtfDate = string;

export type FeatureType =
  | "barricade"
  | "front"
  | "border"
  | "building"
  | "battle"
  | "military_unit"
  | string;

export interface HistoriaFeature {
  id: number;
  slug: string;
  type: FeatureType;
}

/** Dated state of a feature — immutable; sourcing applies to the state. */
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

// Minimal GeoJSON namespace to avoid depending on @types/geojson in Phase 0
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
