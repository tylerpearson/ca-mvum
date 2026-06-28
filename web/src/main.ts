import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { Protocol } from "pmtiles";

import {
  ROUTES_PMTILES, VEHICLE_PROFILES, CLASS_LABELS, MAP_CENTER, MAP_ZOOM, CA_BBOX,
  mvumUrlForForest,
} from "./config";
import {
  addRouteLayers, updateRouteFilters, ROUTE_LAYERS,
} from "./style";
import { dayOfYear } from "./legal";
import {
  initFire, refreshFirePerimeters, recomputeAffected, setFireVisible,
} from "./fire";
import { initSmoke, refreshSmoke, setSmokeVisible } from "./smoke";
import { initAqi, refreshAqi, setAqiVisible, AQI_CATEGORIES } from "./aqi";
import { initSnow, setSnowVisible } from "./snow";
import { initSearch } from "./search";
import { initExport } from "./export";
import { initWeather } from "./weather";

// --- PMTiles protocol ------------------------------------------------------
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// --- Basemap: USGS topo, desaturated --------------------------------------
// The topo sheet is muted (saturation pulled down, contrast/brightness lifted)
// so its own green forest boundaries, blue water and red highways fade to a
// gray pencil base — leaving the purple route overprint as the only saturated
// thing on the map. This is the single biggest legibility win on the light map.
const style: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    topo: {
      type: "raster", tileSize: 256,
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
      attribution: "USGS The National Map",
    },
    routes: { type: "vector", url: `pmtiles://${ROUTES_PMTILES}` },
  },
  layers: [
    {
      id: "basemap-topo",
      type: "raster",
      source: "topo",
      paint: {
        "raster-saturation": -0.6,
        "raster-contrast": 0.05,
        "raster-brightness-min": 0.12,
        "raster-opacity": 0.92,
      },
    },
  ],
};

