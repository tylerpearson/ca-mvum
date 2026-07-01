from pipeline.normalize import (
    _doy,
    _doy_to_md,
    _window_text,
    normalize_feature,
    parse_window,
)


class TestParseWindow:
    def test_none_is_none(self):
        assert parse_window(None) is None

    def test_empty_string_is_none(self):
        assert parse_window("") is None

    def test_whitespace_only_is_none(self):
        assert parse_window("  ") is None

    def test_open_literal(self):
        assert parse_window("open") == (1, 365)

    def test_yearlong_literal_case_insensitive(self):
        assert parse_window("Yearlong") == (1, 365)

    def test_year_long_with_space(self):
        assert parse_window("year long") == (1, 365)

    def test_bounded_window(self):
        assert parse_window("05/01-11/15") == (121, 319)

    def test_full_year_window(self):
        assert parse_window("01/01-12/31") == (1, 365)

    def test_unparseable_but_present_treated_as_yearlong(self):
        # Present-but-unparseable text = permitted, treated as year-round
        # (current documented policy).
        assert parse_window("see ranger") == (1, 365)


class TestDoy:
    def test_jan_1(self):
        assert _doy(1, 1) == 1

    def test_dec_31(self):
        assert _doy(12, 31) == 365

    def test_march_1_non_leap_convention(self):
        assert _doy(3, 1) == 60


class TestWindowText:
    def test_yearlong(self):
        assert _window_text(1, 365) == "Yearlong"

    def test_bounded(self):
        assert _window_text(121, 319) == "05/01-11/15"


class TestDoyToMd:
    def test_jan_1(self):
        assert _doy_to_md(1) == "01/01"

    def test_may_1(self):
        assert _doy_to_md(121) == "05/01"


class TestNormalizeFeature:
    def test_no_dates_fields_returns_none(self):
        assert normalize_feature({}) is None

    def test_single_yearlong_class(self):
        result = normalize_feature({"passengervehicle_datesopen": "open"})
        assert result is not None
        assert result["classes"] == ",passenger,"
        assert result["season"] == "yearlong"
        assert (result["open_start"], result["open_end"]) == (1, 365)

    def test_multi_class_representative_window_collapse(self):
        # Plan 005: per-class windows are now emitted so divergent classes
        # read correctly per vehicle profile, even though the route still
        # carries a representative season/open_start/open_end for display.
        result = normalize_feature(
            {
                "passengervehicle_datesopen": "open",
                "motorcycle_datesopen": "05/01-11/15",
            }
        )
        assert result is not None
        assert "passenger" in result["classes"]
        assert "motorcycle" in result["classes"]
        assert result["season"] == "seasonal"
        assert result["open_start"] == 121
        assert result["open_end"] == 319
        assert result["os_motorcycle"] == 121
        assert result["oe_motorcycle"] == 319
        assert "os_passenger" not in result
        assert "oe_passenger" not in result
        assert result["window_text"].endswith("(varies by class)")

    def test_shared_window_across_classes_no_variance_suffix(self):
        result = normalize_feature(
            {
                "passengervehicle_datesopen": "05/01-11/15",
                "motorcycle_datesopen": "05/01-11/15",
            }
        )
        assert result is not None
        assert result["os_passenger"] == 121
        assert result["oe_passenger"] == 319
        assert result["os_motorcycle"] == 121
        assert result["oe_motorcycle"] == 319
        assert result["window_text"] == "05/01-11/15"

    def test_all_yearlong_route_has_no_window_fields(self):
        result = normalize_feature(
            {
                "passengervehicle_datesopen": "open",
                "motorcycle_datesopen": "open",
            }
        )
        assert result is not None
        assert result["season"] == "yearlong"
        assert not any(k.startswith(("os_", "oe_")) for k in result)

    def test_ebike_only_route_has_no_window_fields(self):
        result = normalize_feature({"e_bike_class1": "yes"})
        assert result is not None
        assert result["classes"] == ",e_bike1,"
        assert not any(k.startswith(("os_", "oe_")) for k in result)

    def test_ebike_gate_yes(self):
        result = normalize_feature(
            {"passengervehicle_datesopen": "open", "e_bike_class1": "yes"}
        )
        assert result is not None
        assert "e_bike1" in result["classes"]

    def test_ebike_gate_no(self):
        result = normalize_feature(
            {"passengervehicle_datesopen": "open", "e_bike_class1": "no"}
        )
        assert result is not None
        assert "e_bike1" not in result["classes"]

    def test_miles_rounding(self):
        result = normalize_feature(
            {"passengervehicle_datesopen": "open", "gis_miles": 1.234}
        )
        assert result is not None
        assert result["miles"] == 1.23

    def test_miles_missing_defaults_zero(self):
        result = normalize_feature({"passengervehicle_datesopen": "open"})
        assert result is not None
        assert result["miles"] == 0.0
