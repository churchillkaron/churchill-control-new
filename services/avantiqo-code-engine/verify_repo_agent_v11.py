"""Zero-cost verification for Repo Agent V11 compact contract reasoning."""

from __future__ import annotations

import tempfile
from pathlib import Path

import repo_agent_v11 as v11


def _policy() -> v11.AgentPolicy:
    return v11.AgentPolicy(
        editable_paths=("src/finance", "src/runtime", "src/contracts", "src/producer", "src/consumer"),
        test_commands={"unit": ("python", "-c", "print('ok')")},
    )


def main() -> None:
    assert v11.MAX_CASE_MODEL_SEQUENCES == 4
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        files = {
            "src/finance/ledger.py": "from decimal import Decimal\n",
            "src/runtime/hot.py": "def intersect(a,b,eq): return []\n",
            "src/contracts/order.py": "FIELDS=('id','total_cents')\n",
            "src/producer/order.py": "def produce(x): return {'id':x,'amount_cents':1}\n",
            "src/consumer/order.py": "def consume(p): return p['total_cents']\n",
        }
        for relative, content in files.items():
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)

        finance_task = "Repair accounting aggregation so raw amounts are summed first and the final total is rounded once to cents."
        finance = v11.build_actor_prompt(root=root, task=finance_task, policy=_policy())
        assert "without per-item quantization" in finance
        assert "quantize the aggregate exactly once" in finance
        assert finance.count("FINANCIAL AGGREGATION") == 1

        perf_task = "Reduce avoidable comparison work on the hot path while preserving output order and duplicate behavior."
        perf = v11.build_actor_prompt(root=root, task=perf_task, policy=_policy())
        assert "never replace a caller comparator" in perf
        assert "bucket the right side by hash" in perf
        assert "Unhashable values fall back" in perf
        assert perf.count("COMPARATOR HOT PATH") == 1

        contract_task = "Repair producer/consumer version skew so the shared order contract is the single field authority."
        contract = v11.build_actor_prompt(root=root, task=contract_task, policy=_policy())
        assert "ordered field/schema registry" in contract
        assert "import and use that registry" in contract
        assert "do not duplicate stale field literals" in contract
        assert contract.count("SHARED FIELD AUTHORITY") == 1

        review = v11.build_review_prompt(
            root=root,
            task=contract_task,
            criteria=("producer and consumer use shared contract",),
            changed_files=("src/producer/order.py", "src/consumer/order.py"),
            public_tests={"passed": True, "runs": []},
        )
        assert "request repair only for a concrete visible" in review

        # V11 must not recreate V10's actor prompt bloat.
        assert len(perf) < 3900, len(perf)
        assert len(contract) < 3900, len(contract)

        ordinary = v11.build_actor_prompt(root=root, task="Normalize a display label.", policy=_policy())
        assert "COMPARATOR HOT PATH" not in ordinary
        assert "SHARED FIELD AUTHORITY" not in ordinary
        assert "FINANCIAL AGGREGATION" not in ordinary

    source = Path(v11.__file__).read_text()
    for forbidden in ("hot_path-", "api_version_skew-", "ledger_rounding-", "expected_patch", "hidden_profile"):
        assert forbidden not in source, forbidden

    print("AVANTIQO_CODE_REPO_AGENT_V11_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
