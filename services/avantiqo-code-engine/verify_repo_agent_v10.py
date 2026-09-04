"""Zero-cost verification for Repo Agent V10 general contract guidance."""

from __future__ import annotations

import tempfile
from pathlib import Path

import repo_agent_v10 as v10


def _policy() -> v10.AgentPolicy:
    return v10.AgentPolicy(
        editable_paths=("src/runtime", "src/contracts", "src/producer", "src/consumer"),
        test_commands={"unit": ("python", "-c", "print('ok')")},
    )


def main() -> None:
    assert v10.MAX_CASE_MODEL_SEQUENCES == 4

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for relative, content in {
            "src/runtime/hot.py": "def f(a,b,eq):\n    return []\n",
            "src/contracts/order.py": "FIELDS=('id','total_cents')\n",
            "src/producer/order.py": "def produce(x): return {'id':x,'amount_cents':1}\n",
            "src/consumer/order.py": "def consume(p): return p['total_cents']\n",
        }.items():
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)

        perf_task = "Reduce avoidable comparison work on the hot path while preserving output order and duplicate behavior."
        actor = v10.build_actor_prompt(root=root, task=perf_task, policy=_policy())
        assert "caller-supplied comparator" in actor
        assert "semantic authority" in actor
        assert "fall back" in actor
        assert "output order" in actor

        contract_task = "Repair producer/consumer version skew so the shared order contract is the single field authority."
        actor2 = v10.build_actor_prompt(root=root, task=contract_task, policy=_policy())
        assert "single source of truth" in actor2
        assert "Producer output must conform" in actor2
        assert "consumers must read" in actor2

        review = v10.build_review_prompt(
            root=root,
            task=contract_task,
            criteria=("producer and consumer use shared contract",),
            changed_files=("src/producer/order.py", "src/consumer/order.py"),
            public_tests={"passed": False, "runs": []},
        )
        assert "SHARED-CONTRACT REVIEW" in review
        assert "at most four short concrete strings" in review
        assert "at most three short concrete gaps" in review

        ordinary = v10.build_actor_prompt(
            root=root,
            task="Normalize a customer display label.",
            policy=_policy(),
        )
        assert "COMPARATOR-SAFE PERFORMANCE CONTRACT" not in ordinary
        assert "SHARED CONTRACT AUTHORITY" not in ordinary

    source = Path(v10.__file__).read_text()
    forbidden = (
        "hot_path-",
        "api_version_skew-",
        "hidden_profile",
        "hidden_test",
        "expected_patch",
    )
    for token in forbidden:
        assert token not in source, token

    print("AVANTIQO_CODE_REPO_AGENT_V10_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
