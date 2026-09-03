"""Zero-cost executable proof for the Avantiqo Code repository agent core."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import repo_agent_v2 as agent


def _scripted_model(actions: list[dict]):
    queue = [json.dumps(item, separators=(",", ":")) for item in actions]

    def call(_prompt: str) -> str:
        if not queue:
            raise AssertionError("scripted model exhausted")
        return queue.pop(0)

    return call


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="avantiqo-code-agent-v2-") as tmp:
        root = Path(tmp)
        target = root / "src" / "value.py"
        target.parent.mkdir(parents=True)
        target.write_text("VALUE = 1\n", encoding="utf-8")
        test_file = root / "check.py"
        test_file.write_text(
            "from src.value import VALUE\nassert VALUE == 2\n",
            encoding="utf-8",
        )

        policy = agent.AgentPolicy(
            editable_paths=("src",),
            test_commands={"unit": (sys.executable, "check.py")},
            max_steps=12,
            max_model_calls=12,
            max_repairs=2,
        )
        result = agent.run_repo_agent(
            workspace=root,
            task="Change VALUE to 2 and prove it with the declared unit test.",
            policy=policy,
            model_call=_scripted_model(
                [
                    {"action": "read", "path": "src/value.py"},
                    {"action": "plan", "summary": "Change only src/value.py, then run unit."},
                    {"action": "write", "path": "src/value.py", "content": "VALUE = 2\n"},
                    {"action": "test", "command_id": "unit"},
                    {"action": "finish", "summary": "VALUE is 2 and unit passes."},
                ]
            ),
        )
        assert result["status"] == "completed", result
        assert result["changed_files"] == ["src/value.py"], result
        assert result["tests_run"] == 1 and result["tests_passed"] == 1, result
        assert result["repairs"] == 0, result
        assert result["network_tool_exposed"] is False, result
        assert result["arbitrary_shell_exposed"] is False, result
        assert {"inspect", "plan", "edit", "execute_tests", "final_verify"}.issubset(
            set(result["agent_phases"])
        ), result

        try:
            agent.run_repo_agent(
                workspace=root,
                task="Escape the workspace.",
                policy=policy,
                model_call=_scripted_model([{"action": "read", "path": "../secret"}]),
            )
        except agent.AgentContractError as exc:
            assert "PATH_ESCAPE_FORBIDDEN" in str(exc)
        else:
            raise AssertionError("path escape was not rejected")

        try:
            agent.run_repo_agent(
                workspace=root,
                task="Run an undeclared command.",
                policy=policy,
                model_call=_scripted_model([{"action": "test", "command_id": "shell"}]),
            )
        except agent.AgentContractError as exc:
            assert "TEST_COMMAND_FORBIDDEN" in str(exc)
        else:
            raise AssertionError("undeclared command was not rejected")

        try:
            agent.run_repo_agent(
                workspace=root,
                task="Write outside the declared edit scope.",
                policy=policy,
                model_call=_scripted_model(
                    [{"action": "write", "path": "check.py", "content": "raise SystemExit(0)\n"}]
                ),
            )
        except agent.AgentContractError as exc:
            assert "WRITE_SCOPE_FORBIDDEN" in str(exc)
        else:
            raise AssertionError("write scope escape was not rejected")

    print("AVANTIQO_CODE_REPO_AGENT_V2_EXECUTION_LOOP=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V2_PATH_SANDBOX=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V2_COMMAND_ALLOWLIST=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V2_EDIT_SCOPE=PASS")
    print("AVANTIQO_CODE_REPO_AGENT_V2_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
