import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { openLocalCodeWorkspace } from "../lib/code/runtime/CodeWorkspaceLocalRuntime.js";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || "").trim();
}

test("source-bound replaceRange can safely edit a tracked file above the normal 512KB read limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "avantiqo-large-range-"));
  const repo = join(root, "repo");
  const previousRoot = process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(repo, { recursive: true }));
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "benchmark@example.invalid"]);
    git(repo, ["config", "user.name", "Benchmark Runner"]);
    git(repo, ["remote", "add", "origin", "https://github.com/avantiqo-benchmark/large-range"]);

    const lines = Array.from({ length: 7000 }, (_, index) =>
      index === 3499
        ? "TARGET_LINE=before"
        : `line_${String(index + 1).padStart(4, "0")}=${"x".repeat(86)}`
    );
    const original = lines.join("\n");
    assert.ok(Buffer.byteLength(original, "utf8") > 512 * 1024);
    assert.ok(Buffer.byteLength(original, "utf8") < 1024 * 1024);
    await writeFile(join(repo, "large-fixture.txt"), original, "utf8");
    git(repo, ["add", "large-fixture.txt"]);
    git(repo, ["commit", "-qm", "large fixture"]);
    const commit = git(repo, ["rev-parse", "HEAD"]);

    process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = repo;
    const workspace = await openLocalCodeWorkspace({
      repository_url: "https://github.com/avantiqo-benchmark/large-range",
      ref: commit,
      timeout_ms: 45000,
    });
    try {
      await assert.rejects(
        workspace.read({ file_path: "large-fixture.txt" }),
        /CODE_AI_FILE_READ_TOO_LARGE/,
      );

      const boundedRead = await workspace.read({
        file_path: "large-fixture.txt",
        start_line: 3498,
        end_line: 3502,
      });
      assert.equal(boundedRead.large_file_window_read, true);
      assert.equal(boundedRead.file_bytes > 512 * 1024, true);
      assert.match(boundedRead.content, /TARGET_LINE=before/);
      assert.equal(boundedRead.start_line, 3498);
      assert.equal(boundedRead.end_line, 3502);

      await assert.rejects(
        workspace.read({
          file_path: "large-fixture.txt",
          start_line: 3400,
          end_line: 3650,
        }),
        /CODE_AI_LARGE_FILE_READ_WINDOW_TOO_WIDE/,
      );

      const edited = await workspace.replaceRange({
        file_path: "large-fixture.txt",
        start_line: 3500,
        end_line: 3500,
        expected: "TARGET_LINE=before",
        replacement: "TARGET_LINE=after",
      });
      assert.equal(edited.valid, true);
      assert.equal(edited.file_path, "large-fixture.txt");
      assert.equal(Object.hasOwn(edited, "commit_content"), false);
      assert.equal(edited.raw_full_file_persisted, false);
      const afterEdit = await workspace.read({
        file_path: "large-fixture.txt",
        start_line: 3500,
        end_line: 3500,
      });
      assert.equal(afterEdit.content, "TARGET_LINE=after");

      const diff = await workspace.diff();
      assert.match(diff.patch, /TARGET_LINE=before/);
      assert.match(diff.patch, /TARGET_LINE=after/);
      assert.equal(diff.diff_check.exit_code, 0);

      await assert.rejects(
        workspace.replaceRange({
          file_path: "large-fixture.txt",
          start_line: 3500,
          end_line: 3500,
          expected: "TARGET_LINE=before",
          replacement: "TARGET_LINE=should-not-write",
        }),
        /CODE_AI_REPLACE_RANGE_STALE_SOURCE/,
      );
      const afterStaleAttempt = await workspace.diff();
      assert.equal(afterStaleAttempt.patch, diff.patch);
    } finally {
      await workspace.stop();
    }
  } finally {
    if (previousRoot === undefined) delete process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
    else process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
