from __future__ import annotations

import tempfile
from pathlib import Path

import repo_agent_v9 as v9


def main() -> None:
    assert v9.MAX_CASE_MODEL_SEQUENCES == 4

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "src" / "consumer").mkdir(parents=True)
        target = root / "src" / "consumer" / "order.py"
        target.write_text("VALUE = 1\n", encoding="utf-8")
        policy = v9.AgentPolicy(editable_paths=("src/consumer",), test_commands={})

        # Unique missing extension is canonicalized conservatively.
        changed = v9.apply_edits(
            root=root,
            policy=policy,
            edits=({"path": "src/consumer/order", "old": "VALUE = 1", "new": "VALUE = 2"},),
        )
        assert changed == ["src/consumer/order.py"]
        assert target.read_text(encoding="utf-8") == "VALUE = 2\n"

        # A no-op does not crash orchestration or claim a change.
        no_change = v9.apply_edits(
            root=root,
            policy=policy,
            edits=({"path": "src/consumer/order.py", "old": "VALUE = 2", "new": "VALUE = 2"},),
        )
        assert no_change == []

        # Ambiguous extension repair is forbidden.
        (root / "src" / "consumer" / "order.ts").write_text("x\n", encoding="utf-8")
        try:
            v9.apply_edits(
                root=root,
                policy=policy,
                edits=({"path": "src/consumer/order", "old": "x", "new": "y"},),
            )
        except v9.AgentContractError as exc:
            assert "EDIT_TARGET_INVALID" in str(exc)
        else:
            raise AssertionError("ambiguous extension canonicalization allowed")

        security_task = "Close path traversal and symlink escape while preserving normal in-root file reads."
        prompt = v9.build_actor_prompt(root=root, task=security_task, policy=policy)
        assert "FILESYSTEM SECURITY CONTRACT" in prompt
        assert "canonical/resolved paths" in prompt
        review = v9.build_review_prompt(
            root=root,
            task=security_task,
            criteria=("Preserve normal reads",),
            changed_files=("src/consumer/order.py",),
            public_tests={"passed": True, "runs": []},
        )
        assert "FILESYSTEM SECURITY REVIEW" in review
        assert "descendant" in review

    source = Path(v9.__file__).read_text(encoding="utf-8")
    for forbidden in ("hot_path-", "unsafe_boundary-", "api_version_skew-", "hidden_profile"):
        assert forbidden not in source
    print("AVANTIQO_CODE_REPO_AGENT_V9_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
