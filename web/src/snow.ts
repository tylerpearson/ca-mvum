// Live snow depth (NOHRSC / SNODAS) as a WMS raster overlay.
//
// Unlike fire and smoke, this is a server-rendered raster (a continuous depth
// field), so it's a MapLibre raster source pointed at the WMS GetMap endpoint
// with the {bbox-epsg-3857} token. Sits above the basemap, below the routes.

import type { Map as MLMap } from "maplibre-gl";
import { SNOW_WMS_URL, SNOW_WMS_LAYERS } from "./config";

function wmsTemplate(): string {
  const q = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: SNOW_WMS_LAYERS,
    styles: "",
    format: "image/png",
    transparent: "true",
    crs: "EPSG:3857",
    width: "256",
    height: "256",
  });
  // MapLibre substitutes the projected bbox; append raw so it isn't encoded.
  return `${SNOW_WMS_URL}?${q.toString()}&bbox={bbox-epsg-3857}`;
}

export function initSnow(map: MLMap, beforeId?: string): void {
  map.addSource("snow", {
    type: "raster",
    tiles: [wmsTemplate()],
    tileSize: 256,
    attribution: "NOAA NOHRSC",
  });
  map.addLayer(
    {
      id: "snow-raster",
      type: "raster",
      source: "snow",
      layout: { visibility: "none" },
      paint: { "raster-opacity": 0.5 },
    },
    beforeId,
  );
}

export function setSnowVisible(map: MLMap, on: boolean): void {
  map.setLayoutProperty("snow-raster", "visibility", on ? "visible" : "none");
}
