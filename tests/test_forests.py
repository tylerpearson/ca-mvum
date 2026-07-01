from pipeline.forests import slug


def test_slug_simple():
    assert slug("San Bernardino National Forest") == "san-bernardino"


def test_slug_hyphenated():
    assert slug("Humboldt-Toiyabe National Forest") == "humboldt-toiyabe"
