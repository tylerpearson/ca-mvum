// Live wildfire perimeters (NIFC/WFIGS) + route intersection.
//
// Perimeters are fetched fresh from the FeatureServer as GeoJSON and drawn as a
// translucent fill. Routes that cross an active perimeter are flagged: we query
// the rendered route features in the current viewport and test them against the
// perimeters with turf, then push the hits into a dedicated "affected" source
// drawn in warning red on top of the open/closed lines.

import type { Map as MLMap, GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl";
import booleanIntersects from "@turf/boolean-intersects";
import { FIRE_PERIMETERS_URL, CA_BBOX } from "./config";
import { ROUTE_LAYERS, STATUS } from "./style";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

let perimeters: GeoJSON.Feature[] = [];

export function initFire(map: MLMap): void {
  map.addSource("fire", { type: "geojson", data: EMPTY, attribution: "NIFC / WFIGS" });
  map.addSource("affected", { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "fire-fill",
    type: "fill",
    source: "fire",
    layout: { visibility: "none" },
    paint: { "fill-color": STATUS.affected, "fill-opacity": 0.2 },
  });
  map.addLayer({
    id: "fire-line",
    type: "line",
    source: "fire",
    layout: { visibility: "none" },
    paint: {
      // a strong vermilion edge: the one boundary that must read clearly even
      // over the purple route network it caps.
      "line-color": "#b32414",
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.0, 12, 3.4],
    },
  });

  // Affected routes ride above the open/closed route lines.
  map.addLayer({
    id: ROUTE_LAYERS.affected,
    type: "line",
    source: "affected",
    layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
    paint: {
      "line-color": STATUS.affected,
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.6, 14, 4.5],
    },
  });
}

/** Fetch current perimeters intersecting California. Returns count of fires. */
export async function refreshFirePerimeters(map: MLMap): Promise<number> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*", // a handful of CA features; avoids 400s on field-name drift
    geometry: JSON.stringify({
      xmin: CA_BBOX[0], ymin: CA_BBOX[1], xmax: CA_BBOX[2], ymax: CA_BBOX[3],
    }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    returnGeometry: "true",
    f: "geojson",
  });
  const resp = await fetch(`${FIRE_PERIMETERS_URL}?${params}`);
  if (!resp.ok) throw new Error(`fire perimeters ${resp.status}`);
  const fc = (await resp.json()) as GeoJSON.FeatureCollection;
  perimeters = fc.features ?? [];
  (map.getSource("fire") as GeoJSONSource).setData(fc);
  return perimeters.length;
}

/** Recompute which visible routes intersect a perimeter. Returns hit count. */
export function recomputeAffected(map: MLMap): number {
  if (perimeters.length === 0) {
    (map.getSource("affected") as GeoJSONSource).setData(EMPTY);
    return 0;
  }
  const routes = map.queryRenderedFeatures(undefined, {
    layers: [ROUTE_LAYERS.open],
  }) as MapGeoJSONFeature[];

  const hits: GeoJSON.Feature[] = [];
  for (const route of routes) {
    for (const fire of perimeters) {
      try {
        if (booleanIntersects(route as GeoJSON.Feature, fire)) {
          hits.push({ type: "Feature", geometry: route.geometry, properties: route.properties });
          break;
        }
      } catch {
        /* skip malformed geometry */
      }
    }
  }
  (map.getSource("affected") as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: hits,
  });
  return hits.length;
}

export function setFireVisible(map: MLMap, on: boolean): void {
  const v = on ? "visible" : "none";
  for (const id of ["fire-fill", "fire-line", ROUTE_LAYERS.affected]) {
    map.setLayoutProperty(id, "visibility", v);
  }
}
