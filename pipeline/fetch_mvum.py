"""Fetch California MVUM roads + trails from the USFS EDW ArcGIS REST service.

Pulls layer 1 (Roads) and layer 2 (Trails) for each CA forest, paginating around
the service's 2,000-record cap, and writes:

  data/<forest-slug>.geojson   per-forest FeatureCollection (roads + trails)
  data/ca-statewide.geojson    everything merged

Each feature gets a `kind` property ("road" | "trail"). Geometry is requested in
WGS84 (EPSG:4326) so it's web-map ready.

Run:  uv run python -m pipeline.fetch_mvum
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

from pipeline.forests import CA_FORESTS, slug

SERVICE = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer"
LAYERS = {1: "road", 2: "trail"}  # layer id -> kind
# The service advertises maxRecordCount=2000, but geometry-heavy forests (e.g.
# Sierra) 500 when asked for 2000 features with geometry. 1000 is reliable.
PAGE_SIZE = 1000
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _query_page(client: httpx.Client, layer: int, where: str, offset: int) -> dict:
    """One page of a layer query as GeoJSON, with transfer-limit info."""
    # NOTE: f=geojson does not echo `exceededTransferLimit`, so we page until a
    # short page comes back. Geometry is returned in 4326 via outSR.
    # Request all fields: Roads and Trails layers share the vehicle-class +
    # *_datesopen fields but differ on others (Roads has surfacetype /
    # operationalmaintlevel; Trails has trailclass etc.), so a fixed outFields
    # list valid for Roads 400s on Trails. normalize.py cherry-picks by name.
    params = {
        "where": where,
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "geojson",
    }
    url = f"{SERVICE}/{layer}/query"
    last_exc: Exception | None = None
    for attempt in range(5):  # retry transient 5xx / timeouts with backoff
        try:
            resp = client.get(url, params=params, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"ArcGIS error layer {layer} offset {offset}: {data['error']}")
            return data
        except (httpx.HTTPStatusError, httpx.TransportError, RuntimeError) as exc:
            last_exc = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"layer {layer} offset {offset} failed after retries: {last_exc}")


def fetch_layer(client: httpx.Client, layer: int, forest: str) -> list[dict]:
    """All features for one forest in one layer, paginated."""
    kind = LAYERS[layer]
    where = f"forestname='{forest.replace(chr(39), chr(39) * 2)}'"
    features: list[dict] = []
    offset = 0
    while True:
        page = _query_page(client, layer, where, offset)
        batch = page.get("features", [])
        for feat in batch:
            (feat.setdefault("properties", {}))["kind"] = kind
        features.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.2)  # be polite to the public service
    return features


def fetch_forest(client: httpx.Client, forest: str) -> list[dict]:
    feats: list[dict] = []
    for layer in LAYERS:
        try:
            feats.extend(fetch_layer(client, layer, forest))
        except Exception as exc:  # noqa: BLE001 - one bad layer shouldn't drop the forest
            print(f"    · {forest} layer {layer} ({LAYERS[layer]}) failed: {exc}",
                  file=sys.stderr)
    return feats


def data_quality_failures(per_forest_counts: dict[str, int]) -> list[str]:
    """Forests whose fetch returned zero features.

    The EDW service has been observed answering datacenter IPs with HTTP 200
    and EMPTY feature arrays (2026-07-02: all 17 forests, from a GitHub
    runner). Every forest in CA_FORESTS has MVUM routes, so an empty result
    is always a fetch anomaly, never real data — treat it like a failure so
    `make fetch` (and the data-refresh workflow) stops before building
    hollow tiles.
    """
    return [forest for forest, n in per_forest_counts.items() if n == 0]


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    statewide: list[dict] = []
    failures: list[str] = []
    per_forest_counts: dict[str, int] = {}

    with httpx.Client(headers={"User-Agent": "ca-mvum/0.1 (build pipeline)"}) as client:
        for forest in CA_FORESTS:
            try:
                feats = fetch_forest(client, forest)
            except Exception as exc:  # noqa: BLE001 - report and continue
                print(f"  ✗ {forest}: {exc}", file=sys.stderr)
                failures.append(forest)
                continue

            out = DATA_DIR / f"{slug(forest)}.geojson"
            out.write_text(
                json.dumps({"type": "FeatureCollection", "features": feats})
            )
            roads = sum(1 for f in feats if f["properties"]["kind"] == "road")
            trails = len(feats) - roads
            flag = "⚠ EMPTY" if not feats else ""
            print(f"  ✓ {forest:<38} {len(feats):>6} features "
                  f"({roads} road / {trails} trail) {flag}")
            statewide.extend(feats)
            per_forest_counts[forest] = len(feats)

    (DATA_DIR / "ca-statewide.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": statewide})
    )
    print(f"\nStatewide total: {len(statewide)} features across "
          f"{len(CA_FORESTS) - len(failures)}/{len(CA_FORESTS)} forests.")
    empty = data_quality_failures(per_forest_counts)
    if failures:
        print(f"Failed forests: {', '.join(failures)}", file=sys.stderr)
    if empty:
        print(f"Empty forests (fetch anomaly): {', '.join(empty)}", file=sys.stderr)
    if failures or empty:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
