# California MVUM

A statewide map of California National Forest **Motor Vehicle Use Map** (MVUM)
routes — every Forest Service road and trail designated for motor vehicle use —
filterable by **vehicle class** and **date**, with live **fire**, **smoke**, and
**snow** overlays so you can judge what's open *and* reachable right now.

It turns the Forest Service's static, forest-by-forest MVUM PDFs into one live,
filterable map across all 17 California national forests.

> ⚠️ **Verify before you go.** MVUM shows legal *designation*, not temporary
> Forest closure orders. The fire/smoke/snow layers are situational awareness,
> not official closures. Always confirm current conditions with the managing
> forest.

## How it works

Two halves:

1. **Python build pipeline** (`pipeline/`) pulls MVUM roads + trails from the
   USFS EDW ArcGIS service, normalizes the vehicle-class/season fields into a
   compact schema, clips to California, and bakes everything into a single
   PMTiles vector-tile file.
2. **Static web app** (`web/`) — a MapLibre GL single-page app that serves those
   tiles and fetches the live fire/smoke/snow layers client-side. No server
   runtime.

### Data sources

| Layer | Source | Freshness |
|-------|--------|-----------|
| Routes + legal access | USFS MVUM (EDW MapServer) | baked at build time |
| Wildfire perimeters | NIFC / WFIGS current interagency perimeters | live, per visit |
| Smoke | NOAA HMS satellite smoke detection | live, per visit |
| Snow depth | NOAA NOHRSC (SNODAS) snow analysis WMS | live, per visit |
| Basemap | USGS Topo (light) · Esri Dark Gray (dark) | tiles |

## Build the data

Requires [uv](https://github.com/astral-sh/uv) and
[tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe`).

```bash
make fetch       # MVUM roads+trails for all 17 CA forests -> data/*.geojson
make normalize   # compact schema + CA clip -> data/ca-normalized.geojson
make tiles       # tippecanoe -> web/public/tiles/routes.pmtiles
# or all three:
make data
```

The fetch is polite (paginated, retried) and takes a few minutes. Re-run it to
refresh against the latest MVUM.

## Run the app

```bash
make web-install   # cd web && npm install
make dev           # vite dev server
make build         # static build -> web/dist
```

The app reads `web/public/tiles/routes.pmtiles`, so build the data first (or use
a committed copy of the tiles).

## Project layout

```
pipeline/
  forests.py        # the 17 CA forests
  fetch_mvum.py     # paginated ArcGIS REST pull (roads + trails)
  normalize.py      # compact schema, datesopen parsing, CA clip
  build_tiles.py    # tippecanoe -> routes.pmtiles
web/
  src/config.ts     # vehicle classes + live data endpoints
  src/legal.ts      # vehicle/date -> open/closed expressions
  src/style.ts      # route layers, status colors, filters
  src/fire.ts       # perimeters + route intersection
  src/smoke.ts      # HMS smoke polygons
  src/snow.ts       # NOHRSC snow-depth WMS raster
  src/main.ts       # map, controls, theme, popups
PRODUCT.md / DESIGN.md   # impeccable design context
```

## Disclaimers & credits

MVUM and SRTM/NOHRSC data are U.S. government works. Fire data © NIFC; smoke ©
NOAA. Basemaps © USGS and © Esri/HERE/Garmin. This is a planning aid, not a
legal authority.
