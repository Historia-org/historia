# Historia

Wiki collaboratif de cartographie historique : une carte + une frise chronologique où frontières, fronts et batailles évoluent dans le temps. Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour la vision complète, le modèle de données et le plan de développement.

- **Code** : Apache-2.0 · **Données** : ODbL 1.0 · **Textes wiki** : CC-BY-SA 4.0
- Événement pilote : la Commune de Paris (1871)

## Structure

```
apps/web          Front React + MapLibre GL (fond neutre Natural Earth)
apps/api          API Fastify/TypeScript (auth, changesets, wiki — Phase 2)
packages/shared   Types partagés (features, états datés EDTF, changesets)
infra/db          Migrations SQL (schéma bitemporel v1 + seed Commune de Paris)
infra/martin      Config du serveur de tuiles Martin (function sources — Phase 1)
scripts/          Outillage (téléchargement du fond de carte)
```

## Prérequis

Node ≥ 22, [pnpm](https://pnpm.io) (`corepack enable`), Docker Desktop.

## Démarrage

```bash
pnpm install
pnpm setup:data      # télécharge le fond Natural Earth (une seule fois)
pnpm db:up           # PostGIS :5432 + Martin :3000 (docker compose)
pnpm dev             # web http://localhost:5173 + api http://localhost:3001
```

Vérifications :

- http://localhost:5173 — carte neutre centrée sur Paris
- http://localhost:3001/api/v1/meta — version PostGIS + événement seed `commune-de-paris-1871`
- http://localhost:3000/catalog — catalogue Martin (vide en Phase 0, function sources en Phase 1)

Pour réinitialiser la base (rejoue les migrations au prochain `db:up`) :

```bash
docker compose down -v
```

## Roadmap

Phase 0 ✅ fondations · Phase 1 tuiles temporelles + frise · Phase 2 portail collaboratif + HistoriaText · Phase 3 wiki complet · Phase 4 échelle/imports OHM · Phase 5 interpolation "documentaire". Détail dans [ARCHITECTURE.md](./ARCHITECTURE.md#6-plan-de-développement).