const map = new maplibregl.Map({
  container: "map",
  style,
  center: MAP_CENTER,
  zoom: MAP_ZOOM,
  hash: true, // shareable #zoom/lat/lng in the URL
  maxBounds: [
    [CA_BBOX[0] - 2, CA_BBOX[1] - 1],
    [CA_BBOX[2] + 2, CA_BBOX[3] + 1],
  ],
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

// --- DOM ------------------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const vehicleSel = $("vehicle") as HTMLSelectElement;
const dateInput = $("date") as HTMLInputElement;
const hideClosed = $("hide-closed") as HTMLInputElement;
const fireToggle = $("layer-fire") as HTMLInputElement;
const smokeToggle = $("layer-smoke") as HTMLInputElement;
const aqiToggle = $("layer-aqi") as HTMLInputElement;
const snowToggle = $("layer-snow") as HTMLInputElement;
const fireStatus = $("fire-status") as HTMLParagraphElement;
const smokeStatus = $("smoke-status") as HTMLParagraphElement;
const aqiStatus = $("aqi-status") as HTMLParagraphElement;

// Grouped selector: Street-legal (plated) vs Off-road only (green/red sticker).
const groups = new Map<string, HTMLOptGroupElement>();
for (const p of VEHICLE_PROFILES) {
  let og = groups.get(p.group);
  if (!og) {
    og = document.createElement("optgroup");
    og.label = p.group;
    groups.set(p.group, og);
    vehicleSel.append(og);
  }
  const opt = document.createElement("option");
  opt.value = p.key;
  opt.textContent = p.label;
  og.append(opt);
}
const paramVehicle = new URLSearchParams(location.search).get("vehicle");
vehicleSel.value =
  VEHICLE_PROFILES.some((p) => p.key === paramVehicle) ? paramVehicle! : "moto_plated";
dateInput.value = new Date().toISOString().slice(0, 10);
hideClosed.checked = new URLSearchParams(location.search).get("hideclosed") === "1";

function selectedTokens(): string[] {
  return VEHICLE_PROFILES.find((p) => p.key === vehicleSel.value)?.tokens ?? [];
}

function selectedDoy(): number {
  const d = dateInput.value ? new Date(`${dateInput.value}T12:00:00`) : new Date();
  return dayOfYear(d);
}

function applyFilters(): void {
  updateRouteFilters(map, selectedTokens(), selectedDoy(), hideClosed.checked);
  if (fireToggle.checked) refreshAffectedStatus();
}

// --- Overlays -------------------------------------------------------------
function refreshAffectedStatus(): void {
  const n = recomputeAffected(map);
  fireStatus.textContent =
    n > 0 ? `⚠ ${n} visible route${n === 1 ? "" : "s"} inside an active fire perimeter`
          : "No visible routes inside an active fire perimeter";
}

async function toggleFire(on: boolean): Promise<void> {
  setFireVisible(map, on);
  if (!on) { fireStatus.textContent = ""; return; }
  fireStatus.textContent = "Loading active fires…";
  try {
    const fires = await refreshFirePerimeters(map);
    refreshAffectedStatus();
    if (fires === 0) fireStatus.textContent = "No active fire perimeters in California right now";
  } catch (e) {
    fireStatus.textContent = "Couldn't load fire data — try again later";
    console.error(e);
  }
}

async function toggleSmoke(on: boolean): Promise<void> {
  setSmokeVisible(map, on);
  if (!on) { smokeStatus.textContent = ""; return; }
  smokeStatus.textContent = "Checking smoke…";
  try {
    const n = await refreshSmoke(map);
    smokeStatus.textContent = n === 0
      ? "No smoke plumes over California right now"
      : `⚠ ${n} smoke plume${n === 1 ? "" : "s"} over California (smoke aloft)`;
  } catch (e) {
    smokeStatus.textContent = "Couldn't load smoke — try again later";
    console.error(e);
  }
}

async function toggleAqi(on: boolean): Promise<void> {
  setAqiVisible(map, on);
  if (!on) { aqiStatus.textContent = ""; return; }
  aqiStatus.textContent = "Checking air quality…";
  try {
    const worst = await refreshAqi(map);
    const cat = AQI_CATEGORIES.find((c) => c.code === worst);
    aqiStatus.textContent = worst <= 1
      ? "Air quality: Good across California right now"
      : `Air quality reaches “${cat?.label ?? "elevated"}” somewhere in California today`;
  } catch (e) {
    aqiStatus.textContent = "Couldn't load air quality — try again later";
    console.error(e);
  }
}

fireToggle.addEventListener("change", () => void toggleFire(fireToggle.checked));
smokeToggle.addEventListener("change", () => void toggleSmoke(smokeToggle.checked));
aqiToggle.addEventListener("change", () => void toggleAqi(aqiToggle.checked));
snowToggle.addEventListener("change", () => setSnowVisible(map, snowToggle.checked));
vehicleSel.addEventListener("change", applyFilters);
dateInput.addEventListener("change", applyFilters);
hideClosed.addEventListener("change", applyFilters);
// Debounced so panning during an active-fire event doesn't re-run the turf
// intersection over every rendered route on each settle.
function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const onMoveAffected = debounce(() => {
  if (fireToggle.checked) refreshAffectedStatus();
}, 200);
map.on("moveend", onMoveAffected);

// --- Popups ---------------------------------------------------------------
function popupHtml(p: Record<string, unknown>, inFire: boolean): string {
  const title = (p.name as string) || (p.id ? `Route ${p.id}` : "Unnamed route");
  const allowed = String(p.classes ?? "")
    .split(",").filter(Boolean).map((k) => CLASS_LABELS[k] ?? k).join(", ");
  const rows: [string, string][] = [
    ["Forest", String(p.forest ?? "—")],
    ["MVUM class", String(p.symbol_name ?? "—")],
    ["Type", p.kind === "trail" ? "Trail" : "Road"],
    ["Surface", String(p.surface ?? "—")],
    ["Season", String(p.window_text ?? "—")],
    ["Open to", allowed || "—"],
  ];
  const body = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const warn = inFire ? `<p class="pop-warn">⚠ Within an active fire perimeter</p>` : "";
  // Link to the forest's official MVUM — the authoritative source this route was
  // derived from, and where to confirm the legal designation before a trip.
  const mvum = mvumUrlForForest(p.forest as string | undefined);
  const link =
    `<p class="pop-link"><a href="${mvum}" target="_blank" rel="noopener noreferrer">` +
    `Official MVUM ↗</a></p>`;
  return `<div class="pop"><h3>${title}</h3>${warn}<dl>${body}</dl>${link}</div>`;
}

for (const layer of [ROUTE_LAYERS.open, ROUTE_LAYERS.closed, ROUTE_LAYERS.affected]) {
  map.on("click", layer, (e) => {
    const f = e.features?.[0];
    if (!f) return;
    new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
      .setLngLat(e.lngLat)
      .setHTML(popupHtml(f.properties as Record<string, unknown>, layer === ROUTE_LAYERS.affected))
      .addTo(map);
  });
  map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
}

// --- Boot -----------------------------------------------------------------
function applyLayerParams(): void {
  const layers = (new URLSearchParams(location.search).get("layers") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (layers.includes("fire")) { fireToggle.checked = true; void toggleFire(true); }
  if (layers.includes("smoke")) { smokeToggle.checked = true; void toggleSmoke(true); }
  if (layers.includes("aqi")) { aqiToggle.checked = true; void toggleAqi(true); }
  if (layers.includes("snow")) { snowToggle.checked = true; setSnowVisible(map, true); }
}

map.on("load", () => {
  addRouteLayers(map);
  // Area-condition washes sit BELOW the route network (inserted before the
  // route casing) so the purple routes stay crisp on top of them. Fire is the
  // exception — its closure boundary rides above everything (initFire, last).
  initSnow(map, ROUTE_LAYERS.casing);
  initAqi(map, ROUTE_LAYERS.casing);
  initSmoke(map, ROUTE_LAYERS.casing);
  initFire(map);
  applyFilters();
  applyLayerParams();
  initSearch(map);
  initExport(map);
  // Tap anywhere off a route for a point forecast + sun times. Registered after
  // the route-click handlers above; it bails when a route was tapped so those win.
  initWeather(map);
});
