// GPX / KML export of the routes currently visible in the viewport.
//
// "Export visible routes" turns the open road + trail lines the user is looking
// at into a GPS file they can load on a handheld/phone before they lose signal.
// We read the rendered features (queryRenderedFeatures), which is viewport- AND
// tile-clipped by design: this is an "export what you see" tool, not a bulk data
// dump. queryRenderedFeatures returns each route split across the tiles it
// touches (same `id`, different geometry slices) plus exact duplicates, so we
// group by `id` and emit ONE track/placemark per route, with one segment per
// geometry part. We do NOT try to stitch geometry across tile seams.

import type { Map as MLMap, MapGeoJSONFeature } from "maplibre-gl";
import { ROUTE_LAYERS } from "./style";
import { esc } from "./escape";

/** The subset of route feature properties we surface in the export. */
interface RouteProps {
  id?: string;
  name?: string;
  forest?: string;
  kind?: string;
  surface?: string;
  miles?: number;
}

/** One deduped route, ready to serialize. `segments` holds one coordinate run
 *  per geometry part ([lng, lat] pairs); a MultiLineString yields several. */
interface RouteGroup {
  name: string;
  desc: string;
  segments: number[][][];
}

/** Flatten a route geometry into one coordinate run per line part. */
function geometrySegments(geom: GeoJSON.Geometry): number[][][] {
  if (geom.type === "LineString") return [geom.coordinates];
  if (geom.type === "MultiLineString") return geom.coordinates;
  return [];
}

/** A short human description for the GPX <desc> / KML <description>. */
function describe(p: RouteProps): string {
  const parts: string[] = [];
  if (p.forest) parts.push(p.forest);
  if (p.kind) parts.push(p.kind);
  if (p.surface) parts.push(p.surface);
  if (typeof p.miles === "number" && Number.isFinite(p.miles)) {
    parts.push(`${p.miles.toFixed(1)} mi`);
  }
  return parts.join(" • ");
}

/** Group rendered features by route id into one RouteGroup each, deduping exact
 *  duplicate geometry parts (identical coordinate runs that recur across tiles). */
function groupRoutes(features: MapGeoJSONFeature[]): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  const seen = new Map<string, Set<string>>();

  features.forEach((f, i) => {
    const p = (f.properties ?? {}) as RouteProps;
    const key =
      (p.id ?? "").length > 0
        ? `id:${p.id}`
        : (p.name ?? "").length > 0
          ? `name:${p.name}`
          : `idx:${i}`;

    let group = groups.get(key);
    if (!group) {
      const name =
        p.name && p.name.length > 0
          ? p.name
          : `Route ${p.id ?? key}`;
      group = { name, desc: describe(p), segments: [] };
      groups.set(key, group);
      seen.set(key, new Set<string>());
    }

    const segSeen = seen.get(key)!;
    for (const seg of geometrySegments(f.geometry)) {
      if (seg.length === 0) continue;
      const sig = seg.map((pos) => `${pos[0]},${pos[1]}`).join(" ");
      if (segSeen.has(sig)) continue;
      segSeen.add(sig);
      group.segments.push(seg);
    }
  });

  // Drop any route that contributed no usable geometry.
  return [...groups.values()].filter((g) => g.segments.length > 0);
}

/** Serialize routes to a GPX 1.1 document. */
function buildGpx(groups: RouteGroup[]): string {
  const trks = groups
    .map((g) => {
      const segs = g.segments
        .map((seg) => {
          const pts = seg
            .map((pos) => `<trkpt lat="${pos[1]}" lon="${pos[0]}"></trkpt>`)
            .join("");
          return `<trkseg>${pts}</trkseg>`;
        })
        .join("");
      const desc = g.desc ? `<desc>${esc(g.desc)}</desc>` : "";
      return `<trk><name>${esc(g.name)}</name>${desc}${segs}</trk>`;
    })
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="California MVUM" ' +
    'xmlns="http://www.topografix.com/GPX/1/1">' +
    trks +
    "</gpx>"
  );
}

/** Serialize routes to a KML 2.2 document. */
function buildKml(groups: RouteGroup[]): string {
  const marks = groups
    .map((g) => {
      const coordsFor = (seg: number[][]): string =>
        seg.map((pos) => `${pos[0]},${pos[1]}`).join(" ");
      let geometry: string;
      if (g.segments.length === 1) {
        geometry = `<LineString><coordinates>${coordsFor(g.segments[0])}</coordinates></LineString>`;
      } else {
        const lines = g.segments
          .map(
            (seg) =>
              `<LineString><coordinates>${coordsFor(seg)}</coordinates></LineString>`,
          )
          .join("");
        geometry = `<MultiGeometry>${lines}</MultiGeometry>`;
      }
      const desc = g.desc ? `<description>${esc(g.desc)}</description>` : "";
      return `<Placemark><name>${esc(g.name)}</name>${desc}${geometry}</Placemark>`;
    })
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    marks +
    "</Document></kml>"
  );
}

/** Trigger a client-side download of a text file via a temporary <a download>. */
function downloadBlob(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Today's date as YYYY-MM-DD for the export filename. */
function today(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Wire the GPX / KML export buttons + status line to the live map. */
export function initExport(map: MLMap): void {
  const gpxBtn = document.getElementById("export-gpx") as HTMLButtonElement | null;
  const kmlBtn = document.getElementById("export-kml") as HTMLButtonElement | null;
  const status = document.getElementById("export-status") as HTMLParagraphElement | null;
  if (!gpxBtn || !kmlBtn || !status) return;

  const setStatus = (msg: string): void => {
    status.textContent = msg;
  };

  // Gather + dedupe the currently-visible OPEN routes (roads + trails).
  const collect = (): RouteGroup[] => {
    const features = map.queryRenderedFeatures({
      layers: [ROUTE_LAYERS.open, ROUTE_LAYERS.trail],
    }) as MapGeoJSONFeature[];
    return groupRoutes(features);
  };

  const run = (format: "gpx" | "kml"): void => {
    const groups = collect();
    if (groups.length === 0) {
      setStatus("No open routes in view — zoom to a forest first.");
      return;
    }
    if (format === "gpx") {
      downloadBlob(`ca-mvum-${today()}.gpx`, "application/gpx+xml", buildGpx(groups));
    } else {
      downloadBlob(
        `ca-mvum-${today()}.kml`,
        "application/vnd.google-earth.kml+xml",
        buildKml(groups),
      );
    }
    setStatus(`Exported ${groups.length} route${groups.length === 1 ? "" : "s"}.`);
  };

  gpxBtn.addEventListener("click", () => run("gpx"));
  kmlBtn.addEventListener("click", () => run("kml"));
}
