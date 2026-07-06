# Historia — Architecture & plan de développement

> Wikipedia de la cartographie historique : une carte web où frontières, positions et événements évoluent le long d'une frise chronologique, alimentée par un portail collaboratif.
> Cas pilote : **la Commune de Paris (1871)** — échelle urbaine, granularité au jour, sources abondantes.

---

## 1. Avis sur le projet

Le besoin est réel et la niche n'est pas saturée. Les projets existants à connaître :

| Projet | Ce qu'il fait | Limite |
|---|---|---|
| [OpenHistoricalMap](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap) (OHM) | Fork complet de la stack OSM avec dimension temporelle (`start_date`/`end_date`, time slider) | Orienté "base de données de features", pas de narration événementielle (pas de page "Guerre de 100 ans" avec frise dédiée) |
| Chronas | Carte mondiale + timeline, liée à Wikipedia | Granularité à l'année, projet peu maintenu |
| GeaCron | Frontières mondiales par année | Propriétaire, fermé, pas collaboratif |

**Le différenciateur d'Historia** : l'entrée par *événement historique* (une guerre, une révolution) avec une frise fine (jour par jour quand les sources le permettent), et non l'entrée par "la carte du monde à l'année X". C'est un angle éditorial fort qu'aucun des trois ne couvre.

**Les deux vrais défis ne sont pas techniques :**
1. **Le modèle de données temporel** — représenter des géométries valides sur des intervalles de dates, avec incertitude ("vers 1420", "avant mai 1871") et sourçage. C'est le cœur du projet, à figer tôt.
2. **La gouvernance collaborative** — qui tranche quand deux contributeurs proposent deux tracés de front contradictoires ? Le sourçage obligatoire et un workflow de relecture sont indispensables dès la v1 puisque tu pars collaboratif.

---

## 2. Comment OSM est servi (réponse à ta question)

La stack OSM sépare strictement trois rôles, et la performance vient des composants spécialisés — pas du langage de l'application :

