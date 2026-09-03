"""Zero-cost verifier for the batched Avantiqo Repo Agent V5 contract."""

from __future__ import annotations

import tempfile
from pathlib import Path

from repo_agent_v5 import (
    AgentContractError,
    AgentPolicy,
    MAX_CASE_MODEL_SEQUENCES,
    apply_edits,
    build_actor_prompt,
    build_repair_prompt,
    build_review_prompt,
    parse_actor_result,
    parse_review,
    run_public_tests,
    snapshot_workspace,
)


def _workspace(root: Path) -> None:
    (root / "src").mkdir(parents=True)
    (root / "src/value.py").write_text("def value():\n    return 1\n", encoding="utf-8")
    (root / ".avantiqo").mkdir(parents=True)
    (root / ".avantiqo/public_test.py").write_text(
        "from src.value import value\nassert value() == 2\n", encoding="utf-8"
    )


def main() -> None:
    if MAX_CASE_MODEL_SEQUENCES != 4:
        raise AssertionError("V5 model sequence ceiling changed")

    with tempfile.TemporaryDirectory(prefix="avantiqo-repo-agent-v5-") as directory:
        root = Path(directory).resolve()
        _workspace(root)
        policy = AgentPolicy(
            editable_paths=("src",),
            test_commands={
                "unit": ("python", ".avantiqo/public_test.py"),
                "duplicate": ("python", ".avantiqo/public_test.py"),
            },
        )

        snapshot = snapshot_workspace(root)
        assert {item["path"] for item in snapshot} == {".avantiqo/public_test.py", "src/value.py"}

        prompt = build_actor_prompt(root=root, task="Make value return 2.", policy=policy)
        assert "MODEL-VISIBLE WORKSPACE" in prompt
        assert "sealed/" not in prompt and "../sealed" not in prompt
        actor = parse_actor_result(
            '{"criteria":["value must return 2"],"edits":[{"path":"src/value.py","old":"return 1","new":"return 2"}]}'
        )
        changed = apply_edits(root=root, policy=policy, edits=actor["edits"])
        assert changed == ["src/value.py"]

        tests = run_public_tests(root=root, policy=policy)
        assert tests["passed"] is True
        assert len(tests["runs"]) == 1, "duplicate public commands must execute once"

        review_prompt = build_review_prompt(
            root=root,
            task="Make value return 2.",
            criteria=actor["criteria"],
            changed_files=changed,
            public_tests=tests,
        )
        assert "CURRENT CHANGED SOURCES" in review_prompt
        review = parse_review(
            '{"verdict":"pass","criteria_checked":["value must return 2"],"findings":[]}',
            public_tests_passed=True,
        )
        assert review["verdict"] == "pass"

        repair_prompt = build_repair_prompt(
            root=root,
            task="Make value return 2.",
            policy=policy,
            criteria=actor["criteria"],
            findings=({"clause": "value must return 2", "gap": "example gap"},),
            public_tests=tests,
        )
        assert "ONE BOUNDED REPAIR" in repair_prompt

        try:
            apply_edits(
                root=root,
                policy=policy,
                edits=({"path": "../escape.py", "old": "x", "new": "y"},),
            )
        except AgentContractError:
            pass
        else:
            raise AssertionError("path escape was accepted")

        try:
            parse_review(
                '{"verdict":"pass","criteria_checked":["x"],"findings":[]}',
                public_tests_passed=False,
            )
        except AgentContractError:
            pass
        else:
            raise AssertionError("reviewer passed failed public tests")

    print("AVANTIQO_CODE_REPO_AGENT_V5_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
