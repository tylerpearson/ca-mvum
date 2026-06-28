// Live smoke plumes (NOAA HMS daily satellite smoke detection).
//
// Polygons with a `Density` field (Light / Medium / Heavy). Drawn as a graded
// neutral haze wash — a warm-neutral smoke gray, deliberately OFF the purple
// route hue and the AQI palette, so it reads as overcast haze and never as a
// route or an air-quality category. Sits below the route network.

import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { SMOKE_FEATURES_URL, CA_BBOX } from "./config";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function initSmoke(map: MLMap, beforeId?: string): void {
  map.addSource("smoke", { type: "geojson", data: EMPTY, attribution: "NOAA HMS" });
  map.addLayer(
    {
      id: "smoke-fill",
      type: "fill",
      source: "smoke",
      layout: { visibility: "none" },
      paint: {
        // graded by reported density; warm smoke-gray (neutral, slightly brown)
        "fill-color": [
          "match",
          ["get", "Density"],
          "Heavy", "#57514b",
          "Medium", "#766f67",
          "Light", "#968d83",
          "#968d83",
        ],
        // denser smoke gets more presence; light haze stays subtle
        "fill-opacity": [
          "match", ["get", "Density"],
          "Heavy", 0.42,
          "Medium", 0.34,
          "Light", 0.26,
          0.3,
        ],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "smoke-line",
      type: "line",
      source: "smoke",
      layout: { visibility: "none" },
      paint: { "line-color": "#4a443d", "line-width": 0.6, "line-opacity": 0.45 },
    },
    beforeId,
  );
}

/** Fetch current smoke polygons over California. Returns count. */
export async function refreshSmoke(map: MLMap): Promise<number> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*", // density field drives styling; * avoids 400s on naming
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
  const resp = await fetch(`${SMOKE_FEATURES_URL}?${params}`);
  if (!resp.ok) throw new Error(`smoke ${resp.status}`);
  const fc = (await resp.json()) as GeoJSON.FeatureCollection;
  (map.getSource("smoke") as GeoJSONSource).setData(fc);
  return fc.features?.length ?? 0;
}

export function setSmokeVisible(map: MLMap, on: boolean): void {
  const v = on ? "visible" : "none";
  map.setLayoutProperty("smoke-fill", "visibility", v);
  map.setLayoutProperty("smoke-line", "visibility", v);
}
