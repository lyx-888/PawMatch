from sources.sample import hello


def test_hello() -> None:
    assert hello() == "hello from sources.sample"
