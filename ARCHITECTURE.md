# Historia — Architecture & development plan

> Wikipedia of historical mapping: a web map where borders, positions, and events evolve along a timeline, fed by a collaborative portal.
> Pilot case: **the Paris Commune (1871)** — urban scale, day-level granularity, abundant sources.

---

## 1. Assessment of the project

The need is real and the niche is not saturated. Existing projects worth knowing:

| Project | What it does | Limitation |
|---|---|---|
| [OpenHistoricalMap](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap) (OHM) | Full fork of the OSM stack with a temporal dimension (`start_date`/`end_date`, time slider) | Oriented toward a "feature database," no event narrative (no "Hundred Years' War" page with a dedicated timeline) |
| Chronas | World map + timeline, linked to Wikipedia | Year-level granularity, poorly maintained project |
| GeaCron | World borders by year | Proprietary, closed, not collaborative |

**Historia's differentiator**: entry through a *historical event* (a war, a revolution) with a fine-grained timeline (day by day when sources allow), rather than entry through "the map of the world in year X." This is a strong editorial angle that none of the three cover.

**The two real challenges are not technical:**
1. **The temporal data model** — representing geometries valid over date ranges, with uncertainty ("around 1420", "before May 1871") and sourcing. This is the core of the project and needs to be locked down early.
2. **Collaborative governance** — who decides when two contributors propose two conflicting front lines? Mandatory sourcing and a review workflow are essential from v1 onward, since this starts out collaborative.

---

## 2. How OSM is served (answering your question)

The OSM stack strictly separates three roles, and performance comes from specialized components — not from the application's language:

