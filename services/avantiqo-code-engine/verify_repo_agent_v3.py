"""Zero-cost executable proof for Avantiqo Code repository agent V3."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

import repo_agent_v3 as agent


def scripted(actions: list[dict]):
    queue = [json.dumps(item, separators=(",", ":")) for item in actions]
    def call(_prompt: str) -> str:
        if not queue:
            raise AssertionError("scripted model exhausted")
        return queue.pop(0)
    return call


def main() -> None:
    secret_name = "AVANTIQO_AGENT_TEST_SECRET_SHOULD_NOT_LEAK"
    os.environ[secret_name] = "forbidden-value"
    with tempfile.TemporaryDirectory(prefix="avantiqo-code-agent-v3-") as tmp:
        root = Path(tmp)
        (root / "src").mkdir()
        (root / "src" / "value.py").write_text("VALUE = 1\n", encoding="utf-8")
        (root / "check.py").write_text(
            "import os\nfrom src.value import VALUE\nassert VALUE == 2\nassert os.getenv('AVANTIQO_AGENT_TEST_SECRET_SHOULD_NOT_LEAK') is None\n",
            encoding="utf-8",
        )
        policy = agent.AgentPolicy(
            editable_paths=("src",),
            test_commands={"unit": (sys.executable, "check.py")},
            max_steps=16,
            max_model_calls=16,
            max_repairs=2,
        )

        result = agent.run_repo_agent(
            workspace=root,
            task="Change VALUE to 2 and prove it with unit.",
            policy=policy,
            model_call=scripted([
                {"action":"read","path":"src/value.py"},
                {"action":"plan","summary":"Change only value.py, then run unit."},
                {"action":"write","path":"src/value.py","content":"VALUE = 2\n"},
                {"action":"test","command_id":"unit"},
                {"action":"read","path":"src/value.py"},
                {"action":"finish","summary":"Verified."},
            ]),
        )
        assert result["status"] == "completed", result
        assert result["repairs"] == 0, result
        assert result["sanitized_test_environment"] is True, result
        assert result["fresh_final_test_required"] is True, result
        assert result["changed_files"] == ["src/value.py"], result

        (root / "src" / "value.py").write_text("VALUE = 1\n", encoding="utf-8")
        repaired = agent.run_repo_agent(
            workspace=root,
            task="Change VALUE to 2; use test evidence to repair if needed.",
            policy=policy,
            model_call=scripted([
                {"action":"read","path":"src/value.py"},
                {"action":"plan","summary":"Edit and test."},
                {"action":"write","path":"src/value.py","content":"VALUE = 3\n"},
                {"action":"test","command_id":"unit"},
                {"action":"read","path":"check.py"},
                {"action":"write","path":"src/value.py","content":"VALUE = 2\n"},
                {"action":"test","command_id":"unit"},
                {"action":"finish","summary":"Repaired from machine failure."},
            ]),
        )
        assert repaired["repairs"] == 1, repaired
        assert {"inspect_failure","bounded_repair"}.issubset(set(repaired["agent_phases"])), repaired

        try:
            agent.run_repo_agent(
                workspace=root,
                task="Edit without planning.",
                policy=policy,
                model_call=scripted([{"action":"write","path":"src/value.py","content":"VALUE = 2\n"}]),
            )
        except agent.AgentContractError as exc:
            assert "PLAN_REQUIRED_BEFORE_EDIT" in str(exc)
        else:
            raise AssertionError("edit without plan was accepted")

        outside = root.parent / "avantiqo-agent-outside.txt"
        outside.write_text("secret", encoding="utf-8")
        link = root / "src" / "escape.txt"
        link.symlink_to(outside)
        try:
            agent.run_repo_agent(
                workspace=root,
                task="Follow a symlink.",
                policy=policy,
                model_call=scripted([{"action":"read","path":"src/escape.txt"}]),
            )
        except agent.AgentContractError as exc:
            assert "PATH_ESCAPE_FORBIDDEN" in str(exc)
        else:
            raise AssertionError("symlink escape was accepted")
        outside.unlink(missing_ok=True)

    print("AVANTIQO_CODE_REPO_AGENT_V3_EXECUTION_LOOP=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V3_REPAIR_ACCOUNTING=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V3_PLAN_BEFORE_EDIT=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V3_SECRET_ENV_SANITIZED=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V3_SYMLINK_ESCAPE=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V3_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
