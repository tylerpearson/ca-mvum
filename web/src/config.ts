// Central configuration: vehicle classes, data endpoints, map defaults.

// California's real question isn't "what physical vehicle" — it's how it's
// registered. A STREET-LEGAL (plated) vehicle may use any road designated for
// highway-legal vehicles, PLUS routes open to its OHV type. An OFF-ROAD-ONLY
// (green/red sticker) machine may use ONLY routes designated for that OHV class.
//
// So each selector option is a *profile* that maps to a set of underlying MVUM
// class tokens (emitted in `classes` by pipeline/normalize.py); a route is open
// to the profile if it permits ANY of those tokens.
//
// suv4x4 includes the 4WD/2WD >50″ classes: MVUM designates by vehicle
// type/width, and a street-legal 4×4 IS a 4WD >50″ — without these tokens,
// gt50-only jeep trails (e.g. Bronco Peak, Cleveland NF) would never show
// open for anyone.

export interface VehicleProfile {
  key: string;
  label: string;
  group: "Street-legal (plated)" | "Off-road only (green / red sticker)";
  tokens: string[];
}

export const VEHICLE_PROFILES: VehicleProfile[] = [
  // Street-legal: highway-legal roads are the big set; plated bikes add moto trails.
  { key: "moto_plated", label: "Dual-sport motorcycle (plated)", group: "Street-legal (plated)", tokens: ["passenger", "high_clearance", "motorcycle"] },
  { key: "suv4x4", label: "SUV / 4×4 / truck (street-legal)", group: "Street-legal (plated)", tokens: ["passenger", "high_clearance", "4wd_gt50", "2wd_gt50"] },
  { key: "car", label: "Car / passenger (street-legal)", group: "Street-legal (plated)", tokens: ["passenger"] },
  // Off-road only: OHV-designated routes for that class.
  { key: "dirtbike", label: "Dirt bike (OHV / green sticker)", group: "Off-road only (green / red sticker)", tokens: ["motorcycle"] },
  { key: "atv", label: "ATV (OHV)", group: "Off-road only (green / red sticker)", tokens: ["atv"] },
  { key: "utv_narrow", label: "UTV / side-by-side ≤50″ (OHV)", group: "Off-road only (green / red sticker)", tokens: ["other_wheeled_ohv", "other_ohv_lt50", "tracked_ohv_lt50"] },
  { key: "utv_wide", label: "UTV / side-by-side >50″ (OHV)", group: "Off-road only (green / red sticker)", tokens: ["other_ohv_gt50", "tracked_ohv_gt50"] },
];

/** Human labels for the raw MVUM class tokens, used in route popups. */
export const CLASS_LABELS: Record<string, string> = {
  passenger: "Passenger vehicle",
  high_clearance: "High-clearance vehicle",
  motorcycle: "Motorcycle (OHV)",
  atv: "ATV",
  "4wd_gt50": "4WD >50″",
  "2wd_gt50": "2WD >50″",
  other_wheeled_ohv: "Other wheeled OHV",
  otherwheeled_ohv: "Other wheeled OHV",
  tracked_ohv_lt50: "Tracked OHV ≤50″",
  other_ohv_lt50: "Other OHV ≤50″",
  tracked_ohv_gt50: "Tracked OHV >50″",
  other_ohv_gt50: "Other OHV >50″",
  truck: "Truck",
  motorhome: "Motorhome",
  bus: "Bus",
  e_bike1: "E-bike (Class 1)",
  e_bike2: "E-bike (Class 2)",
  e_bike3: "E-bike (Class 3)",
};

/** Vector tiles built by pipeline/build_tiles.py.
 *  Read over HTTP range requests (the PMTiles default). In dev we serve the
 *  committed file from web/public/tiles (Vite supports ranges); in a production
 *  build we point at R2, which serves real 206 range responses + CORS.
 *  import.meta.env.PROD is set by Vite during `vite build`, so the production
 *  URL is baked in at build time without depending on any host-provided env var.
 *  VITE_TILES_URL still overrides both if set (e.g. to test another bucket).
 *  See docs/r2-range-requests-plan.md. */
