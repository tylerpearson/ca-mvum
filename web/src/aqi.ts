// Live ground-level air quality (EPA AirNow combined-AQI contour surface).
//
// Unlike the smoke layer (a plume traced from satellite, i.e. smoke *aloft*),
// this is the interpolated surface of ground monitors — the "is it breathable
// here" signal. Polygons carry a `gridcode` 1..6 mapping to the six standard
// AQI categories. Drawn as a soft recognizable AQI wash BELOW the routes.

import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { AQI_FEATURES_URL, CA_BBOX } from "./config";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Standard EPA AQI category colors, softened a touch so the translucent wash
 *  sits under the basemap labels without screaming. Index = gridcode. */
export const AQI_CATEGORIES: { code: number; label: string; color: string }[] = [
  { code: 1, label: "Good", color: "#5cb85c" },
  { code: 2, label: "Moderate", color: "#e7d044" },
  { code: 3, label: "Unhealthy (sensitive)", color: "#f0913c" },
  { code: 4, label: "Unhealthy", color: "#e14b3a" },
  { code: 5, label: "Very unhealthy", color: "#9a4fa3" },
  { code: 6, label: "Hazardous", color: "#7d2030" },
];

export function initAqi(map: MLMap, beforeId?: string): void {
  map.addSource("aqi", { type: "geojson", data: EMPTY, attribution: "EPA AirNow" });
  map.addLayer(
    {
      id: "aqi-fill",
      type: "fill",
      source: "aqi",
      layout: { visibility: "none" },
      paint: {
        "fill-color": [
          "match", ["get", "gridcode"],
          1, AQI_CATEGORIES[0].color,
          2, AQI_CATEGORIES[1].color,
          3, AQI_CATEGORIES[2].color,
          4, AQI_CATEGORIES[3].color,
          5, AQI_CATEGORIES[4].color,
          6, AQI_CATEGORIES[5].color,
          "#9aa0a8",
        ],
        // Good still reads as a clear green wash (so toggling the layer visibly
        // does something on clean-air days, the common case), with each worse
        // category progressively more opaque so bad air pulls focus.
        "fill-opacity": [
          "match", ["get", "gridcode"],
          1, 0.3,
          2, 0.4,
          3, 0.46,
          4, 0.5,
          5, 0.54,
          6, 0.58,
          0.34,
        ],
      },
    },
    beforeId,
  );
}

/** Fetch the latest AQI contour surface over California. Returns the WORST
 *  category present (max gridcode, 0 if none) so callers can summarize today. */
export async function refreshAqi(map: MLMap): Promise<number> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "gridcode",
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
  const resp = await fetch(`${AQI_FEATURES_URL}?${params}`);
  if (!resp.ok) throw new Error(`aqi ${resp.status}`);
  const fc = (await resp.json()) as GeoJSON.FeatureCollection;
  (map.getSource("aqi") as GeoJSONSource).setData(fc);
  return (fc.features ?? []).reduce(
    (worst, f) => Math.max(worst, Number(f.properties?.gridcode) || 0),
    0,
  );
}

export function setAqiVisible(map: MLMap, on: boolean): void {
  map.setLayoutProperty("aqi-fill", "visibility", on ? "visible" : "none");
}
