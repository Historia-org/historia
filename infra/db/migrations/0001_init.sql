-- Historia — schéma v1 (Phase 0)
-- Modèle bitemporel : temps HISTORIQUE (valid_*, dates EDTF) ≠ temps d'ÉDITION (changesets, versions).
-- Les feature_state sont IMMUTABLES : une correction crée une nouvelle ligne qui "remplace" l'ancienne.
-- Tout l'historique reste lisible par tous (modèle Wikipedia).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Utilisateurs & changesets (temps d'édition)
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
  -- Forme canonique HistoriaText du changeset (source de vérité lisible humain/LLM)
  historia_text text,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'submitted', 'published', 'rejected', 'reverted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Événements (pages wiki : "Commune de Paris", "Guerre de 100 ans"...)
-- ---------------------------------------------------------------------------

CREATE TABLE event (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL,
  description_md    text,
  -- Bornes de la frise : EDTF (vérité) + bornes date dérivées (requêtage)
  period_start_edtf text,
  period_end_edtf   text,
  period_start      date,
  period_end        date,
  -- Hiérarchie type Wikipedia : événement > phases/sous-événements
  parent_id         bigint REFERENCES event(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Features (les "choses" du monde réel) et leurs états datés
-- ---------------------------------------------------------------------------

CREATE TABLE feature (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  -- barricade, front, frontiere, batiment, bataille, unite_militaire...
  type       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_state (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature_id     bigint NOT NULL REFERENCES feature(id),
  geom           geometry(Geometry, 4326) NOT NULL,

  -- Temps historique : EDTF = vérité (incertitude incluse), bornes date = index
  valid_from_edtf text NOT NULL,
  valid_to_edtf   text,
  valid_from_min  date NOT NULL,
  valid_from_max  date NOT NULL,
  valid_to_min    date,
  valid_to_max    date,

  properties     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Temps d'édition : lignes immutables, remplacement explicite
  changeset_id   bigint NOT NULL REFERENCES changeset(id),
  replaces_id    bigint REFERENCES feature_state(id),
  is_current     boolean NOT NULL DEFAULT true,   -- maintenu par l'API
  is_deleted     boolean NOT NULL DEFAULT false,  -- suppression logique (jamais physique)
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_from_bounds CHECK (valid_from_min <= valid_from_max),
  CONSTRAINT valid_to_bounds   CHECK (valid_to_min IS NULL OR valid_to_max IS NULL
                                      OR valid_to_min <= valid_to_max)
);

CREATE INDEX feature_state_geom_idx     ON feature_state USING gist (geom);
CREATE INDEX feature_state_feature_idx  ON feature_state (feature_id) WHERE is_current;
-- Requête tuile type : WHERE valid_from_max <= :d AND (valid_to_min IS NULL OR valid_to_min >= :d)
CREATE INDEX feature_state_time_idx     ON feature_state (valid_from_max, valid_to_min) WHERE is_current;

CREATE TABLE event_feature (
  event_id   bigint NOT NULL REFERENCES event(id),
  feature_id bigint NOT NULL REFERENCES feature(id),
  role       text,
  PRIMARY KEY (event_id, feature_id)
);

-- ---------------------------------------------------------------------------
-- Sources (le sourçage porte sur l'ÉTAT daté, pas sur la feature)
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
-- Schéma des tuiles (Phase 1 : fonctions MVT paramétrées par date, servies par Martin)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS tiles;

-- ---------------------------------------------------------------------------
-- Seed : événement pilote
-- ---------------------------------------------------------------------------

INSERT INTO event (slug, title, description_md,
                   period_start_edtf, period_end_edtf, period_start, period_end)
VALUES ('commune-de-paris-1871', 'La Commune de Paris',
        'Insurrection parisienne du 18 mars au 28 mai 1871.',
        '1871-03-18', '1871-05-28', DATE '1871-03-18', DATE '1871-05-28');