const R2_TILES_URL = "https://tiles.ca-mvum.typearson.dev/routes.pmtiles";
export const ROUTES_PMTILES =
  import.meta.env.VITE_TILES_URL ??
  (import.meta.env.PROD ? R2_TILES_URL : "/tiles/routes.pmtiles");
export const ROUTES_SOURCE_LAYER = "routes";

/** MVUM tile build date — the point-in-time vintage of the route data baked
 *  into routes.pmtiles. Unlike the live fire/smoke/AQI/snow overlays, routes are
 *  only as fresh as the last pipeline run, so surface this to users. Updated
 *  automatically by pipeline/build_tiles.py on each `make tiles`. Mirrored in
 *  index.html (#data-vintage). */
export const DATA_VINTAGE = "June 2026";

/** California bounding box [west, south, east, north] for clipping live queries. */
export const CA_BBOX: [number, number, number, number] = [-124.5, 32.5, -114.0, 42.1];

export const MAP_CENTER: [number, number] = [-119.4, 37.2];
export const MAP_ZOOM = 5.4;

// --- Live condition endpoints (verified against the live services) --------

/** NIFC / WFIGS current interagency wildfire perimeters (ArcGIS FeatureServer).
 *  Polygon features; key fields poly_IncidentName, attr_IncidentSize,
 *  attr_PercentContained, attr_FireBehaviorGeneral. */
export const FIRE_PERIMETERS_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/" +
  "WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query";

/** NOAA HMS daily satellite smoke detection (ArcGIS FeatureServer, GeoJSON).
 *  Polygon features with a `Density` field: Light / Medium / Heavy.
 *  This is smoke *aloft* (analyst-traced from satellite), not ground air. */
export const SMOKE_FEATURES_URL =
  "https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/" +
  "NOAA_Satellite_Smoke_Detection_(v1)/FeatureServer/0/query";

/** EPA AirNow latest combined-AQI contour surface (ArcGIS FeatureServer).
 *  Polygon features with a `gridcode` 1..6 = AQI category (Good..Hazardous).
 *  This is *ground-level* air quality (monitor-interpolated), the breathing
 *  signal that complements the smoke-aloft layer. Refreshed hourly upstream. */
export const AQI_FEATURES_URL =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/" +
  "AirNowLatestContoursCombined/FeatureServer/0/query";

/** NOHRSC snow analysis (SNODAS) snow depth raster, served via WMS. Layer 0. */
export const SNOW_WMS_URL =
  "https://mapservices.weather.noaa.gov/raster/services/snow/NOHRSC_Snow_Analysis/MapServer/WMSServer";
export const SNOW_WMS_LAYERS = "0"; // Snow Depth

// --- Official MVUM map links ----------------------------------------------

/** Forest Service Pacific Southwest Region (R5) MVUM & OSVUM Finder — the
 *  official interactive tool that links to the downloadable geospatial-PDF MVUM
 *  for every California (R5) national forest. Per-forest MVUM page paths on
 *  fs.usda.gov are inconsistent (Tahoe lives under /maps-guides/, others under
 *  /data-tools/) and get re-pathed when maps are reissued, so we link to this
 *  one canonical finder rather than 16 fragile deep links. Verified June 2026. */
export const R5_MVUM_FINDER_URL =
  "https://www.fs.usda.gov/r05/data-tools/interactive-maps/mvum-finder";

/** Humboldt-Toiyabe straddles the Nevada line and is administered by Region 4,
 *  not R5, so it isn't in the R5 finder — link to its own MVUM page. */
export const HUMBOLDT_TOIYABE_MVUM_URL =
  "https://www.fs.usda.gov/r04/humboldt-toiyabe/data-tools/interactive-maps/motor-vehicle-use-maps-mvum";

/** Official MVUM download page for a route's forest (matched on the `forest`
 *  property, e.g. "Tahoe National Forest"). Humboldt-Toiyabe (R4) has its own
 *  page; every other CA forest resolves through the R5 MVUM Finder. */
export function mvumUrlForForest(forest: string | null | undefined): string {
  if (forest && forest.startsWith("Humboldt-Toiyabe")) return HUMBOLDT_TOIYABE_MVUM_URL;
  return R5_MVUM_FINDER_URL;
}
