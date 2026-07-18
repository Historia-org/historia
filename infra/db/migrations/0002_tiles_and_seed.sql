-- Historia — Phase 1: temporal tile function + Paris Commune seed data.
--
-- tiles.features(z, x, y, query_params) is auto-published by Martin
-- (see infra/martin/martin.yaml) as http://martin:3000/features/{z}/{x}/{y}.
-- The "date" query parameter filters feature states by HISTORICAL validity:
-- a state is visible at date d iff it certainly started (valid_from_max <= d)
-- and has not certainly ended (valid_to_min IS NULL OR valid_to_min >= d).
-- valid_to is INCLUSIVE (the state still holds on its last day).

CREATE OR REPLACE FUNCTION tiles.features(z integer, x integer, y integer, query_params json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE
AS $$
DECLARE
  d   date;
  mvt bytea;
BEGIN
  -- Default to the pilot event's most documented day (Bloody Week begins)
  d := COALESCE((query_params ->> 'date')::date, DATE '1871-05-21');

  SELECT INTO mvt ST_AsMVT(tile, 'features', 4096, 'geom')
  FROM (
    SELECT
      fs.id,
      f.slug,
      f.type,
      fs.properties ->> 'name'  AS name,
      fs.properties ->> 'side'  AS side,
      fs.valid_from_edtf,
      fs.valid_to_edtf,
      ST_AsMVTGeom(
        ST_Transform(fs.geom, 3857),
        ST_TileEnvelope(z, x, y),
        4096, 64, true
      ) AS geom
    FROM feature_state fs
    JOIN feature f ON f.id = fs.feature_id
    WHERE fs.is_current
      AND NOT fs.is_deleted
      AND fs.valid_from_max <= d
      AND (fs.valid_to_min IS NULL OR fs.valid_to_min >= d)
      AND fs.geom && ST_Transform(ST_TileEnvelope(z, x, y), 4326)
  ) AS tile
  WHERE geom IS NOT NULL;

  RETURN mvt;
END;
$$;

-- Breakpoint dates for an event: the days on which the visible set of states
-- changes. Between two consecutive breakpoints the map is IDENTICAL, so the
-- client snaps tile requests to the previous breakpoint and HTTP caching
-- collapses 72 possible days into ~a dozen distinct tile URLs.
CREATE OR REPLACE FUNCTION event_breakpoints(p_event_slug text)
RETURNS SETOF date
LANGUAGE sql STABLE
AS $$
  WITH ev AS (
    SELECT id, period_start, period_end FROM event WHERE slug = p_event_slug
  ),
  states AS (
    SELECT fs.valid_from_max, fs.valid_to_min
    FROM feature_state fs
    JOIN event_feature ef ON ef.feature_id = fs.feature_id
    JOIN ev ON ev.id = ef.event_id
    WHERE fs.is_current AND NOT fs.is_deleted
  ),
  days AS (
    SELECT valid_from_max AS d FROM states                    -- a state appears
    UNION
    SELECT valid_to_min + 1 FROM states                       -- a state disappears
      WHERE valid_to_min IS NOT NULL
    UNION
    SELECT period_start FROM ev                               -- timeline origin
  )
  SELECT d FROM days, ev
  WHERE d >= ev.period_start AND (ev.period_end IS NULL OR d <= ev.period_end)
  ORDER BY d;
$$;

-- ---------------------------------------------------------------------------
-- Seed: Paris Commune pilot data (one published changeset).
-- Geometries are deliberately coarse (5-decimal WKT, ≈1 m grid) — they exist
-- to exercise the temporal pipeline, not as historical authority. Every state
-- is sourced (§4: sourcing applies to the dated state).
-- ---------------------------------------------------------------------------

INSERT INTO changeset (comment, status, published_at)
VALUES ('Phase 1 seed — Paris Commune pilot dataset', 'published', now());

INSERT INTO source (slug, kind, title, author, year) VALUES
  ('lissagaray-1876', 'book', 'Histoire de la Commune de 1871', 'Prosper-Olivier Lissagaray', 1876),
  ('rougerie-2014',   'book', 'La Commune de 1871', 'Jacques Rougerie', 2014),
  ('tombs-1999',      'book', 'The Paris Commune 1871', 'Robert Tombs', 1999);

INSERT INTO feature (slug, type) VALUES
  ('wall/enceinte-de-thiers',          'wall'),
  ('battle/canons-de-montmartre',      'battle'),
  ('fort/issy',                        'fort'),
  ('fort/vanves',                      'fort'),
  ('front/versaillais',                'front'),
  ('barricade/rue-de-rivoli',          'barricade'),
  ('barricade/rue-saint-florentin',    'barricade'),
  ('barricade/place-blanche',          'barricade'),
  ('barricade/faubourg-saint-antoine', 'barricade'),
  ('barricade/rue-ramponeau',          'barricade'),
  ('battle/mur-des-federes',           'battle');

INSERT INTO event_feature (event_id, feature_id, role)
SELECT e.id, f.id, f.type
FROM event e, feature f
WHERE e.slug = 'commune-de-paris-1871';

-- Convenience: the seed changeset id
CREATE TEMP VIEW seed_cs AS
  SELECT id FROM changeset WHERE comment = 'Phase 1 seed — Paris Commune pilot dataset';

INSERT INTO feature_state
  (feature_id, geom, valid_from_edtf, valid_to_edtf,
   valid_from_min, valid_from_max, valid_to_min, valid_to_max,
   properties, changeset_id)
VALUES
  -- Thiers wall: fortified enclosure of Paris, static for the whole event
  ((SELECT id FROM feature WHERE slug = 'wall/enceinte-de-thiers'),
   ST_GeomFromText('LINESTRING (2.27690 48.87810, 2.31330 48.89760, 2.35920 48.89960, 2.38600 48.89780, 2.40640 48.87700, 2.40880 48.86460, 2.41060 48.84710, 2.39210 48.83320, 2.36910 48.82150, 2.35970 48.81880, 2.32550 48.82310, 2.30530 48.82730, 2.28760 48.83270, 2.25700 48.83780, 2.25820 48.84800, 2.26340 48.86290, 2.27690 48.87810)', 4326),
   '1871-03-18', '1871-05-28', DATE '1871-03-18', DATE '1871-03-18', DATE '1871-05-28', DATE '1871-05-28',
   '{"name": "Enceinte de Thiers"}', (SELECT id FROM seed_cs)),

  -- March 18: the National Guard keeps its cannons on the Montmartre butte —
  -- the spark of the insurrection
  ((SELECT id FROM feature WHERE slug = 'battle/canons-de-montmartre'),
   ST_GeomFromText('POINT (2.34310 48.88670)', 4326),
   '1871-03-18', '1871-03-18', DATE '1871-03-18', DATE '1871-03-18', DATE '1871-03-18', DATE '1871-03-18',
   '{"name": "Cannons of Montmartre", "side": "communards"}', (SELECT id FROM seed_cs)),

  -- Fort d''Issy: held by the Commune, evacuated during the night of May 8-9
  -- (EDTF interval on valid_to: the exact evacuation day is uncertain)
  ((SELECT id FROM feature WHERE slug = 'fort/issy'),
   ST_GeomFromText('POINT (2.27430 48.82180)', 4326),
   '1871-03-18', '[1871-05-08..1871-05-09]',
   DATE '1871-03-18', DATE '1871-03-18', DATE '1871-05-08', DATE '1871-05-09',
   '{"name": "Fort d''Issy", "side": "communards"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'fort/issy'),
   ST_GeomFromText('POINT (2.27430 48.82180)', 4326),
   '1871-05-09', '1871-05-28', DATE '1871-05-09', DATE '1871-05-09', DATE '1871-05-28', DATE '1871-05-28',
   '{"name": "Fort d''Issy", "side": "versaillais"}', (SELECT id FROM seed_cs)),

  -- Fort de Vanves: evacuated May 13
  ((SELECT id FROM feature WHERE slug = 'fort/vanves'),
   ST_GeomFromText('POINT (2.29050 48.82240)', 4326),
   '1871-03-18', '1871-05-13', DATE '1871-03-18', DATE '1871-03-18', DATE '1871-05-13', DATE '1871-05-13',
   '{"name": "Fort de Vanves", "side": "communards"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'fort/vanves'),
   ST_GeomFromText('POINT (2.29050 48.82240)', 4326),
   '1871-05-14', '1871-05-28', DATE '1871-05-14', DATE '1871-05-14', DATE '1871-05-28', DATE '1871-05-28',
   '{"name": "Fort de Vanves", "side": "versaillais"}', (SELECT id FROM seed_cs)),

  -- Versailles army front line during Bloody Week: one state per day,
  -- sweeping Paris west → east (successive states, no interpolation — §4)
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.25700 48.83780, 2.25820 48.84800, 2.26340 48.86290)', 4326),
   '1871-05-21', '1871-05-21', DATE '1871-05-21', DATE '1871-05-21', DATE '1871-05-21', DATE '1871-05-21',
   '{"name": "Versailles front — entry at Porte de Saint-Cloud", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.29500 48.89500, 2.29200 48.87400, 2.28700 48.85900, 2.27600 48.84400)', 4326),
   '1871-05-22', '1871-05-22', DATE '1871-05-22', DATE '1871-05-22', DATE '1871-05-22', DATE '1871-05-22',
   '{"name": "Versailles front — 16th and 17th arrondissements", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.33000 48.90000, 2.32600 48.88300, 2.32200 48.87100, 2.31300 48.85600, 2.30500 48.84100)', 4326),
   '1871-05-23', '1871-05-23', DATE '1871-05-23', DATE '1871-05-23', DATE '1871-05-23', DATE '1871-05-23',
   '{"name": "Versailles front — fall of Montmartre", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.35500 48.89900, 2.34800 48.88200, 2.34700 48.86000, 2.34400 48.84600, 2.33500 48.82800)', 4326),
   '1871-05-24', '1871-05-24', DATE '1871-05-24', DATE '1871-05-24', DATE '1871-05-24', DATE '1871-05-24',
   '{"name": "Versailles front — Hôtel de Ville, Latin Quarter", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.37000 48.89800, 2.36400 48.88000, 2.36300 48.86700, 2.36000 48.84000, 2.35500 48.82300)', 4326),
   '1871-05-25', '1871-05-25', DATE '1871-05-25', DATE '1871-05-25', DATE '1871-05-25', DATE '1871-05-25',
   '{"name": "Versailles front — Château-d''Eau, Butte-aux-Cailles", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.38500 48.89700, 2.37600 48.88000, 2.36900 48.85300, 2.37000 48.83300)', 4326),
   '1871-05-26', '1871-05-26', DATE '1871-05-26', DATE '1871-05-26', DATE '1871-05-26', DATE '1871-05-26',
   '{"name": "Versailles front — Bastille, Faubourg Saint-Antoine", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.39000 48.89300, 2.38700 48.87600, 2.39600 48.86100, 2.39800 48.84600)', 4326),
   '1871-05-27', '1871-05-27', DATE '1871-05-27', DATE '1871-05-27', DATE '1871-05-27', DATE '1871-05-27',
   '{"name": "Versailles front — Buttes-Chaumont, Père-Lachaise", "side": "versaillais"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'front/versaillais'),
   ST_GeomFromText('LINESTRING (2.39900 48.87900, 2.38800 48.87200, 2.39500 48.86500)', 4326),
   '1871-05-28', '1871-05-28', DATE '1871-05-28', DATE '1871-05-28', DATE '1871-05-28', DATE '1871-05-28',
   '{"name": "Versailles front — last pocket in Belleville", "side": "versaillais"}', (SELECT id FROM seed_cs)),

  -- Bloody Week barricades
  ((SELECT id FROM feature WHERE slug = 'barricade/rue-de-rivoli'),
   ST_GeomFromText('LINESTRING (2.34850 48.85830, 2.34960 48.85790)', 4326),
   '1871-05-22', '1871-05-24', DATE '1871-05-22', DATE '1871-05-22', DATE '1871-05-24', DATE '1871-05-24',
   '{"name": "Barricade on Rue de Rivoli (Saint-Jacques)", "side": "communards"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'barricade/rue-saint-florentin'),
   ST_GeomFromText('LINESTRING (2.32270 48.86690, 2.32330 48.86620)', 4326),
   '1871-05-22', '1871-05-23', DATE '1871-05-22', DATE '1871-05-22', DATE '1871-05-23', DATE '1871-05-23',
   '{"name": "Barricade at Rue Saint-Florentin (Concorde)", "side": "communards"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'barricade/place-blanche'),
   ST_GeomFromText('LINESTRING (2.33200 48.88370, 2.33320 48.88390)', 4326),
   '1871-05-23', '1871-05-23', DATE '1871-05-23', DATE '1871-05-23', DATE '1871-05-23', DATE '1871-05-23',
   '{"name": "Barricade at Place Blanche (women''s battalion)", "side": "communards"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'barricade/faubourg-saint-antoine'),
   ST_GeomFromText('LINESTRING (2.37200 48.85180, 2.37330 48.85150)', 4326),
   '1871-05-25', '1871-05-26', DATE '1871-05-25', DATE '1871-05-25', DATE '1871-05-26', DATE '1871-05-26',
   '{"name": "Barricade on Faubourg Saint-Antoine", "side": "communards"}', (SELECT id FROM seed_cs)),
  ((SELECT id FROM feature WHERE slug = 'barricade/rue-ramponeau'),
   ST_GeomFromText('LINESTRING (2.38330 48.87200, 2.38400 48.87230)', 4326),
   '1871-05-28', '1871-05-28', DATE '1871-05-28', DATE '1871-05-28', DATE '1871-05-28', DATE '1871-05-28',
   '{"name": "Barricade on Rue Ramponeau — the last one", "side": "communards"}', (SELECT id FROM seed_cs)),

  -- May 27-28: last fighting and executions at Père-Lachaise
  ((SELECT id FROM feature WHERE slug = 'battle/mur-des-federes'),
   ST_GeomFromText('POINT (2.40300 48.85980)', 4326),
   '1871-05-27', '1871-05-28', DATE '1871-05-27', DATE '1871-05-27', DATE '1871-05-28', DATE '1871-05-28',
   '{"name": "Père-Lachaise — Mur des Fédérés", "side": "communards"}', (SELECT id FROM seed_cs));

-- Sourcing per dated state (coarse for the seed: one reference per feature)
INSERT INTO feature_state_source (feature_state_id, source_id, pages, note)
SELECT fs.id, s.id,
       CASE WHEN f.slug = 'barricade/rue-de-rivoli' THEN '312' END,
       CASE WHEN f.slug = 'barricade/rue-de-rivoli'
            THEN 'mentioned as held until the morning of the 24th' END
FROM feature_state fs
JOIN feature f ON f.id = fs.feature_id
JOIN source s ON s.slug = CASE
  WHEN f.type IN ('barricade', 'battle') THEN 'lissagaray-1876'
  WHEN f.type = 'front'                  THEN 'tombs-1999'
  ELSE 'rougerie-2014'
END;

DROP VIEW seed_cs;
