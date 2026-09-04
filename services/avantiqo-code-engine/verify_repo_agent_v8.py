from __future__ import annotations

import tempfile
from pathlib import Path

import repo_agent_v8 as v8


def main() -> None:
    assert v8.MAX_CASE_MODEL_SEQUENCES == 4

    ordinary = "Repair authorization precedence so deny rules cannot be bypassed."
    finance = "Repair ledger aggregation and rounding without violating accounting invariants."
    performance = "Remove avoidable work from a hot path without changing externally visible behavior."
    assert v8.needs_financial_guidance(ordinary) is False
    assert v8.needs_performance_guidance(ordinary) is False
    assert v8.needs_financial_guidance(finance) is True
    assert v8.needs_performance_guidance(finance) is False
    assert v8.needs_performance_guidance(performance) is True

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "src").mkdir()
        target = root / "src" / "calc.py"
        target.write_text("def total(xs):\n    return sum(xs)\n", encoding="utf-8")
        other = root / "src" / "other.py"
        other.write_text("VALUE = 1\n", encoding="utf-8")
        policy = v8.AgentPolicy(editable_paths=("src",), test_commands={})

        ordinary_prompt = v8.build_actor_prompt(root=root, task=ordinary, policy=policy)
        assert "NUMERIC/FINANCIAL CONTRACT" not in ordinary_prompt
        assert "PERFORMANCE CONTRACT" not in ordinary_prompt

        finance_prompt = v8.build_actor_prompt(root=root, task=finance, policy=policy)
        assert "NUMERIC/FINANCIAL CONTRACT" in finance_prompt
        assert "correctly typed zero/identity" in finance_prompt
        assert "round only at the stated result boundary" in finance_prompt

        performance_prompt = v8.build_actor_prompt(root=root, task=performance, policy=policy)
        assert "PERFORMANCE CONTRACT" in performance_prompt
        assert "invariant across repeated processing" in performance_prompt

        recovery = v8.build_edit_recovery_prompt(
            root=root,
            task=performance,
            policy=policy,
            criteria=("Preserve visible results",),
            error="AgentContractError:NO_CHANGED_FILES",
            previous_output='{"criteria":["x"],"edits":[{"path":"src/calc.py","old":"x","new":"x"}]}',
        )
        assert "NO_CHANGED_FILES" in recovery
        assert "PREVIOUS MODEL OUTPUT" in recovery
        assert "src/calc.py" in recovery
        assert "including extensions" in recovery
        assert "Produce at least one effective edit" in recovery
        assert "hidden assertions" not in recovery.lower()

        before_calc = target.read_text(encoding="utf-8")
        before_other = other.read_text(encoding="utf-8")
        try:
            v8.apply_edits(
                root=root,
                policy=policy,
                edits=(
                    {
                        "path": "src/calc.py",
                        "old": "return sum(xs)",
                        "new": "return sum(xs, 0)",
                    },
                    {
                        "path": "src/other.py",
                        "old": "MISSING",
                        "new": "VALUE = 2",
                    },
                ),
            )
            raise AssertionError("invalid second edit should fail")
        except v8.AgentContractError as exc:
            assert "EDIT_OLD_MATCH_COUNT:src/other.py:0" in str(exc)
        assert target.read_text(encoding="utf-8") == before_calc
        assert other.read_text(encoding="utf-8") == before_other

        changed = v8.apply_edits(
            root=root,
            policy=policy,
            edits=(
                {
                    "path": "src/calc.py",
                    "old": "return sum(xs)",
                    "new": "value = sum(xs)",
                },
                {
                    "path": "src/calc.py",
                    "old": "value = sum(xs)",
                    "new": "return sum(xs, 0)",
                },
            ),
        )
        assert changed == ["src/calc.py"]
        assert "return sum(xs, 0)" in target.read_text(encoding="utf-8")

    source = Path(v8.__file__).read_text(encoding="utf-8")
    for forbidden in ("ledger_rounding-", "hot_path-", "api_version_skew-", "hidden_profile"):
        assert forbidden not in source
    print("AVANTIQO_CODE_REPO_AGENT_V8_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
