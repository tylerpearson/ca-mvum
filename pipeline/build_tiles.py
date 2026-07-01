"""Build PMTiles vector tiles from the normalized statewide GeoJSON.

Requires `tippecanoe` on PATH (`brew install tippecanoe`). Produces a single
`routes.pmtiles` served statically over HTTP range requests by the web app.

Run:  uv run python -m pipeline.build_tiles
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "ca-normalized.geojson"
DST = ROOT / "web" / "public" / "tiles" / "routes.pmtiles"
CONFIG_TS = ROOT / "web" / "src" / "config.ts"
INDEX_HTML = ROOT / "web" / "index.html"


def stamp_vintage(vintage: str, config_path: Path = CONFIG_TS,
                  html_path: Path = INDEX_HTML) -> None:
    """Rewrite the DATA_VINTAGE constant and its index.html mirror.

    Anchored, minimal regex replacements; raises RuntimeError if either
    pattern is not found exactly once (so a refactor of either file fails the
    build loudly instead of silently un-syncing the vintage).
    """
    config_text = config_path.read_text()
    config_pattern = r'export const DATA_VINTAGE = "[^"]*";'
    config_replacement = f'export const DATA_VINTAGE = "{vintage}";'
    new_config_text, count = re.subn(config_pattern, config_replacement, config_text)
    if count != 1:
        raise RuntimeError(
            f"Expected exactly 1 match for {config_pattern!r} in {config_path}, found {count}"
        )
    config_path.write_text(new_config_text)

    html_text = html_path.read_text()
    html_pattern = r"current as of <strong>[^<]*</strong>"
    html_replacement = f"current as of <strong>{vintage}</strong>"
    new_html_text, count = re.subn(html_pattern, html_replacement, html_text)
    if count != 1:
        raise RuntimeError(
            f"Expected exactly 1 match for {html_pattern!r} in {html_path}, found {count}"
        )
    html_path.write_text(new_html_text)


def main() -> int:
    if shutil.which("tippecanoe") is None:
        print("tippecanoe not found on PATH. Install it with:\n"
              "  brew install tippecanoe", file=sys.stderr)
        return 1
    if not SRC.exists():
        print(f"Missing {SRC}. Run `make fetch && make normalize` first.", file=sys.stderr)
        return 1

    DST.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "tippecanoe",
        "-o", str(DST),
        "--force",
        "--layer=routes",
        "--minimum-zoom=4",
        # maxzoom 13 (not 14) keeps the single .pmtiles under Cloudflare Pages'
        # 25 MiB per-file limit (~16 MiB vs ~28). The maxzoom level holds the
        # full-resolution geometry and dominates file size; at z13 MapLibre
        # overzooms for z14+ and the route LINES stay crisp (verified), so the
        # only cost is sub-meter geometry precision past z13 — invisible here.
        "--maximum-zoom=13",
        # Keep EVERY route at every zoom (no dropping) so the statewide overview
        # actually shows the network. Allow oversized low-zoom tiles and simplify
        # hard when zoomed out to keep them manageable.
        "--no-tile-size-limit",
        "--no-feature-limit",
        "--simplification=6",
        "--no-tiny-polygon-reduction",
        "--attribution=USFS MVUM (EDW)",
        str(SRC),
    ]
    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd)
    if result.returncode == 0:
        size_mb = DST.stat().st_size / 1e6
        print(f"\nWrote {DST.relative_to(ROOT)} ({size_mb:.1f} MB).")
        vintage = datetime.now().strftime("%B %Y")
        stamp_vintage(vintage)
        print(f"Stamped DATA_VINTAGE = {vintage!r} in {CONFIG_TS.relative_to(ROOT)} "
              f"and {INDEX_HTML.relative_to(ROOT)}.")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
