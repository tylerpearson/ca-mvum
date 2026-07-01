import shutil
from pathlib import Path

import pytest

from pipeline.build_tiles import CONFIG_TS, INDEX_HTML, stamp_vintage

FAKE_CONFIG_TS = '''export const ROUTE_TYPES = {
  a: 1,
};

/** MVUM tile build date — the point-in-time vintage of the route data baked
 *  into routes.pmtiles. Unlike the live fire/smoke/AQI/snow overlays, routes are
 *  only as fresh as the last pipeline run, so surface this to users. Updated
 *  automatically by pipeline/build_tiles.py on each `make tiles`. Mirrored in
 *  index.html (#data-vintage). */
export const DATA_VINTAGE = "June 2026";

export const OTHER = 1;
'''

FAKE_INDEX_HTML = '''<html>
  <body>
      <!-- Stamped by pipeline/build_tiles.py (mirrors DATA_VINTAGE in src/config.ts). -->
      <p id="data-vintage" class="data-vintage">MVUM route data current as of <strong>June 2026</strong>.</p>
  </body>
</html>
'''


def make_files(tmp_path: Path) -> tuple[Path, Path]:
    config_path = tmp_path / "config.ts"
    html_path = tmp_path / "index.html"
    config_path.write_text(FAKE_CONFIG_TS)
    html_path.write_text(FAKE_INDEX_HTML)
    return config_path, html_path


def test_happy_path_stamps_both_files(tmp_path):
    config_path, html_path = make_files(tmp_path)

    stamp_vintage("July 2026", config_path=config_path, html_path=html_path)

    config_text = config_path.read_text()
    html_text = html_path.read_text()

    assert 'export const DATA_VINTAGE = "July 2026";' in config_text
    assert "current as of <strong>July 2026</strong>" in html_text

    # Other lines untouched.
    assert "export const ROUTE_TYPES = {" in config_text
    assert "export const OTHER = 1;" in config_text
    assert '<html>' in html_text
    assert 'id="data-vintage"' in html_text


def test_idempotent_stamping_twice_leaves_one_correct_value(tmp_path):
    config_path, html_path = make_files(tmp_path)

    stamp_vintage("July 2026", config_path=config_path, html_path=html_path)
    stamp_vintage("August 2026", config_path=config_path, html_path=html_path)

    config_text = config_path.read_text()
    html_text = html_path.read_text()

    assert config_text.count("export const DATA_VINTAGE") == 1
    assert 'export const DATA_VINTAGE = "August 2026";' in config_text
    assert "July 2026" not in config_text

    assert html_text.count('id="data-vintage"') == 1
    assert "current as of <strong>August 2026</strong>" in html_text
    assert "July 2026" not in html_text


def test_missing_pattern_in_config_ts_raises(tmp_path):
    config_path = tmp_path / "config.ts"
    html_path = tmp_path / "index.html"
    config_path.write_text("export const SOMETHING_ELSE = 1;\n")
    html_path.write_text(FAKE_INDEX_HTML)

    with pytest.raises(RuntimeError) as exc_info:
        stamp_vintage("July 2026", config_path=config_path, html_path=html_path)

    assert str(config_path) in str(exc_info.value)


def test_pattern_appearing_twice_in_index_html_raises(tmp_path):
    config_path, html_path = make_files(tmp_path)
    html_path.write_text(FAKE_INDEX_HTML + FAKE_INDEX_HTML)

    with pytest.raises(RuntimeError) as exc_info:
        stamp_vintage("July 2026", config_path=config_path, html_path=html_path)

    assert str(html_path) in str(exc_info.value)


def test_real_files_smoke(tmp_path):
    config_copy = tmp_path / "config.ts"
    html_copy = tmp_path / "index.html"
    shutil.copyfile(CONFIG_TS, config_copy)
    shutil.copyfile(INDEX_HTML, html_copy)

    # Should not raise: each pattern must appear exactly once in the real files.
    stamp_vintage("July 2026", config_path=config_copy, html_path=html_copy)

    assert 'export const DATA_VINTAGE = "July 2026";' in config_copy.read_text()
    assert "current as of <strong>July 2026</strong>" in html_copy.read_text()
