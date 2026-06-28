"""Registry of California national forests present in the USFS MVUM service.

The EDW MVUM MapServer is named `EDW_MVUM_01` but is national in coverage; CA
forests are selected by exact `forestname`. Angeles NF is intentionally absent —
it has no MVUM-designated motorized routes in the service.
"""

# Exact `forestname` values as they appear in the MVUM attribute table.
CA_FORESTS: list[str] = [
    "Cleveland National Forest",
    "Eldorado National Forest",
    "Humboldt-Toiyabe National Forest",  # straddles CA/NV; CA districts included
    "Inyo National Forest",
    "Klamath National Forest",
    "Lassen National Forest",
    "Los Padres National Forest",
    "Mendocino National Forest",
    "Modoc National Forest",
    "Plumas National Forest",
    "San Bernardino National Forest",
    "Sequoia National Forest",
    "Shasta-Trinity National Forest",
    "Sierra National Forest",
    "Six Rivers National Forest",
    "Stanislaus National Forest",
    "Tahoe National Forest",
]


def slug(forest_name: str) -> str:
    """`San Bernardino National Forest` -> `san-bernardino`."""
    name = forest_name.removesuffix(" National Forest")
    return name.lower().replace(" ", "-").replace("/", "-")
