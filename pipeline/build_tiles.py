"""Build PMTiles vector tiles from the normalized statewide GeoJSON.

Requires `tippecanoe` on PATH (`brew install tippecanoe`). Produces a single
`routes.pmtiles` served statically over HTTP range requests by the web app.

Run:  uv run python -m pipeline.build_tiles
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "ca-normalized.geojson"
DST = ROOT / "web" / "public" / "tiles" / "routes.pmtiles"


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
        "--maximum-zoom=14",
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
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
