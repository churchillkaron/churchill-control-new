"""Zero-cost proof that the private Code V2 suite is reproducible but not static."""

from __future__ import annotations

import json

import worldclass_private_suite_v2 as suite
import worldclass_cert_v2_contract as contract


def main() -> None:
    secret = b"zero-cost-fixture-secret-not-production"
    run_a = suite.public_manifest(secret, "run-a")
    run_a_again = suite.public_manifest(secret, "run-a")
    run_b = suite.public_manifest(secret, "run-b")
    sealed = suite.sealed_manifest(secret, "run-a")

    assert run_a == run_a_again
    assert run_a != run_b
    assert len(run_a) == 12
    assert {item["dimension"] for item in run_a} == contract.REQUIRED_DIMENSIONS
    assert [item["case_id"] for item in run_a] == [item["case_id"] for item in sealed]

    public_text = json.dumps(run_a, sort_keys=True)
    for item in sealed:
        assert item["hidden_profile"] not in public_text
        assert item["seal"] not in public_text

    integrity = suite.assert_suite_integrity(secret, "run-a")
    assert integrity["valid"] is True
    assert integrity["hidden_profiles_model_visible"] is False

    print("AVANTIQO_CODE_PRIVATE_SUITE_12_DIMENSIONS=PASS")
    print("AVANTIQO_CODE_PRIVATE_SUITE_SEALED_HIDDEN=PASS")
    print("AVANTIQO_CODE_PRIVATE_SUITE_SEEDED_VARIANTS=PASS")
    print("AVANTIQO_CODE_PRIVATE_SUITE_REPRODUCIBLE=PASS")
    print("AVANTIQO_CODE_PRIVATE_SUITE_V2=PASS")


if __name__ == "__main__":
    main()
