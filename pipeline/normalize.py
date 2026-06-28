"""Normalize raw MVUM features into a compact, tile-friendly schema.

The MVUM data model (confirmed against the live service): a vehicle class is
*permitted* on a route when its `<class>_datesopen` field is non-empty. The value
is one of:

  - a date window  "MM/DD-MM/DD"   (e.g. "05/01-11/15")
  - the literal    "open"          (open year-round)
  - blank / null                   (class NOT permitted)

The separate yes/no permission columns are unreliable (often empty), so we derive
both *permission* and *season* purely from the `*_datesopen` fields.

Output per feature keeps only what the map needs:

  name, id, forest, district, surface, maintlevel, symbol_name, miles, kind
  classes      ",passenger,motorcycle,atv,"  (comma-delimited; substring-filterable)
  season       "yearlong" | "seasonal"
  open_start   day-of-year 1..366 (representative window start)
  open_end     day-of-year 1..366 (representative window end)
  window_text  "01/01-12/31"      (human-readable representative window)

Run:  uv run python -m pipeline.normalize
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import httpx
from shapely.geometry import shape
from shapely.prepared import prep

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SRC = DATA_DIR / "ca-statewide.geojson"
DST = DATA_DIR / "ca-normalized.geojson"
BOUNDARY = DATA_DIR / "ca-boundary.geojson"

# US Census TIGERweb states — authoritative, public, no token required.
CA_BOUNDARY_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "State_County/MapServer/0/query"
    "?where=NAME%3D%27California%27&outFields=NAME&returnGeometry=true"
    "&outSR=4326&f=geojson"
)

# Canonical class key -> the MVUM `*_datesopen` field that gates it.
CLASS_DATEFIELD: dict[str, str] = {
    "passenger": "passengervehicle_datesopen",
    "high_clearance": "highclearancevehicle_datesopen",
    "truck": "truck_datesopen",
    "bus": "bus_datesopen",
    "motorhome": "motorhome_datesopen",
    "4wd_gt50": "fourwd_gt50_datesopen",
    "2wd_gt50": "twowd_gt50_datesopen",
    "tracked_ohv_gt50": "tracked_ohv_gt50_datesopen",
    "other_ohv_gt50": "other_ohv_gt50_datesopen",
    "atv": "atv_datesopen",
    "motorcycle": "motorcycle_datesopen",
    "other_wheeled_ohv": "otherwheeled_ohv_datesopen",
    "tracked_ohv_lt50": "tracked_ohv_lt50_datesopen",
    "other_ohv_lt50": "other_ohv_lt50_datesopen",
}

# E-bike classes are gated by a plain yes/no field (no separate window).
EBIKE_FIELDS: dict[str, str] = {
    "e_bike1": "e_bike_class1",
    "e_bike2": "e_bike_class2",
    "e_bike3": "e_bike_class3",
}

# Cumulative day-of-year for the 1st of each month (non-leap); index 1..12.
_MONTH_START = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def _doy(month: int, day: int) -> int:
    """Day-of-year (1..365) for a month/day, ignoring leap years."""
    return _MONTH_START[month] + day


def _blank(v) -> bool:
    return v is None or str(v).strip() == ""


def parse_window(raw) -> tuple[int, int] | None:
    """Parse a `*_datesopen` value into (start_doy, end_doy).

    Returns the full year for "open"/"yearlong"/unrecognized-but-present values,
    and None when the field is blank (class not permitted).
    """
    if _blank(raw):
        return None
    s = str(raw).strip().lower()
    if s in ("open", "yearlong", "year-long", "year long"):
        return (1, 365)
    # Expect "MM/DD-MM/DD"
    try:
        a, b = s.split("-", 1)
        m1, d1 = (int(x) for x in a.split("/"))
        m2, d2 = (int(x) for x in b.split("/"))
        return (_doy(m1, d1), _doy(m2, d2))
    except Exception:
        # Present but unparseable -> treat as permitted, year-round, but keep raw.
        return (1, 365)


def normalize_feature(props: dict) -> dict | None:
    """Map one raw MVUM properties dict to the compact schema. None to drop."""
    allowed: list[str] = []
    windows: list[tuple[int, int]] = []

    for key, field in CLASS_DATEFIELD.items():
        win = parse_window(props.get(field))
        if win is not None:
            allowed.append(key)
            windows.append(win)

    for key, field in EBIKE_FIELDS.items():
        v = props.get(field)
        if not _blank(v) and str(v).strip().lower() in ("yes", "y", "true", "1", "open"):
            allowed.append(key)

    if not allowed:
        return None  # no motorized class permitted -> not useful on this map

    # Representative window = the most common bounded window among permitted
    # classes; fall back to year-round. Seasonal closures typically gate the
    # whole segment, so classes usually share one window.
    bounded = [w for w in windows if w != (1, 365)]
    if bounded:
        start, end = Counter(bounded).most_common(1)[0][0]
        season = "seasonal"
    else:
        start, end = 1, 365
        season = "yearlong"

    return {
        "name": (props.get("name") or "").strip() or None,
        "id": (props.get("id") or "").strip() or None,
        "forest": props.get("forestname"),
        "district": props.get("districtname"),
        "surface": props.get("surfacetype"),
        "maintlevel": props.get("operationalmaintlevel"),
        "symbol_name": props.get("mvum_symbol_name"),
        "miles": round(props.get("gis_miles") or 0.0, 2),
        "kind": props.get("kind"),
        "classes": "," + ",".join(allowed) + ",",
        "season": season,
        "open_start": start,
        "open_end": end,
        "window_text": _window_text(start, end),
    }


def _window_text(start: int, end: int) -> str:
    if (start, end) == (1, 365):
        return "Yearlong"
    return f"{_doy_to_md(start)}-{_doy_to_md(end)}"


def _doy_to_md(doy: int) -> str:
    for m in range(12, 0, -1):
        if doy > _MONTH_START[m]:
            return f"{m:02d}/{doy - _MONTH_START[m]:02d}"
    return "01/01"


def load_ca_boundary():
    """Prepared California polygon for clipping; downloads + caches once.

    Humboldt-Toiyabe NF spans into Nevada and the national service returns all
    of it, so we keep only features that fall within California.
    """
    if not BOUNDARY.exists():
        print("Fetching California boundary…")
        resp = httpx.get(CA_BOUNDARY_URL, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("features"):
            raise RuntimeError(f"CA boundary fetch returned no features: {data}")
        BOUNDARY.write_text(resp.text)
    fc = json.loads(BOUNDARY.read_text())
    if not fc.get("features"):
        BOUNDARY.unlink(missing_ok=True)  # drop the poisoned cache
        raise RuntimeError("Cached CA boundary is invalid; re-run to refetch.")
    geom = shape(fc["features"][0]["geometry"])
    return prep(geom)


def main() -> int:
    fc = json.loads(SRC.read_text())
    ca = load_ca_boundary()
    out_features = []
    dropped = 0
    outside = 0
    for feat in fc["features"]:
        geom = feat.get("geometry")
        np = normalize_feature(feat.get("properties", {}))
        if np is None or geom is None:
            dropped += 1
            continue
        if not ca.intersects(shape(geom)):
            outside += 1
            continue
        out_features.append(
            {"type": "Feature", "geometry": geom, "properties": np}
        )

    DST.write_text(json.dumps({"type": "FeatureCollection", "features": out_features}))
    print(f"Normalized {len(out_features)} features "
          f"(dropped {dropped} no-class/no-geom, {outside} outside California).")
    seasonal = sum(1 for f in out_features if f["properties"]["season"] == "seasonal")
    print(f"  seasonal: {seasonal}   yearlong: {len(out_features) - seasonal}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