1. **Storage**: PostgreSQL + **PostGIS** (C). All heavy geometric computation (intersections, GIST spatial indexes, simplification) happens in the database.
2. **Tiles**: historically Mapnik/mod_tile (raster, C++). Since [July 2025, osm.org serves vector tiles](https://blog.openstreetmap.org/2025/07/22/vector-tiles-are-deployed-on-openstreetmap-org/) (Shortbread schema) via a dedicated backend. The modern self-hostable equivalent is [**Martin**](https://github.com/maplibre/martin) (Rust): it generates MVT tiles on the fly from PostGIS and can absorb heavy traffic.
3. **Editing API**: the OSM site is Ruby on Rails; bulk read endpoints are delegated to `cgimap` (C++).

**Conclusion for Historia: yes, TypeScript is enough** for the API/business layer, because that layer does neither geometric computation nor rendering — it orchestrates. The critical pipeline is:

```
PostGIS (C) ──SQL functions──▶ Martin (Rust) ──MVT──▶ CDN/cache ──▶ MapLibre GL (client, GPU)
```

The TypeScript API only touches geometries for editing (validation, changesets), which is low volume. If heavy processing ever appears (batch topological simplification, mass imports), it gets written as a separate worker (Rust/Python) without touching the rest.

---

## 3. Target architecture

```
┌─────────────────────────── CLIENT (browser) ───────────────────────────┐
│  React + MapLibre GL JS                                                   │
│  • Vector map (GPU rendering)         • Timeline (component)              │
│  • Geometry editor (Terra Draw)       • Event pages (wiki)                │
└──────────────┬──────────────────────────────┬──────────────────────────────┘
               │ MVT tiles ?date=1871-05-21   │ REST/JSON (auth, editing, wiki)
┌──────────────▼──────────────┐  ┌────────────▼───────────────────────────────┐
│  Martin (Rust)               │  │  Node.js / TypeScript API (Fastify)        │
│  SQL function sources        │  │  • Auth (sessions/OIDC)                    │
│  parameterized by date        │  │  • Changesets, validation, moderation      │
│  + HTTP cache (Caddy/CDN)     │  │  • Event pages, sources, search            │
└──────────────┬──────────────┘  └────────────┬───────────────────────────────┘
               └───────────────┬──────────────┘
                    ┌──────────▼──────────┐
                    │ PostgreSQL + PostGIS │   (+ neutral basemap:
                    │ bitemporal model      │    terrain/hydrography without
                    └─────────────────────┘    modern roads or cities)
```

Everything runs on **Docker Compose on a VPS** (Hetzner/OVH), Caddy reverse proxy, Cloudflare CDN in front of the tiles. A single server is enough for a long time if tile caching is well designed.

### Point of attention: the basemap
A modern OSM basemap shows highways and present-day cities — anachronistic under an 1871 map. Plan for a "neutral" MapLibre style (terrain, hydrography, coastline — sources: Natural Earth, OpenFreeMap with a trimmed-down style). The historical Paris parcel layout will come later from the contributions themselves.

Islands requirement (colonization angle, French empire): the 1:110m coastline drops most of the islands in Oceania and the Caribbean. Phase 0: 1:50m land + `ne_10m_minor_islands` layer (atolls). Phase 1: load Natural Earth 1:10m into PostGIS and serve the basemap via Martin with zoom-based generalization (`ST_Simplify` by z) — full coverage without heavy client-side files.

---

## 4. Temporal data model (the core)

### Principle: bitemporality
Two independent time axes, never to be confused:
- **Historical time** (`valid_from`, `valid_to`): when the thing existed in the real world.
- **Edit time** (versions, changesets): who changed what, when, in the database — needed for the wiki (history, revert, diff).

### Conceptual schema

```sql
-- A real-world "thing," stable over time (e.g. "Thiers wall",
-- "barricade on Rue de Rivoli", "Versaillais front")
feature (id, type, slug)

-- Its geometric state over a historical time interval.
-- A feature has N successive states (≈ OHM's "chronology relation").
feature_state (
  id, feature_id,
  geom            geometry,        -- point / line / polygon
  valid_from      edtf,            -- EDTF dates: '1871-05-21', '1871-05~' (≈May), '[1871-05-21..1871-05-23]'
  valid_to        edtf,
  valid_from_min  date,            -- derived bounds for indexing/querying
  valid_from_max  date,
  properties      jsonb,           -- name, side, headcount...
  version         int,             -- edit versioning
  changeset_id    bigint
)

feature_state_source (feature_state_id, source_id, page, note)  -- sourcing per assertion
source (id, type, title, author, url, archive_ref)

event (id, slug, title, period, description_md)        -- "Paris Commune" page
event_feature (event_id, feature_id, role)              -- attaching features
changeset (id, user_id, created_at, comment, status)    -- editing + moderation
```

### Structural choices
- **Dates in [EDTF](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Dates_And_Times)** (ISO 8601-2): natively handles uncertainty and approximation, a standard adopted by OHM — nothing reinvented, and it keeps import/export compatibility with OHM (ODbL license).
- **Derived `_min`/`_max` columns** in `date` for queries: B-tree index, and the tile query becomes `WHERE valid_from_max <= :d AND (valid_to_min IS NULL OR valid_to_min >= :d)`.
- **Successive states rather than interpolated geometries**: a moving front = a sequence of `feature_state` rows. Visual interpolation between two states is a client-side refinement, added later.
- **Sourcing at the state level**, not the feature level: it's the dated shape that needs to be justified.

### The editing format: textual, deterministic, human- and LLM-readable

Every contribution is represented in a canonical text format — call it **HistoriaText** — which is the *lingua franca* between the UI, the API, and LLMs. The map UI (Terra Draw drawing, forms) only generates this format; a historian can read it, an LLM can produce or review it, a developer can diff it.

```yaml
# changeset — Rue de Rivoli barricade
feature: barricade/rue-de-rivoli
type: barricade
event: commune-de-paris-1871
states:
  - valid: 1871-05-22 / 1871-05-24        # EDTF: "1871-05~" = around May 1871
    geometry: LINESTRING (2.35220 48.85660, 2.35310 48.85640)
    properties:
      side: communards
      estimated_height: uncertain
    sources:
      - ref: lissagaray-1876
        page: 312
        note: "mentioned as held until the morning of the 24th"
```

Determinism rules (essential for diffs and reproducibility): canonical serialization — ordered keys, geometries in WKT with fixed precision (5 decimals ≈ 1 m), normalized EDTF dates, UTF-8/LF encoding. Two exports of the same state are byte-for-byte identical. Every changeset is stored **both** in the relational database (for querying) **and** in its HistoriaText form (for readability, auditing, Wikipedia-style diffs). It's the equivalent of OSM's XML, but designed from the start to be written by hand or by an agent.

### Public history, Wikipedia-style

As on Wikipedia: **every revision is kept, public, and readable by everyone**, with a hierarchical browsing structure — Event → Sub-events/Phases → Features → States → Revisions. Every page (event or feature) exposes a "history" tab: list of changesets, side-by-side HistoriaText diff + visual geometric diff on the map, one-click revert for reviewers. Nothing is deleted, everything is attributed.

### Serving the data efficiently

Martin exposes *function sources*: a PostGIS SQL function that takes `(z, x, y, date)` and returns the MVT tile filtered by time. On the caching side, we don't cache by arbitrary day but by **breakpoint dates**: the list of distinct `valid_from/valid_to` values in an area defines ranges where the map is identical → the client "snaps" the timeline to these breakpoints and HTTP caching becomes very efficient. For low zoom levels, pre-generated snapshots in PMTiles.

---

## 5. Technology building blocks

| Role | Choice | License | Why |
|---|---|---|---|
| Database | PostgreSQL 16 + PostGIS | PostgreSQL (permissive) / **GPL-2.0**¹ | Absolute standard for geospatial, spatial + temporal indexes |
| Tile server | Martin (Rust) | MIT / Apache-2.0 | On-the-fly MVT from PostGIS, parameterized function sources, very fast |
| Business API | Node.js + TypeScript, Fastify | MIT | Maintainable, typed, sufficient (see §2); direct SQL via Kysely (MIT) |
| Front end | React + MapLibre GL JS | MIT / BSD-3 | GPU vector rendering, rich ecosystem |
| Geometry editing | Terra Draw (MapLibre plugin) | MIT | Point/line/polygon drawing in the browser |
| Timeline | Custom component (D3 or canvas) | ISC (D3) | This is the project's signature UX, not to be outsourced to a generic library |
| Historical dates | EDTF (`edtf.js` lib + SQL parsing) | MIT | Uncertainty/approximation, OHM compatibility |
| Interpolation (v2+) | flubber / turf.js on the client | MIT | Morphing geometries between two dated states (see Phase 5) |
| Auth | Auth.js or Lucia (email + OAuth) | ISC / MIT | Simple, self-hosted |
| Deployment | Docker Compose + Caddy + Cloudflare | Apache-2.0 | Single VPS, automatic TLS, CDN tile caching |
| Monorepo | pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`) | MIT | Shared client/server types |

¹ PostGIS is GPL-2.0, but used as a **separate service via SQL**: the GPL only applies to derivative works (forking, linking), not to a client that sends queries. Your code is therefore not contaminated. There's no serious permissive alternative to PostGIS anyway.

---

## 6. Development plan

### Phase 0 — Foundations (≈1-2 weeks)
- pnpm monorepo, Docker Compose (PostGIS + Martin + API + front end), basic CI.
- SQL schema v1 (§4) + migrations. Neutral basemap style.
- **Deliverable: an empty MapLibre map on a neutral basemap, served locally.**

### Phase 1 — Read-only map core (≈3-5 weeks)
- Temporal tile SQL functions + Martin config; manual seed of a few Commune barricades/fronts.
- Timeline component: March 18 → May 28, 1871 range, day-level cursor, snapping to breakpoint dates.
- Minimal event page (title, description, map + timeline).
- **Deliverable: scrolling the timeline makes geometries appear/disappear. The demo that validates the whole concept.**

### Phase 2 — Collaborative portal (≈5-8 weeks)
- **HistoriaText** spec and parser (canonical serialization, database ⇄ text round-trip guaranteed by tests).
- Auth, profiles. Editor: draw/edit a geometry, enter EDTF dates (with an uncertainty UI), **mandatory source**. The UI generates HistoriaText, visible in a "source" tab before submission.
- Changesets: submission → review → publication. Full public history and per-feature revert.
- **Deliverable: a third party can contribute a sourced barricade via the UI; an LLM can produce the same changeset as text.**

### Phase 3 — Wiki & rich browsing (≈4-6 weeks)
- Full event pages (markdown, bibliography, dated sub-events linked to the timeline).
- Visual geometry diff between versions (essential for moderation), roles (contributor/reviewer/admin), search.
- **Deliverable: the full wiki cycle — browse, contribute, review, discuss.**

### Phase 4 — Scale & openness
- CDN + range-based cache policy, PMTiles for low zoom levels, monitoring (Grafana).
- Public read API + HistoriaText/GeoJSON export (for schools, museums: embeddable `<iframe>`/web component widget).
- Second pilot event at a larger spatial scale (e.g. the Hundred Years' War) to stress-test the model on national borders.
- OHM import/export pipeline (ODbL ⇄ ODbL, see §8): bootstrapping the historical basemap from OHM with provenance tracked per changeset.

### Phase 5 — Interpolation mode ("documentary")
- Client-side morphing between two successive `feature_state` rows (flubber for polygons, vertex interpolation for lines/fronts): the border *slides* as you play the timeline, like in a documentary.
- The breakpoint-based model remains the source of truth; interpolation is an optional display mode, visually marked as a reconstruction (not sourced data).
- Optional: unsourced intermediate waypoints (`interpolation_hint`) to guide morphing in complex cases.

---

## 7. Risks & things to watch

- **The data model is the point of no return**: prototype the temporal query (Phase 1) before building editing on top of it.
- **Historical uncertainty ≠ absence of data**: the UI must distinguish "uncertain shape" (dashed lines, halo) from "nothing at this date." Planned in the model (EDTF), to be planned in the style too.
- **Cold-start moderation**: starting collaborative without a community means little spam at first, but lock down the review workflow before any public opening.
- **Don't fork the OSM stack** (Rails, osm2pgsql...): it's built for an entire planet and would slow you down. Draw inspiration from OHM's *model* (EDTF, chronologies), not its code.

## 8. Licenses

Goal: free reuse (schools, museums, embedding in their pages/screens) with **attribution** as the only obligation, and import compatibility with the OSM/OHM ecosystem.

| What | License | Effect |
|---|---|---|
| Historia code | **Apache-2.0** | Permissive + patent clause; attribution required; a museum can embed/modify without giving anything back. Independent of the data license |
| Data (geometries, dates, sources) | **ODbL 1.0** | Displaying a map (site, screen, image = "produced work"): **attribution only**. Republishing a derived database: ODbL share-alike. Compatible with OSM/OHM imports |
| Wiki content (event page text) | **CC-BY-SA 4.0** | Like Wikipedia; compatible with OHM descriptions |
| HistoriaText format (spec) | CC-BY 4.0 or public domain | Encourage adoption |

Entry conditions: every contributor agrees at sign-up to publish under these licenses (equivalent to Wikipedia/OSM terms of use).

Why ODbL and not CC-BY: the target use case (schools/museums *displaying* the map) is handled identically by both — attribution only. The difference only matters for whoever republishes the remixed *raw data* (share-alike). In exchange, ODbL opens up **importing from OSM and OpenHistoricalMap** (an actively maintained project, backed by OSM US / Development Seed), which is strategic for bootstrapping the historical basemap. Note: PostGIS (GPL-2.0) is used as a separate service via SQL — no contamination of the code (GPL only applies to derivative works).

**Import policy**: only from maintained, ODbL-compatible projects (OSM, OHM), with provenance tracked per changeset (`source=ohm`, original id) so a source can be synced or purged later.

## 9. Open decisions

1. Per-feature discussion (talk pages): Phase 3, or integrate an external forum?
2. Multilingual event pages: from the start (i18n schema), or English first?
3. HistoriaText: canonical YAML (maximum readability) or canonical JSON (stricter parsing)? Prototype both in Phase 2 before locking it in.
