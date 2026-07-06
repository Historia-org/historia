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
pnpm db:up           # PostGIS :5432 + Martin :3000 (docker compose)
pnpm dev             # web http://localhost:5173 + api http://localhost:3001
```

Checks:

- http://localhost:5173 — neutral map centered on Paris
- http://localhost:3001/api/v1/meta — PostGIS version + seed event `commune-de-paris-1871`
- http://localhost:3000/catalog — Martin catalog (empty in Phase 0, function sources in Phase 1)

To reset the database (migrations replay on the next `db:up`):

```bash
docker compose down -v
```

## Roadmap

Phase 0 ✅ foundations · Phase 1 temporal tiles + timeline · Phase 2 collaborative portal + HistoriaText · Phase 3 full wiki · Phase 4 scale/OHM imports · Phase 5 "documentary" interpolation. Details in [ARCHITECTURE.md](./ARCHITECTURE.md#6-development-plan).
