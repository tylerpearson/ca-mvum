# Design

Visual system for the California MVUM map. Register: **product** (the map is the
hero; chrome is the printed map's margin). Theme: light + dark, default follows
`prefers-color-scheme`. Colors are authored in **OKLCH**; map-layer paint uses
hex/rgba because MapLibre's color parser predates OKLCH.

## Theme & strategy

Restrained product palette: a single indigo primary for active/selection states,
neutral cool-gray surfaces, and a separate **semantic status set** for the map
itself. The "warmth/character" is carried by the heritage serif display face and
the cartographic basemap — never by a cream surface (explicitly avoided).

## Color tokens (`web/src/styles.css`)

| Role | Light | Dark |
|------|-------|------|
| `--ink` (body) | `oklch(0.24 0.02 250)` | `oklch(0.93 0.012 250)` |
| `--muted` | `oklch(0.5 0.02 250)` | `oklch(0.68 0.02 250)` |
| `--panel` | `oklch(0.99 0.004 250)` | `oklch(0.19 0.018 250)` |
| `--surface` | `oklch(0.965 0.006 250)` | `oklch(0.235 0.02 250)` |
| `--border` | `oklch(0.88 0.008 250)` | `oklch(0.34 0.02 250)` |
| `--primary` | `oklch(0.52 0.13 250)` | `oklch(0.74 0.12 250)` |

### Map status colors (semantic; mirrored in legend swatches)

These are the same values in `web/src/style.ts` (map) and `styles.css` (legend),
so the legend can never disagree with the map.

| Status | Color | Encoding (not color alone) |
|--------|-------|----------------------------|
| Open to selected vehicle/date | `#1f9d4d` green | solid line |
| Closed (out of season / not allowed) | `#9aa0a8` gray | **dashed** line, dimmed |
| Inside active fire perimeter | `#e4572e` red-orange | **heavy** solid line |
| Fire perimeter (area) | `#e4572e` @ 16% fill | translucent fill + outline |
| Smoke (HMS density) | slate-violet `#5b5566`→`#8d8a99` | graded translucent wash |
| Snow depth (NOHRSC) | server WMS raster | raster, 55% opacity |

Status is always encoded redundantly (line pattern + weight + legend label), so
it survives color-blindness and a sun-washed screen (WCAG-conscious, AA target).

## Typography

Contrast-axis pairing (serif + sans), not two similar sans:

- **Display** (`--font-display`): `"Iowan Old Style", Palatino, Georgia, ui-serif`
  — a heritage serif for the title and popup headings; the quad-map voice.
- **UI** (`--font-ui`): `ui-sans-serif, system-ui, …` — labels, controls, body.

Fixed rem scale (product register; no fluid clamp headings). Title 1.45rem,
body 0.82–0.9rem, micro-labels 0.72rem at weight 600 with slight tracking.

## Layout & components

- **Panel** = a solid legend block (`--panel`) with a 1px neatline `outline`
  inset 5px, echoing a map sheet's border. Not glass. Fixed 320px top-left on
  desktop; a bottom sheet (≤56dvh, scroll) under 560px.
- **The map fills the viewport** (`#map { position: fixed; inset: 0 }`).
- Form controls share one vocabulary (select, date, checkbox) with consistent
  focus rings (`box-shadow` ring in `--primary`).
- Disclaimer is permanent (a hairline `border-top`, muted), never dismissible.

## Motion

Minimal, product-appropriate: 150ms ease-out (`cubic-bezier(0.22,1,0.36,1)`) on
control hover/focus only. Map pan/zoom is MapLibre's own. Full
`prefers-reduced-motion` opt-out.

## Basemaps

- Light: **USGS Topo** (`basemap.nationalmap.gov`) — the cartographic anchor.
- Dark: **Esri World Dark Gray** base + reference labels.
The theme toggle swaps basemap + chrome together.
