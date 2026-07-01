# CLAUDE.md

A statewide California MVUM web map: a MapLibre static app (`web/`) fed by a
Python tile pipeline (`pipeline/`). The product promise is LEGAL ACCURACY —
"is this route legally open to my vehicle on this date?" — see PRODUCT.md.

## Rules that prevent damage

- `main` auto-deploys to production (Cloudflare Pages Git integration). NEVER
  commit or push directly to `main` — always branch + PR, and let CI pass
  first.
- Two independent deploy channels: the app (HTML/JS) auto-builds from `main`
  via Cloudflare Pages; the route tiles (`web/public/tiles/routes.pmtiles`)
  upload to R2 separately via `.github/workflows/deploy-tiles.yml`, only when
  that file changes on `main`.
- Don't rebuild/commit `routes.pmtiles` casually: it needs gitignored raw data
  (`make fetch`, network) plus tippecanoe, and a rebuild auto-stamps
  `DATA_VINTAGE`. Prefer `.github/workflows/data-refresh.yml` (monthly cron or
  manual `workflow_dispatch`) — it opens a reviewed PR and never auto-merges.

## Commands

| Command | What |
|---|---|
| `make fetch` | Pull MVUM roads+trails for all 17 CA forests -> `data/*.geojson` (network) |
| `make normalize` | Collapse to compact tile schema -> `data/ca-normalized.geojson` |
| `make tiles` | tippecanoe -> `web/public/tiles/routes.pmtiles` (needs tippecanoe) |
| `make data` | fetch + normalize + tiles |
| `make web-install` | `npm install` in `web/` |
| `make dev` | Vite dev server |
| `make build` | production static build -> `web/dist` (`tsc --noEmit && vite build`) |
| `make test` | `uv run pytest` (tests/) + `cd web && npm test` (vitest) |
| `uv run python -m pipeline.<module>` | run a pipeline module directly (e.g. `pipeline.normalize`) |

## Cross-file couplings (change one, change all)

- `DATA_VINTAGE` in `web/src/config.ts` mirrors the `#data-vintage` span in
  `web/index.html` — both are auto-stamped by `stamp_vintage()` in
  `pipeline/build_tiles.py`; its regexes fail loudly if either pattern's shape
  changes.
- The non-leap `_MONTH_START` table in `pipeline/normalize.py` is mirrored as
  `MONTH_START` in `web/src/legal.ts` — change together.
- Per-class window schema: `pipeline/normalize.py` emits `os_<class>`/
  `oe_<class>` fields; `web/src/legal.ts` reads them with a coalesce default
  (missing = yearlong) — schema changes must keep that degrade-gracefully
  property.
- New route layers in `web/src/style.ts` must be propagated to consumers:
  `main.ts` (popup loop), `fire.ts` (intersection), `export.ts` (collect),
  `weather.ts` (hit test).
- Map status colors in `web/src/style.ts` (`STATUS`) mirror legend swatches in
  `web/src/styles.css`.

## Conventions

- TypeScript strict, no framework, small single-purpose modules; comments
  explain WHY. Map paint colors are plain hex/rgba (MapLibre can't parse
  OKLCH); UI chrome uses OKLCH tokens in `styles.css`. Light-only theme —
  deliberate, see DESIGN.md "Theme decision".
- Python >=3.12 via uv; pipeline modules run as `uv run python -m pipeline.X`.
- Tests: `make test` (pytest in `tests/`, vitest in `web/src/*.test.ts`).
- Commit messages: imperative sentence, no conventional-commit prefixes.

## Where things are decided

- `PRODUCT.md` (users, promise), `DESIGN.md` (visual system + theme
  decision), `docs/r2-range-requests-plan.md` (tile hosting rationale),
  `plans/README.md` (improvement-plan index, backlog, rejected findings),
  `web/src/config.test.ts` (pinned vehicle-profile mapping decisions, e.g.
  `utv_wide` deliberately excludes `4wd_gt50`).
