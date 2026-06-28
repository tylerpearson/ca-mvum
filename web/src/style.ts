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
  affected: "routes-affected",
};

/** route line width ramp — tuned heavy for the light topo: routes must be the
 *  boldest lines on the sheet, not compete with contour hairlines. */
const WIDTH: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  4, 1.4,
  7, 2.4,
  10, 3.4,
  14, 5.0,
] as ExpressionSpecification;

/** casing = WIDTH + ~2px halo; a zoom expr can't be nested in arithmetic,
 *  so it must be its own top-level interpolate. */
const CASING_WIDTH: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  4, 3.0,
  7, 4.4,
  10, 5.8,
  14, 7.8,
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

  // Open routes: solid, full color.
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

  map.setFilter(ROUTE_LAYERS.open, open);
  map.setFilter(ROUTE_LAYERS.closed, closed);
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
