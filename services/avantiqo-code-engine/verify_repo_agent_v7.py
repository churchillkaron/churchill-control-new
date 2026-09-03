from __future__ import annotations

import tempfile
from pathlib import Path

import repo_agent_v7 as v7


def main() -> None:
    assert v7.MAX_CASE_MODEL_SEQUENCES == 4
    guidance = v7._financial_boundary_guidance().lower()
    assert "binary-float" in guidance
    assert "empty reductions" in guidance
    assert "final-boundary rounding" in guidance

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "src").mkdir()
        (root / "src" / "calc.py").write_text("def total(xs):\n    return sum(xs)\n", encoding="utf-8")
        policy = v7.AgentPolicy(editable_paths=("src/calc.py",), test_commands={})
        prompt = v7.build_edit_recovery_prompt(
            root=root,
            task="Reduce repeated work while preserving results.",
            policy=policy,
            criteria=("Preserve results",),
            error="AgentContractError:NO_CHANGED_FILES",
        )
        assert "NO_CHANGED_FILES" in prompt
        assert "hidden test" in prompt.lower()  # prohibition only; no hidden material is present
        assert "src/calc.py" in prompt
        assert "Do not emit a no-op" in prompt

    print("AVANTIQO_CODE_REPO_AGENT_V7_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
