// Place + forest quick-jump search for the control panel.
//
// Two affordances, wired up by initSearch():
//  1. A free-text place search that geocodes via OpenStreetMap Nominatim and
//     flies to the best California result, dropping a temporary marker.
//  2. A <select> of the 17 CA national forests that flies to each forest.
//
// NOTE ON GEOCODING: Nominatim's public endpoint is free and fine for
// low-traffic / personal use, but its usage policy caps requests at ~1/sec and
// forbids autocomplete-on-every-keystroke. We therefore geocode only on
// Enter/submit, never per keypress. A production deployment should swap in a
// keyed geocoder (Mapbox / Maptiler) or self-host Nominatim — known follow-up.

import maplibregl from "maplibre-gl";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// California viewbox [west,north,east,south] used to bias + bound results.
const CA_VIEWBOX = "-124.5,42.1,-114.0,32.5";
const BRAND_PURPLE = "#6d1bb5";

/** Approximate centers + zoom for each CA national forest quick-jump.
 *  Coordinates are eyeballed forest centroids — they only need to land the
 *  viewport in the right area, not be survey-accurate. Angeles is excluded. */
interface ForestJump {
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
}

const FORESTS: ForestJump[] = [
  { name: "Los Padres", center: [-119.8, 34.9], zoom: 8 },
  { name: "Cleveland", center: [-116.7, 33.0], zoom: 9 },
  { name: "San Bernardino", center: [-116.9, 34.15], zoom: 9 },
  { name: "Sequoia", center: [-118.5, 36.0], zoom: 8 },
  { name: "Sierra", center: [-119.2, 37.2], zoom: 8 },
  { name: "Inyo", center: [-118.3, 37.4], zoom: 8 },
  { name: "Stanislaus", center: [-119.9, 38.2], zoom: 8 },
  { name: "Eldorado", center: [-120.4, 38.8], zoom: 8 },
  { name: "Tahoe", center: [-120.5, 39.3], zoom: 9 },
  { name: "Plumas", center: [-120.8, 40.0], zoom: 8 },
  { name: "Lassen", center: [-121.3, 40.4], zoom: 8 },
  { name: "Modoc", center: [-120.6, 41.4], zoom: 8 },
  { name: "Shasta-Trinity", center: [-122.4, 40.9], zoom: 8 },
  { name: "Klamath", center: [-123.0, 41.6], zoom: 8 },
  { name: "Six Rivers", center: [-123.7, 41.2], zoom: 8 },
  { name: "Mendocino", center: [-122.9, 39.7], zoom: 8 },
  { name: "Humboldt-Toiyabe", center: [-119.2, 38.7], zoom: 8 },
];

interface NominatimResult {
  lat: string;
  lon: string;
}

export function initSearch(map: maplibregl.Map): void {
  const input = document.getElementById("search") as HTMLInputElement | null;
  const button = document.getElementById("search-go") as HTMLButtonElement | null;
  const status = document.getElementById("search-status") as HTMLParagraphElement | null;
  const forestSel = document.getElementById("forest-jump") as HTMLSelectElement | null;
  if (!input || !button || !status || !forestSel) return;

  // A single reusable marker we move/remove rather than piling up markers.
  let marker: maplibregl.Marker | null = null;

  const clearMarker = (): void => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  };

  const setStatus = (msg: string): void => {
    status.textContent = msg;
  };

  async function runSearch(): Promise<void> {
    const q = input!.value.trim();
    clearMarker();
    if (!q) {
      setStatus("");
      return;
    }
    setStatus("Searching…");
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      limit: "5",
      countrycodes: "us",
      viewbox: CA_VIEWBOX,
      bounded: "1",
      addressdetails: "0",
    });
    try {
      const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const results = (await res.json()) as NominatimResult[];
      const top = results[0];
      if (!top) {
        setStatus("Not found");
        return;
      }
      const lng = Number(top.lon);
      const lat = Number(top.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        setStatus("Not found");
        return;
      }
      setStatus("");
      map.flyTo({ center: [lng, lat], zoom: 11 });
      marker = new maplibregl.Marker({ color: BRAND_PURPLE })
        .setLngLat([lng, lat])
        .addTo(map);
    } catch (err) {
      console.error(err);
      setStatus("Search failed");
    }
  }

  button.addEventListener("click", () => void runSearch());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void runSearch();
    }
  });
  // Clearing the box wipes the marker + status so stale results don't linger.
  input.addEventListener("input", () => {
    if (!input.value.trim()) {
      clearMarker();
      setStatus("");
    }
  });

  // --- Forest quick-jump ---------------------------------------------------
  forestSel.append(new Option("Jump to a forest…", ""));
  for (const f of FORESTS) {
    forestSel.append(new Option(f.name, f.name));
  }
  forestSel.addEventListener("change", () => {
    const f = FORESTS.find((x) => x.name === forestSel.value);
    if (!f) return;
    clearMarker();
    setStatus("");
    map.flyTo({ center: f.center, zoom: f.zoom });
  });
}