1. **Stockage** : PostgreSQL + **PostGIS** (C). Tout le calcul géométrique lourd (intersections, index spatiaux GIST, simplification) se fait dans la base.
2. **Tuiles** : historiquement Mapnik/mod_tile (raster, C++). Depuis [juillet 2025, osm.org sert des tuiles vectorielles](https://blog.openstreetmap.org/2025/07/22/vector-tiles-are-deployed-on-openstreetmap-org/) (schéma Shortbread) via un backend dédié. L'équivalent moderne auto-hébergeable est [**Martin**](https://github.com/maplibre/martin) (Rust) : il génère des tuiles MVT à la volée depuis PostGIS et encaisse un trafic lourd.
3. **API d'édition** : le site OSM est en Ruby on Rails ; les endpoints de lecture massive sont délégués à `cgimap` (C++).

**Conclusion pour Historia : oui, TypeScript suffit** pour la couche API/métier, parce que cette couche ne fait ni calcul géométrique ni rendu — elle orchestre. Le pipeline critique est :

```
PostGIS (C) ──fonctions SQL──▶ Martin (Rust) ──MVT──▶ CDN/cache ──▶ MapLibre GL (client, GPU)
```

L'API TypeScript ne touche les géométries que pour l'édition (validation, changesets), volume faible. Si un jour un traitement lourd apparaît (simplification topologique batch, imports massifs), on l'écrit en worker séparé (Rust/Python) sans toucher au reste.

---

## 3. Architecture cible

```
┌─────────────────────────── CLIENT (navigateur) ───────────────────────────┐
│  React + MapLibre GL JS                                                   │
│  • Carte vectorielle (rendu GPU)      • Frise chronologique (composant)   │
│  • Éditeur de géométries (Terra Draw) • Pages événement (wiki)            │
└──────────────┬──────────────────────────────┬──────────────────────────────┘
               │ tuiles MVT ?date=1871-05-21  │ REST/JSON (auth, édition, wiki)
┌──────────────▼──────────────┐  ┌────────────▼───────────────────────────────┐
│  Martin (Rust)              │  │  API Node.js / TypeScript (Fastify)        │
│  function sources SQL       │  │  • Auth (sessions/OIDC)                    │
│  paramétrées par date       │  │  • Changesets, validation, modération      │
│  + cache HTTP (Caddy/CDN)   │  │  • Pages événement, sources, recherche     │
└──────────────┬──────────────┘  └────────────┬───────────────────────────────┘
               └───────────────┬──────────────┘
                    ┌──────────▼──────────┐
                    │ PostgreSQL + PostGIS │   (+ fond de carte neutre :
                    │ modèle bitemporel    │    relief/hydrographie sans
                    └─────────────────────┘    routes ni villes modernes)
```

Tout tourne en **Docker Compose sur un VPS** (Hetzner/OVH), reverse proxy Caddy, CDN Cloudflare devant les tuiles. Un seul serveur suffit très longtemps si le cache de tuiles est bien pensé.

### Point d'attention : le fond de carte
Un fond OSM moderne affiche autoroutes et villes actuelles — anachronique sous une carte de 1871. Prévoir un style MapLibre "neutre" (relief, hydrographie, trait de côte — sources : Natural Earth, OpenFreeMap avec style élagué). Le parcellaire historique de Paris viendra ensuite des contributions elles-mêmes.

---

## 4. Modèle de données temporel (le cœur)

### Principe : bitemporalité
Deux axes de temps indépendants, à ne jamais confondre :
- **Temps historique** (`valid_from`, `valid_to`) : quand la chose existait dans le monde réel.
- **Temps d'édition** (versions, changesets) : qui a modifié quoi, quand, dans la base — nécessaire au wiki (historique, revert, diff).

### Schéma conceptuel

```sql
-- Une "chose" du monde réel, stable dans le temps (ex: "enceinte de Thiers",
-- "barricade rue de Rivoli", "front des Versaillais")
feature (id, type, slug)

-- Son état géométrique sur un intervalle de temps historique.
-- Une feature a N états successifs (≈ "chronology relation" d'OHM).
feature_state (
  id, feature_id,
  geom            geometry,        -- point / ligne / polygone
  valid_from      edtf,            -- dates EDTF : '1871-05-21', '1871-05~' (≈mai), '[1871-05-21..1871-05-23]'
  valid_to        edtf,
  valid_from_min  date,            -- bornes dérivées pour l'indexation/requêtage
  valid_from_max  date,
  properties      jsonb,           -- nom, camp, effectifs...
  version         int,             -- versionnement d'édition
  changeset_id    bigint
)

feature_state_source (feature_state_id, source_id, page, note)  -- sourçage par assertion
source (id, type, titre, auteur, url, cote_archive)

event (id, slug, titre, période, description_md)        -- page "Commune de Paris"
event_feature (event_id, feature_id, rôle)              -- rattachement des features
changeset (id, user_id, created_at, comment, status)    -- édition + modération
```

### Choix structurants
- **Dates en [EDTF](https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/Dates_And_Times)** (ISO 8601-2) : gère nativement l'incertitude et l'approximation, standard adopté par OHM — on ne réinvente rien, et on garde une compatibilité d'import/export avec OHM (licence ODbL).
- **Colonnes dérivées `_min`/`_max`** en `date` pour les requêtes : index B-tree, et la requête tuile devient `WHERE valid_from_max <= :d AND (valid_to_min IS NULL OR valid_to_min >= :d)`.
- **États successifs plutôt que géométries interpolées** : un front qui bouge = une suite de `feature_state`. L'interpolation visuelle entre deux états est un raffinement client, plus tard.
- **Sourçage au niveau de l'état**, pas de la feature : c'est le tracé daté qui doit être justifié.

### Le format d'édition : textuel, déterministe, lisible par humain et LLM

Toute contribution est représentée dans un format texte canonique — appelons-le **HistoriaText** — qui est la *lingua franca* entre l'IHM, l'API et les LLM. L'IHM cartographique (dessin Terra Draw, formulaires) ne fait que générer ce format ; un historien peut le lire, un LLM peut le produire ou le relire, un développeur peut le diff-er.

```yaml
# changeset — barricade de la rue de Rivoli
feature: barricade/rue-de-rivoli
type: barricade
event: commune-de-paris-1871
states:
  - valid: 1871-05-22 / 1871-05-24        # EDTF : "1871-05~" = vers mai 1871
    geometry: LINESTRING (2.35220 48.85660, 2.35310 48.85640)
    properties:
      camp: communards
      hauteur_estimee: incertaine
    sources:
      - ref: lissagaray-1876
        page: 312
        note: "mentionnée comme tenue jusqu'au matin du 24"
```

Règles de déterminisme (indispensables pour les diffs et la reproductibilité) : sérialisation canonique — clés ordonnées, géométries en WKT avec précision fixe (5 décimales ≈ 1 m), dates EDTF normalisées, encodage UTF-8/LF. Deux exports du même état sont identiques octet par octet. Chaque changeset est stocké **et** en base relationnelle (requêtage) **et** sous sa forme HistoriaText (lisibilité, audit, diff type Wikipedia). C'est l'équivalent du XML d'OSM, mais conçu d'emblée pour être écrit à la main ou par un agent.

### Historique public à la Wikipedia

Comme sur Wikipedia : **chaque révision est conservée, publique et lisible par tous**, avec structure hiérarchique de consultation — Événement → Sous-événements/Phases → Features → États → Révisions. Chaque page (événement ou feature) expose son onglet "historique" : liste des changesets, diff HistoriaText côte à côte + diff géométrique visuel sur carte, revert en un clic pour les relecteurs. Rien n'est supprimé, tout est attribué.

### Servir la donnée efficacement
Martin expose des *function sources* : une fonction SQL PostGIS qui prend `(z, x, y, date)` et renvoie la tuile MVT filtrée par temps. Côté cache, on ne cache pas par jour arbitraire mais par **dates de rupture** : la liste des `valid_from/valid_to` distincts d'une zone définit des plages où la carte est identique → le client "snappe" la frise sur ces ruptures et le cache HTTP devient très efficace. Pour les zooms faibles, snapshots pré-générés en PMTiles.

---

## 5. Briques technologiques

| Rôle | Choix | Licence | Pourquoi |
|---|---|---|---|
| Base de données | PostgreSQL 16 + PostGIS | PostgreSQL (permissive) / **GPL-2.0**¹ | Standard absolu du géospatial, index spatiaux + temporels |
| Serveur de tuiles | Martin (Rust) | MIT / Apache-2.0 | MVT à la volée depuis PostGIS, function sources paramétrées, très rapide |
| API métier | Node.js + TypeScript, Fastify | MIT | Maintenable, typé, suffisant (cf. §2) ; SQL direct via Kysely (MIT) |
| Front | React + MapLibre GL JS | MIT / BSD-3 | Rendu vectoriel GPU, écosystème riche |
| Édition de géométries | Terra Draw (plugin MapLibre) | MIT | Dessin point/ligne/polygone dans le navigateur |
| Frise chronologique | Composant custom (D3 ou canvas) | ISC (D3) | C'est l'UX signature du projet, ne pas la sous-traiter à une lib générique |
| Dates historiques | EDTF (lib `edtf.js` + parsing SQL) | MIT | Incertitude/approximation, compat OHM |
| Interpolation (v2+) | flubber / turf.js côté client | MIT | Morphing de géométries entre deux états datés (cf. Phase 5) |
| Auth | Auth.js ou Lucia (e-mail + OAuth) | ISC / MIT | Simple, auto-hébergé |
| Déploiement | Docker Compose + Caddy + Cloudflare | Apache-2.0 | VPS unique, TLS auto, cache tuiles au CDN |
| Monorepo | pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`) | MIT | Types partagés client/serveur |

¹ PostGIS est GPL-2.0, mais utilisé comme **service séparé via SQL** : la GPL ne s'applique qu'aux œuvres dérivées (fork, linkage), pas à un client qui envoie des requêtes. Ton code n'est donc pas contaminé. Il n'existe de toute façon aucune alternative permissive sérieuse à PostGIS.

---

## 6. Plan de développement

### Phase 0 — Fondations (≈1-2 semaines)
- Monorepo pnpm, Docker Compose (PostGIS + Martin + API + front), CI basique.
- Schéma SQL v1 (§4) + migrations. Style de fond de carte neutre.
- **Livrable : une carte MapLibre vide sur fond neutre, servie localement.**

### Phase 1 — Cœur carto en lecture (≈3-5 semaines)
- Fonctions SQL tuiles temporelles + config Martin ; seed manuel de quelques barricades/fronts de la Commune.
- Composant frise : plage 18 mars → 28 mai 1871, curseur au jour, snapping sur les dates de rupture.
- Page événement minimale (titre, description, carte + frise).
- **Livrable : on scrolle la frise, les géométries apparaissent/disparaissent. La démo qui valide tout le concept.**

### Phase 2 — Portail collaboratif (≈5-8 semaines)
- Spécification et parseur **HistoriaText** (sérialisation canonique, round-trip base ⇄ texte garanti par tests).
- Auth, profils. Éditeur : dessiner/modifier une géométrie, saisir dates EDTF (avec UI d'incertitude), **source obligatoire**. L'IHM génère du HistoriaText, visible dans un onglet "source" avant soumission.
- Changesets : soumission → relecture → publication. Historique public complet et revert par feature.
- **Livrable : un tiers peut contribuer une barricade sourcée via l'IHM ; un LLM peut produire le même changeset en texte.**

### Phase 3 — Wiki & consultation riche (≈4-6 semaines)
- Pages événement complètes (markdown, bibliographie, sous-événements datés reliés à la frise).
- Diff visuel de géométries entre versions (essentiel pour la modération), rôles (contributeur/relecteur/admin), recherche.
- **Livrable : le cycle wiki complet — consulter, contribuer, relire, discuter.**

### Phase 4 — Échelle & ouverture
- CDN + politique de cache par plages, PMTiles pour zooms faibles, monitoring (Grafana).
- API publique de lecture + export HistoriaText/GeoJSON (pour écoles, musées : widget embarquable `<iframe>`/web component).
- Deuxième événement pilote à plus grande échelle spatiale (ex. guerre de 100 ans) pour éprouver le modèle sur des frontières nationales.
- Pipeline d'import/export OHM (ODbL ⇄ ODbL, cf. §8) : amorçage du fond historique depuis OHM avec provenance tracée par changeset.

### Phase 5 — Mode interpolation ("documentaire")
- Morphing client entre deux `feature_state` successifs (flubber pour polygones, interpolation de vertex pour lignes/fronts) : la frontière *glisse* quand on joue la frise, comme dans un documentaire.
- Le modèle par ruptures reste la vérité ; l'interpolation est un mode d'affichage optionnel, marqué visuellement comme reconstitution (et non donnée sourcée).
- Optionnel : points de passage intermédiaires non sourcés (`interpolation_hint`) pour guider le morphing sur les cas complexes.

---

## 7. Risques & vigilance

- **Le modèle de données est le point de non-retour** : prototyper la requête temporelle (Phase 1) avant de construire l'édition dessus.
- **Incertitude historique ≠ absence de données** : l'UI doit distinguer "tracé incertain" (pointillés, halo) de "rien à cette date". Prévu dans le modèle (EDTF), à prévoir dans le style.
- **Modération à froid** : partir collaboratif sans communauté = peu de spam au début, mais verrouiller le workflow de relecture avant toute ouverture publique.
- **Ne pas forker la stack OSM** (Rails, osm2pgsql...) : elle est taillée pour une planète entière et te ralentirait. S'inspirer du *modèle* d'OHM (EDTF, chronologies), pas de son code.

## 8. Licences

Objectif : réutilisation libre (écoles, musées, intégration dans leurs pages/écrans) avec pour seule obligation la **citation**, et compatibilité d'import avec l'écosystème OSM/OHM.

| Quoi | Licence | Effet |
|---|---|---|
| Code Historia | **Apache-2.0** | Permissive + clause brevets ; attribution requise ; un musée peut intégrer/modifier sans rien reverser. Indépendante de la licence des données |
| Données (géométries, dates, sources) | **ODbL 1.0** | Afficher une carte (site, écran, image = "produced work") : **citation seule**. Republier une base de données dérivée : share-alike ODbL. Compatible imports OSM/OHM |
| Contenus wiki (textes des pages événement) | **CC-BY-SA 4.0** | Comme Wikipedia ; compatible avec les descriptions OHM |
| Format HistoriaText (spec) | CC-BY 4.0 ou domaine public | Encourager l'adoption |

Conditions d'entrée : chaque contributeur accepte à l'inscription de publier sous ces licences (équivalent des CGU Wikipedia/OSM).

Pourquoi ODbL et pas CC-BY : le cas d'usage cible (écoles/musées qui *affichent* la carte) est traité identiquement par les deux — citation seule. La différence ne joue que pour qui republie les *données brutes* remixées (share-alike). En échange, ODbL ouvre l'**import depuis OSM et OpenHistoricalMap** (projet activement maintenu, soutenu par OSM US / Development Seed), ce qui est stratégique pour amorcer le fond historique. Note : PostGIS (GPL-2.0) est utilisé comme service séparé via SQL — aucune contamination du code (la GPL ne s'applique qu'aux œuvres dérivées).

**Politique d'import** : uniquement depuis des projets maintenus et compatibles ODbL (OSM, OHM), avec traçabilité de la provenance par changeset (`source=ohm`, id d'origine) pour pouvoir synchroniser ou purger une source ultérieurement.

## 9. Décisions ouvertes

1. Discussion par feature (talk pages) : Phase 3 ou intégration d'un forum externe ?
2. Multilinguisme des pages événement : d'emblée (schéma i18n) ou français d'abord ?
3. HistoriaText : YAML canonique (lisibilité maximale) ou JSON canonique (parsing plus strict) ? Prototype des deux en Phase 2 avant de figer.
