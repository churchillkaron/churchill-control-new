"""Zero-cost verifier for Avantiqo Repo Agent V6."""

from __future__ import annotations

import tempfile
from pathlib import Path

from repo_agent_v6 import (
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
)


def _workspace(root: Path) -> None:
    (root / "src").mkdir(parents=True)
    (root / "src/value.py").write_text("def value():\n    return 1\n", encoding="utf-8")
    (root / ".avantiqo").mkdir(parents=True)
    (root / ".avantiqo/public_test.py").write_text(
        "from pathlib import Path\nimport sys\nROOT=Path.cwd()\nsys.path.insert(0,str(ROOT))\nfrom src.value import value\nassert value()==2\n",
        encoding="utf-8",
    )


def main() -> None:
    assert MAX_CASE_MODEL_SEQUENCES == 4
    with tempfile.TemporaryDirectory(prefix="avantiqo-repo-agent-v6-") as directory:
        root = Path(directory).resolve()
        _workspace(root)
        policy = AgentPolicy(editable_paths=("src",), test_commands={"unit": ("python", ".avantiqo/public_test.py")})

        prompt = build_actor_prompt(root=root, task="Make value return 2.", policy=policy)
        assert "full-file" in prompt
        assert "operation-intrinsic boundary semantics" in prompt
        assert "sealed/" not in prompt

        actor = parse_actor_result(
            '{"criteria":["value must return 2"],"edits":[{"path":"src/value.py","old":"return 1","new":"return 1"},{"path":"src/value.py","content":"def value():\\n    return 2\\n"}]}'
        )
        changed = apply_edits(root=root, policy=policy, edits=actor["edits"])
        assert changed == ["src/value.py"]
        assert run_public_tests(root=root, policy=policy)["passed"] is True

        review_prompt = build_review_prompt(
            root=root,
            task="Aggregate raw amounts and round only the final total.",
            criteria=("sum raw amounts", "round final total"),
            changed_files=changed,
            public_tests={"passed": True, "runs": []},
        )
        assert "identity/result type for an empty collection" in review_prompt
        assert "rounding/conversion happens at the correct stage" in review_prompt

        review = parse_review(
            '{"verdict":"pass","criteria_checked":["sum raw amounts","round final total"],"findings":[]}',
            public_tests_passed=True,
        )
        assert review["verdict"] == "pass"

        repair_prompt = build_repair_prompt(
            root=root,
            task="Make value return 2.",
            policy=policy,
            criteria=actor["criteria"],
            findings=({"clause":"value must return 2","gap":"wrong return"},),
            public_tests={"passed": False, "runs": []},
        )
        assert "full-file" in repair_prompt

        try:
            parse_actor_result('{"criteria":["x"],"edits":[{"path":"src/value.py","content":"same","old":"x","new":"y"}]}')
        except AgentContractError:
            pass
        else:
            raise AssertionError("ambiguous edit mode accepted")

    print("AVANTIQO_CODE_REPO_AGENT_V6_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
