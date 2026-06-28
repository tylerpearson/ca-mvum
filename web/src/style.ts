// Route layer definitions, status colors, and filter updates.
//
// MapLibre's paint properties are parsed by csscolorparser, which does NOT
// understand oklch(); map colors are therefore plain hex/rgba here. The UI
// chrome (styles.css) uses OKLCH per the design system. Route status is encoded
// by color AND line pattern AND width so it survives color-blindness / sun glare
// (open = solid, closed = dashed, in-fire = heavy solid).

import type { Map as MLMap, ExpressionSpecification } from "maplibre-gl";
import { ROUTES_SOURCE_LAYER } from "./config";
import { isOpen } from "./legal";

export const STATUS = {
  // Purple "open" overprint: the one strong hue the USGS quad palette leaves
  // free (green=forest, blue=water, red=highway, brown=contour), and a nod to
  // the historical purple photorevision overprint on USGS topo sheets. The
  // basemap is desaturated underneath, so this purple is the only saturated
  // color on the map — it reads instantly.
  open: "#6d1bb5",
  closed: "#7a818b", // gray — out of season / not allowed
  affected: "#d6311a", // red-orange — inside an active fire perimeter
};

// Bright white casing under every route: a knockout halo that lifts the line
// off the (muted) topo so it's legible over contours, hillshade and labels.
const CASING_COLOR = "rgba(255,255,255,0.95)";

export const ROUTE_LAYERS = {
  casing: "routes-casing",
  closed: "routes-closed",
  open: "routes-open",
  trail: "routes-trail",
  affected: "routes-affected",
};

/** kind is the SECONDARY visual axis (status = color is primary): trails read as
 *  a finer, rougher line than roads. `kind` is a data property, so this must be
 *  a data-driven `case` — line-width supports that (line-dasharray does not). */
const IS_TRAIL: ExpressionSpecification = [
  "==", ["get", "kind"], "trail",
] as ExpressionSpecification;

/** Trail line width ramp — ~30% thinner than a road, used directly by the
 *  dashed trail-overlay layer (a standalone top-level interpolate is fine). */
const TRAIL_WIDTH: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  4, 1.0,
  7, 1.7,
  10, 2.4,
  14, 3.5,
] as ExpressionSpecification;

/** Route line width: roads bold, trails ~30% thinner.
 *  CRITICAL: a `["zoom"]` interpolate may ONLY be a TOP-LEVEL expression — it
 *  cannot be nested inside a `case`. So zoom is the outer interpolate and the
 *  road/trail `case` lives in each stop's OUTPUT value (a feature-property
 *  branch is allowed there). The inverted (case-of-interpolates) form is invalid
 *  and makes MapLibre reject the whole layer at addLayer time. */
const WIDTH: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  4, ["case", IS_TRAIL, 1.0, 1.4],
  7, ["case", IS_TRAIL, 1.7, 2.4],
  10, ["case", IS_TRAIL, 2.4, 3.4],
  14, ["case", IS_TRAIL, 3.5, 5.0],
] as ExpressionSpecification;

/** casing = line + ~2px halo; same top-level-zoom rule as WIDTH. */
const CASING_WIDTH: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  4, ["case", IS_TRAIL, 2.4, 3.0],
  7, ["case", IS_TRAIL, 3.6, 4.4],
  10, ["case", IS_TRAIL, 4.8, 5.8],
  14, ["case", IS_TRAIL, 6.2, 7.8],
] as ExpressionSpecification;

export function addRouteLayers(map: MLMap): void {
  // Casing (drawn first, under everything)
  map.addLayer({
    id: ROUTE_LAYERS.casing,
    type: "line",
    source: "routes",
    "source-layer": ROUTES_SOURCE_LAYER,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": CASING_COLOR,
      "line-width": CASING_WIDTH,
      "line-opacity": 0.95,
    },
  });

  // Closed / not-open routes: dashed, dimmed.
  map.addLayer({
    id: ROUTE_LAYERS.closed,
    type: "line",
    source: "routes",
    "source-layer": ROUTES_SOURCE_LAYER,
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": STATUS.closed,
      "line-width": WIDTH,
      "line-opacity": 0.6,
      "line-dasharray": [2, 2],
    },
  });

  // Open ROADS: solid, bold, full color. (updateRouteFilters scopes this layer
  // to non-trail routes so trails can render dashed in their own layer below.)
  map.addLayer({
    id: ROUTE_LAYERS.open,
    type: "line",
    source: "routes",
    "source-layer": ROUTES_SOURCE_LAYER,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": STATUS.open,
      "line-width": WIDTH,
      "line-opacity": 1,
    },
  });

  // Open TRAILS: same purple status color, but a thinner DASHED line so a rider
  // can tell a single-track/rough trail from a graded road at a glance. Roads
  // and trails are mutually exclusive between this layer and routes-open (the
  // filters partition on `kind`), so there's no double-draw. line-dasharray
  // can't be data-driven, which is exactly why trails need their own layer.
  map.addLayer({
    id: ROUTE_LAYERS.trail,
    type: "line",
    source: "routes",
    "source-layer": ROUTES_SOURCE_LAYER,
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": STATUS.open,
      "line-width": TRAIL_WIDTH,
      "line-opacity": 1,
      "line-dasharray": [2, 1.6],
    },
  });
}

/** Update which routes read as open vs closed for the selected profile + date. */
export function updateRouteFilters(
  map: MLMap,
  tokens: string[],
  doy: number,
  hideClosed: boolean,
): void {
  const open = isOpen(tokens, doy);
  const closed = ["!", open] as ExpressionSpecification;

  // Partition open routes by kind: solid layer = open roads, dashed layer = open
  // trails. Closed layer keeps both (dimmed gray dash already reads as closed).
  map.setFilter(
    ROUTE_LAYERS.open,
    ["all", open, ["!", IS_TRAIL]] as ExpressionSpecification,
  );
  map.setFilter(ROUTE_LAYERS.closed, closed);
  map.setFilter(
    ROUTE_LAYERS.trail,
    ["all", open, IS_TRAIL] as ExpressionSpecification,
  );
  map.setLayoutProperty(
    ROUTE_LAYERS.closed,
    "visibility",
    hideClosed ? "none" : "visible",
  );
  // Casing follows whatever is visible.
  map.setFilter(
    ROUTE_LAYERS.casing,
    hideClosed ? open : (["literal", true] as unknown as ExpressionSpecification),
  );
}
