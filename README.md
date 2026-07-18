# Historia

Collaborative historical mapping wiki: a map + a timeline where borders, fronts, and battles evolve over time. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full vision, data model, and development plan.

- **Code**: Apache-2.0 · **Data**: ODbL 1.0 · **Wiki text**: CC-BY-SA 4.0
- Pilot event: the Paris Commune (1871)

## Structure

```
apps/web          React front end + MapLibre GL (neutral Natural Earth basemap)
apps/api          Fastify/TypeScript API (auth, changesets, wiki — Phase 2)
packages/shared   Shared types (features, dated states EDTF, changesets)
infra/db          SQL migrations (bitemporal schema v1 + Paris Commune seed)
infra/martin      Martin tile server config (function sources — Phase 1)
scripts/          Tooling (basemap download)
```

## Prerequisites

Node ≥ 22, [pnpm](https://pnpm.io) (`corepack enable`), Docker Desktop.

## Getting started

```bash
pnpm install
pnpm setup:data      # Natural Earth basemap: 1:50m land + 1:10m minor islands
                     # (--hd: full 1:10m coastline, ~25 MB)
pnpm db:up           # PostGIS :5433 + Martin :3000 (docker compose)
pnpm dev             # web http://localhost:5173 + api http://localhost:3001
```

PostGIS is published on host port **5433** (5432 is often taken by a native
PostgreSQL install); override with `POSTGRES_HOST_PORT` in `.env`.

Checks:

- http://localhost:5173 — the Paris Commune demo: drag the timeline and watch
  barricades and front lines appear/disappear at their sourced dates
  (Shift+←/→ jumps between breakpoints, Space plays)
- http://localhost:3001/api/v1/events/commune-de-paris-1871 — event detail +
  timeline breakpoints
- http://localhost:3000/catalog — Martin catalog with the `features` function
  source; tiles at `/features/{z}/{x}/{y}?date=1871-05-23`

To reset the database (migrations replay on the next `db:up`):

```bash
docker compose down -v
```

## Roadmap

Phase 0 ✅ foundations · Phase 1 ✅ temporal tiles + timeline · Phase 2 collaborative portal + HistoriaText · Phase 3 full wiki · Phase 4 scale/OHM imports · Phase 5 "documentary" interpolation. Details in [ARCHITECTURE.md](./ARCHITECTURE.md#6-development-plan).
