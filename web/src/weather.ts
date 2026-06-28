// Tap-for-weather: NWS point forecast + locally-computed sun times.
//
// A general map-click drops a popup at the tapped coordinate. The current/first
// NWS forecast period (free, keyless, CORS-enabled, US-only) is fetched in two
// hops (points -> forecast URL) and rendered into a compact card. Sunrise /
// sunset / daylight-remaining are computed on-device with the NOAA solar
// algorithm — no network, no dependency — so the sun row paints even when the
// forecast is offline or the point is outside NWS coverage (offshore -> 404).
//
// The click handler defers to the route-click popups in main.ts: if the tap
// landed on a rendered route line we bail and let that layer's handler answer.

import maplibregl from "maplibre-gl";
import type { Map as MLMap, MapMouseEvent } from "maplibre-gl";
import { ROUTE_LAYERS } from "./style";

// --- NWS API -------------------------------------------------------------
const NWS_POINTS_URL = "https://api.weather.gov/points";
const NWS_ACCEPT = "application/geo+json";

interface PointsResponse {
  properties?: {
    forecast?: string;
    relativeLocation?: {
      properties?: { city?: string; state?: string };
    };
  };
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  shortForecast?: string;
  windSpeed?: string;
  windDirection?: string;
  isDaytime?: boolean;
}

interface ForecastResponse {
  properties?: { periods?: ForecastPeriod[] };
}

interface WeatherInfo {
  city?: string;
  state?: string;
  period?: ForecastPeriod;
}

/** Two-hop NWS lookup. Throws on any non-200 / network failure so the caller
 *  can show the friendly "unavailable" state. Coordinates are sent at 4-decimal
 *  precision (NWS rejects / redirects on more, and the grid is ~2.5km anyway). */
async function fetchWeather(lat: number, lng: number): Promise<WeatherInfo> {
  const pt = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const pointsRes = await fetch(`${NWS_POINTS_URL}/${pt}`, {
    headers: { Accept: NWS_ACCEPT },
  });
  if (!pointsRes.ok) throw new Error(`points ${pointsRes.status}`);
  const points = (await pointsRes.json()) as PointsResponse;

  const forecastUrl = points.properties?.forecast;
  const loc = points.properties?.relativeLocation?.properties;
  if (!forecastUrl) throw new Error("no forecast url");

  const fcRes = await fetch(forecastUrl, { headers: { Accept: NWS_ACCEPT } });
  if (!fcRes.ok) throw new Error(`forecast ${fcRes.status}`);
  const fc = (await fcRes.json()) as ForecastResponse;

  return {
    city: loc?.city,
    state: loc?.state,
    period: fc.properties?.periods?.[0],
  };
}

// --- Sun times (NOAA solar algorithm) ------------------------------------
// Compact reimplementation of the standard NOAA / SunCalc math: no network and
// no dependency, accurate to well under a minute for our latitudes.
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397; // Earth's axial tilt
const SUN_ANGLE = -0.833 * RAD; // refraction + solar disc at the horizon
const J0 = 0.0009; // fractional-day correction

const toDays = (date: Date): number => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number): Date => new Date((j + 0.5 - J1970 + J2000) * DAY_MS);
const solarMeanAnomaly = (d: number): number => RAD * (357.5291 + 0.98560028 * d);

const eclipticLongitude = (M: number): number => {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
};

const declination = (L: number): number => Math.asin(Math.sin(L) * Math.sin(OBLIQUITY));
const approxTransit = (Ht: number, lw: number, n: number): number =>
  J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number): number =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, dec: number): number =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

/** Sunrise/sunset for the local day containing `date`. Returns null for polar
 *  day/night (acos out of range -> NaN) — never happens in CA, but handled. */
export function sunTimes(
  date: Date,
  lat: number,
  lng: number,
): { sunrise: Date; sunset: Date } | null {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const jNoon = solarTransitJ(ds, M, L);

  const w = hourAngle(SUN_ANGLE, phi, dec);
  if (Number.isNaN(w)) return null;

  const jSet = solarTransitJ(approxTransit(w, lw, n), M, L);
  const jRise = jNoon - (jSet - jNoon);
  return { sunrise: fromJulian(jRise), sunset: fromJulian(jSet) };
}

