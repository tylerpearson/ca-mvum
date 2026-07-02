from pipeline.fetch_mvum import data_quality_failures
from pipeline.forests import CA_FORESTS


def test_all_counts_positive_no_failures():
    counts = {forest: 10 for forest in CA_FORESTS}
    assert data_quality_failures(counts) == []


def test_one_forest_empty_is_flagged():
    counts = {forest: 10 for forest in CA_FORESTS}
    counts["Inyo National Forest"] = 0
    assert data_quality_failures(counts) == ["Inyo National Forest"]


def test_all_forests_empty_are_all_flagged():
    counts = {forest: 0 for forest in CA_FORESTS}
    assert data_quality_failures(counts) == list(CA_FORESTS)
