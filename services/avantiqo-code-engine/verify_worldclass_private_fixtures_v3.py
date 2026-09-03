"""Zero-cost executable verifier for Avantiqo Code private repo fixtures V3."""

from __future__ import annotations

import tempfile
from pathlib import Path

import worldclass_private_fixtures_v3 as fixtures
import worldclass_private_suite_v2 as suite


def main() -> None:
    secret = b"avantiqo-private-fixture-verifier"
    run_seed = "20260903-zero-cost"
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        materialized = fixtures.materialize_suite(root, secret=secret, run_seed=run_seed)
        assert len(materialized) == len(tuple(suite.families())) == 12
        assert {item.dimension for item in materialized} == suite.dimensions()
        assert len({item.case_id for item in materialized}) == 12
        for item in materialized:
            assert item.workspace.is_dir()
            assert item.public_test_path.is_file()
            assert item.hidden_test_path.is_file()
            assert item.hidden_test_path.resolve().is_relative_to((root / fixtures.SEALED_DIRNAME).resolve())
            assert not item.hidden_test_path.resolve().is_relative_to(item.workspace.resolve())
            public = fixtures.run_public(item)
            assert public.returncode != 0, f"broken fixture unexpectedly passed: {item.family_id}"

        again = fixtures.materialize_suite(root, secret=secret, run_seed=run_seed)
        assert [item.case_id for item in again] == [item.case_id for item in materialized]

    print("AVANTIQO_CODE_PRIVATE_FIXTURES_V3_CASES=PASS")
    print("AVANTIQO_CODE_PRIVATE_FIXTURES_V3_SEALED_HIDDEN_TESTS=PASS")
    print("AVANTIQO_CODE_PRIVATE_FIXTURES_V3_BROKEN_BASELINES=PASS")
    print("AVANTIQO_CODE_PRIVATE_FIXTURES_V3_REPRODUCIBLE=PASS")
    print("AVANTIQO_CODE_PRIVATE_FIXTURES_V3=PASS")


if __name__ == "__main__":
    main()
