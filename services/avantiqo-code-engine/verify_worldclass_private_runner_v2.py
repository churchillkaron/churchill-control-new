"""Zero-cost adversarial verification of the sealed private benchmark runner."""

from __future__ import annotations

import json
import sys

from worldclass_private_runner_v2 import (
    PrivateCaseSpec,
    PrivateRunnerError,
    assert_no_hidden_leak,
    model_safe_case_manifest,
    run_private_case,
)


def _scripted_model(actions: list[dict[str, object]]):
    queue = [json.dumps(action) for action in actions]
    prompts: list[str] = []

    def call(prompt: str) -> str:
        prompts.append(prompt)
        if not queue:
            raise AssertionError("model called too many times")
        return queue.pop(0)

    return call, prompts


def _spec(hidden_expected: str = "2") -> PrivateCaseSpec:
    public_test = (
        "from pathlib import Path\n"
        "value=Path('src/value.txt').read_text().strip()\n"
        "raise SystemExit(0 if value.isdigit() else 1)\n"
    )
    hidden_test = (
        "import os\n"
        "from pathlib import Path\n"
        "root=Path(os.environ['AVANTIQO_CODE_PUBLIC_WORKSPACE'])\n"
        f"raise SystemExit(0 if (root/'src/value.txt').read_text().strip() == {hidden_expected!r} else 1)\n"
    )
    return PrivateCaseSpec(
        case_id="sealed-toy-001",
        dimension="malformed_input_resilience",
        public_goal="Set src/value.txt to the correct numeric result and verify it.",
        public_files={"src/value.txt": "1\n", "tests/public_test.py": public_test},
        editable_paths=("src",),
        public_test_commands={"unit": (sys.executable, "tests/public_test.py")},
        hidden_files={"hidden_test.py": hidden_test},
        hidden_command=(sys.executable, "hidden_test.py"),
    )


def main() -> None:
    spec = _spec()
    assert_no_hidden_leak(spec)
    manifest = model_safe_case_manifest(spec)
    encoded = json.dumps(manifest, sort_keys=True)
    assert "hidden_test.py" not in encoded
    assert "AVANTIQO_CODE_PUBLIC_WORKSPACE" not in encoded

    model, prompts = _scripted_model(
        [
            {"action": "read", "path": "src/value.txt"},
            {"action": "plan", "summary": "Update the value and run the public unit test."},
            {"action": "write", "path": "src/value.txt", "content": "2\n"},
            {"action": "test", "command_id": "unit"},
            {"action": "finish", "summary": "Updated and verified."},
        ]
    )
    result = run_private_case(spec=spec, model_call=model)
    assert result["hidden_tests_passed"] is True, result
    assert result["changed_file_scope_passed"] is True, result
    assert result["hidden_material_model_visible"] is False, result
    assert result["hidden_material_copied_into_workspace"] is False, result
    assert result["deterministic_source_rewrite_used"] is False, result
    prompt_blob = "\n".join(prompts)
    assert "hidden_test.py" not in prompt_blob
    assert "AVANTIQO_CODE_PUBLIC_WORKSPACE" not in prompt_blob
    assert "== '2'" not in prompt_blob

    wrong_model, _ = _scripted_model(
        [
            {"action": "read", "path": "src/value.txt"},
            {"action": "plan", "summary": "Write a numeric value and run public tests."},
            {"action": "write", "path": "src/value.txt", "content": "3\n"},
            {"action": "test", "command_id": "unit"},
            {"action": "finish", "summary": "Public test passed."},
        ]
    )
    wrong = run_private_case(spec=spec, model_call=wrong_model)
    assert wrong["hidden_tests_passed"] is False, wrong
    assert wrong["raw_agent_passed"] is True, wrong

    collision = PrivateCaseSpec(
        **{**spec.__dict__, "hidden_files": {"src/value.txt": "secret"}}
    )
    try:
        assert_no_hidden_leak(collision)
    except PrivateRunnerError:
        pass
    else:
        raise AssertionError("public/hidden collision must be rejected")

    print("AVANTIQO_CODE_PRIVATE_RUNNER_PUBLIC_AGENT=PASS")
    print("AVANTIQO_CODE_PRIVATE_RUNNER_HIDDEN_SEALED=PASS")
    print("AVANTIQO_CODE_PRIVATE_RUNNER_FALSE_PUBLIC_GREEN_CAUGHT=PASS")
    print("AVANTIQO_CODE_PRIVATE_RUNNER_SCOPE_GATE=PASS")
    print("AVANTIQO_CODE_PRIVATE_RUNNER_V2=PASS")


if __name__ == "__main__":
    main()