// --- Rendering -----------------------------------------------------------
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** Escape API/user text before it goes into popup innerHTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The sun row: rise / set / daylight-remaining, computed locally for `now`. */
function sunRowHTML(lat: number, lng: number, now: Date): string {
  const sun = sunTimes(now, lat, lng);
  if (!sun) {
    return `<p class="wx-sun">Sun: continuous day or night at this latitude</p>`;
  }
  const rise = sun.sunrise.toLocaleTimeString([], TIME_FMT);
  const set = sun.sunset.toLocaleTimeString([], TIME_FMT);

  let remaining: string;
  if (now >= sun.sunrise && now <= sun.sunset) {
    const mins = Math.round((sun.sunset.getTime() - now.getTime()) / 60_000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    remaining = `${h} h ${m} m of daylight left`;
  } else {
    remaining = "Sun is down";
  }
  return `<p class="wx-sun">☀ ${esc(rise)} &nbsp;·&nbsp; 🌇 ${esc(set)}<br>${esc(remaining)}</p>`;
}

/** Title line: place name from NWS relative location, or a neutral fallback. */
function titleHTML(info?: WeatherInfo): string {
  const place =
    info?.city && info?.state
      ? `Near ${esc(info.city)}, ${esc(info.state)}`
      : "This location";
  return `<h3>${place}</h3>`;
}

/** Forecast line: temp + short forecast + wind, or a friendly unavailable note. */
function forecastHTML(period?: ForecastPeriod): string {
  if (!period) {
    return `<p>Weather unavailable for this spot — try again or pick another point.</p>`;
  }
  const temp =
    period.temperature !== undefined
      ? `${period.temperature}°${esc(period.temperatureUnit ?? "")}`
      : "";
  const wind =
    period.windSpeed && period.windDirection
      ? `, wind ${esc(period.windDirection)} ${esc(period.windSpeed)}`
      : period.windSpeed
        ? `, wind ${esc(period.windSpeed)}`
        : "";
  const short = period.shortForecast ? esc(period.shortForecast) : "";
  const lead = period.name ? `<strong>${esc(period.name)}:</strong> ` : "";
  return `<p>${lead}${temp}${temp && short ? " · " : ""}${short}${wind}</p>`;
}

/** Compose the full popup body. `info` undefined = forecast failed/unavailable. */
function cardHTML(lat: number, lng: number, info?: WeatherInfo): string {
  return `<div class="wx">${titleHTML(info)}${forecastHTML(info?.period)}${sunRowHTML(
    lat,
    lng,
    new Date(),
  )}</div>`;
}

// --- Wiring --------------------------------------------------------------
export function initWeather(map: MLMap): void {
  map.on("click", (e: MapMouseEvent) => {
    // Defer to the route-click popups (main.ts): if a route line was tapped,
    // let its own layer handler answer instead of opening a weather popup.
    const hit = map.queryRenderedFeatures(e.point, {
      layers: [
        ROUTE_LAYERS.open,
        ROUTE_LAYERS.closed,
        ROUTE_LAYERS.trail,
        ROUTE_LAYERS.affected,
      ],
    });
    if (hit.length) return;

    const { lat, lng } = e.lngLat;
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
      .setLngLat(e.lngLat)
      .setHTML(`<div class="wx"><p>Loading forecast…</p>${sunRowHTML(lat, lng, new Date())}</div>`)
      .addTo(map);

    fetchWeather(lat, lng)
      .then((info) => {
        if (!popup.isOpen()) return; // user closed it mid-flight
        popup.setHTML(cardHTML(lat, lng, info));
      })
      .catch(() => {
        if (!popup.isOpen()) return;
        popup.setHTML(cardHTML(lat, lng)); // friendly "unavailable" + sun row
      });
  });
}
