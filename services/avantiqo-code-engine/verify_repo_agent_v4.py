"""Zero-cost contract verification for Avantiqo Repo Agent V4."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from repo_agent_v4 import AgentContractError, AgentPolicy, run_repo_agent

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V4_ZERO_COST_VERIFY"


def _workspace(root: Path) -> None:
    (root / "src").mkdir(parents=True)
    (root / ".avantiqo").mkdir(parents=True)
    (root / "src/value.py").write_text("def normalize(value):\n    return value\n", encoding="utf-8")
    (root / ".avantiqo/public_test.py").write_text(
        "from src.value import normalize\nassert normalize(5) == 5\n",
        encoding="utf-8",
    )


class Actor:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, prompt: str) -> str:
        self.calls += 1
        if "V4 CONTRACT DISCIPLINE" not in prompt:
            raise AssertionError("actor did not receive V4 contract discipline")
        sequence = {
            1: {"action": "read", "path": "src/value.py"},
            2: {
                "action": "plan",
                "summary": "Acceptance criteria: preserve positives; clamp negative values to zero.",
            },
            3: {
                "action": "write",
                "path": "src/value.py",
                "content": "def normalize(value):\n    return value\n",
            },
            4: {"action": "test", "command_id": "public"},
            5: {"action": "finish", "summary": "public contract passes"},
            6: {"action": "read", "path": "src/value.py"},
            7: {
                "action": "plan",
                "summary": "Acceptance criteria: preserve positives; clamp negative values to zero; repair reviewer gap.",
            },
            8: {
                "action": "write",
                "path": "src/value.py",
                "content": "def normalize(value):\n    return max(0, value)\n",
            },
            9: {"action": "test", "command_id": "public"},
            10: {"action": "finish", "summary": "task contract and public contract pass"},
        }
        try:
            return json.dumps(sequence[self.calls], separators=(",", ":"))
        except KeyError as exc:
            raise AssertionError(f"unexpected actor call {self.calls}") from exc


class Reviewer:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, prompt: str) -> str:
        self.calls += 1
        if "hidden test" in prompt.lower() and "do not request or infer hidden tests" not in prompt.lower():
            raise AssertionError("hidden material leaked to reviewer")
        if self.calls == 1:
            return json.dumps(
                {
                    "verdict": "repair",
                    "criteria_checked": [
                        "positive values remain unchanged",
                        "negative values clamp to zero",
                    ],
                    "findings": [
                        "The implementation returns negative values unchanged, so the stated clamp requirement is not guaranteed."
                    ],
                },
                separators=(",", ":"),
            )
        if self.calls == 2:
            return json.dumps(
                {
                    "verdict": "pass",
                    "criteria_checked": [
                        "positive values remain unchanged",
                        "negative values clamp to zero",
                    ],
                    "findings": [],
                },
                separators=(",", ":"),
            )
        raise AssertionError(f"unexpected reviewer call {self.calls}")


def _policy() -> AgentPolicy:
    return AgentPolicy(
        editable_paths=("src/value.py",),
        test_commands={"public": (sys.executable, ".avantiqo/public_test.py")},
        max_steps=12,
        max_model_calls=8,
        max_repairs=1,
    )


def verify_reviewer_drives_repair() -> None:
    with tempfile.TemporaryDirectory(prefix="avantiqo-v4-verify-") as directory:
        root = Path(directory)
        _workspace(root)
        result = run_repo_agent(
            workspace=root,
            task="Preserve positive values and clamp negative values to zero.",
            policy=_policy(),
            model_call=Actor(),
            reviewer_call=Reviewer(),
            max_semantic_repairs=1,
        )
        assert result["contract"] == "AVANTIQO_CODE_REPO_AGENT_V4"
        assert result["status"] == "completed"
        assert result["semantic_review_passed"] is True
        assert result["semantic_reviews"] == 2
        assert result["semantic_repairs"] == 1
        assert "semantic_review" in result["agent_phases"]
        assert "bounded_repair" in result["agent_phases"]
        assert "max(0, value)" in (root / "src/value.py").read_text(encoding="utf-8")


def verify_public_pass_is_not_final() -> None:
    class OneRoundActor:
        def __init__(self) -> None:
            self.calls = 0

        def __call__(self, _prompt: str) -> str:
            self.calls += 1
            actions = [
                {"action": "read", "path": "src/value.py"},
                {"action": "plan", "summary": "enumerate full task criteria"},
                {
                    "action": "write",
                    "path": "src/value.py",
                    "content": "def normalize(value):\n    return value\n",
                },
                {"action": "test", "command_id": "public"},
                {"action": "finish", "summary": "public test passes"},
            ]
            return json.dumps(actions[self.calls - 1], separators=(",", ":"))

    def reviewer(_prompt: str) -> str:
        return json.dumps(
            {
                "verdict": "repair",
                "criteria_checked": ["negative values clamp to zero"],
                "findings": ["Negative values are still returned unchanged."],
            },
            separators=(",", ":"),
        )

    with tempfile.TemporaryDirectory(prefix="avantiqo-v4-stop-") as directory:
        root = Path(directory)
        _workspace(root)
        try:
            run_repo_agent(
                workspace=root,
                task="Preserve positive values and clamp negative values to zero.",
                policy=_policy(),
                model_call=OneRoundActor(),
                reviewer_call=reviewer,
                max_semantic_repairs=0,
            )
        except AgentContractError as exc:
            assert "SEMANTIC_REVIEW_REPAIR_REQUIRED" in str(exc)
        else:
            raise AssertionError("V4 accepted a public-test pass without semantic review approval")


def main() -> None:
    verify_reviewer_drives_repair()
    verify_public_pass_is_not_final()
    print(f"{CONTRACT}_REVIEW_REPAIR=PASS")
    print(f"{CONTRACT}_PUBLIC_PASS_NOT_FINAL=PASS")
    print(f"{CONTRACT}=PASS")


if __name__ == "__main__":
    main()
