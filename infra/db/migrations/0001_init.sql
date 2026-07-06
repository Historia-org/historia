-- Historia — schema v1 (Phase 0)
-- Bitemporal model: HISTORICAL time (valid_*, EDTF dates) != EDIT time (changesets, versions).
-- feature_state rows are IMMUTABLE: a correction creates a new row that "replaces" the old one.
-- The full history stays readable by everyone (Wikipedia model).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Users & changesets (edit time)
-- ---------------------------------------------------------------------------

CREATE TABLE app_user (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username    text NOT NULL UNIQUE,
  email       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'contributor'
              CHECK (role IN ('contributor', 'reviewer', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE changeset (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint REFERENCES app_user(id),
  comment       text,
  -- Canonical HistoriaText form of the changeset (human/LLM-readable source of truth)
  historia_text text,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'submitted', 'published', 'rejected', 'reverted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Events (wiki pages: "Paris Commune", "Hundred Years' War"...)
-- ---------------------------------------------------------------------------

CREATE TABLE event (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL,
  description_md    text,
  -- Timeline bounds: EDTF (source of truth) + derived date bounds (querying)
  period_start_edtf text,
  period_end_edtf   text,
  period_start      date,
  period_end        date,
  -- Wikipedia-style hierarchy: event > phases/sub-events
  parent_id         bigint REFERENCES event(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Features (real-world "things") and their dated states
-- ---------------------------------------------------------------------------

CREATE TABLE feature (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  -- barricade, front, border, building, battle, military_unit...
  type       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_state (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature_id     bigint NOT NULL REFERENCES feature(id),
  geom           geometry(Geometry, 4326) NOT NULL,

  -- Historical time: EDTF = source of truth (uncertainty included), date bounds = index
  valid_from_edtf text NOT NULL,
  valid_to_edtf   text,
  valid_from_min  date NOT NULL,
  valid_from_max  date NOT NULL,
  valid_to_min    date,
  valid_to_max    date,

  properties     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Edit time: immutable rows, explicit replacement
  changeset_id   bigint NOT NULL REFERENCES changeset(id),
  replaces_id    bigint REFERENCES feature_state(id),
  is_current     boolean NOT NULL DEFAULT true,   -- maintained by the API
  is_deleted     boolean NOT NULL DEFAULT false,  -- logical deletion (never physical)
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_from_bounds CHECK (valid_from_min <= valid_from_max),
  CONSTRAINT valid_to_bounds   CHECK (valid_to_min IS NULL OR valid_to_max IS NULL
                                      OR valid_to_min <= valid_to_max)
);

CREATE INDEX feature_state_geom_idx     ON feature_state USING gist (geom);
CREATE INDEX feature_state_feature_idx  ON feature_state (feature_id) WHERE is_current;
-- Typical tile query: WHERE valid_from_max <= :d AND (valid_to_min IS NULL OR valid_to_min >= :d)
CREATE INDEX feature_state_time_idx     ON feature_state (valid_from_max, valid_to_min) WHERE is_current;

CREATE TABLE event_feature (
  event_id   bigint NOT NULL REFERENCES event(id),
  feature_id bigint NOT NULL REFERENCES feature(id),
  role       text,
  PRIMARY KEY (event_id, feature_id)
);

-- ---------------------------------------------------------------------------
-- Sources (sourcing applies to the dated STATE, not the feature)
-- ---------------------------------------------------------------------------

CREATE TABLE source (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  kind        text NOT NULL DEFAULT 'book'
              CHECK (kind IN ('book', 'article', 'archive', 'map', 'website', 'other')),
  title       text NOT NULL,
  author      text,
  year        int,
  url         text,
  archive_ref text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_state_source (
  feature_state_id bigint NOT NULL REFERENCES feature_state(id),
  source_id        bigint NOT NULL REFERENCES source(id),
  pages            text,
  note             text,
  PRIMARY KEY (feature_state_id, source_id)
);

-- ---------------------------------------------------------------------------
-- Tile schema (Phase 1: MVT functions parameterized by date, served by Martin)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS tiles;

-- ---------------------------------------------------------------------------
-- Seed: pilot event
-- ---------------------------------------------------------------------------

INSERT INTO event (slug, title, description_md,
                   period_start_edtf, period_end_edtf, period_start, period_end)
VALUES ('commune-de-paris-1871', 'The Paris Commune',
        'Parisian uprising from March 18 to May 28, 1871.',
        '1871-03-18', '1871-05-28', DATE '1871-03-18', DATE '1871-05-28');
