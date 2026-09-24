import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || "").trim();
}

test("missing verifier path becomes deterministic tracked-path replan evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "avantiqo-missing-verifier-"));
  const repo = join(root, "repo");
  const previousRoot = process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
  try {
    await mkdir(join(repo, "tests"), { recursive: true });
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "benchmark@example.invalid"]);
    git(repo, ["config", "user.name", "Benchmark Runner"]);
    git(repo, ["remote", "add", "origin", "https://github.com/avantiqo-benchmark/missing-verifier"]);
    await writeFile(join(repo, "tests", "restart-recovery.test.js"), "export const fixture = true;\n", "utf8");
    await writeFile(
      join(repo, "runner.mjs"),
      "import { readFile } from 'node:fs/promises';\nawait readFile(new URL('./tests/restart-recovery.test.mjs', import.meta.url), 'utf8');\n",
      "utf8",
    );
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "baseline"]);
    const commit = git(repo, ["rev-parse", "HEAD"]);
    process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = repo;

    const result = await executeCodeAIMission({
      objective: "Run the existing restart recovery verifier.",
      repository_url: "https://github.com/avantiqo-benchmark/missing-verifier",
      ref: commit,
      workspace_target: "LOCAL_COMPUTER",
      operations: [{
        id: "verify-restart",
        action: "verify",
        description: "Run restart recovery verification.",
        input: { command: "node", args: ["runner.mjs"] },
      }],
    });

    assert.equal(result.success, false);
    assert.equal(result.status, "replan_required");
    assert.equal(result.reason, "CODE_AI_MISSING_VERIFIER_PATH_REPLAN_REQUIRED");
    const evidence = (result.state?.evidence || []).find((entry) => entry.kind === "missing_repository_verifier_path");
    assert.ok(evidence);
    assert.equal(evidence.requested_path, "tests/restart-recovery.test.mjs");
    assert.ok(evidence.candidate_paths.includes("tests/restart-recovery.test.js"));
    assert.equal(evidence.deterministic_repository_discovery, true);
  } finally {
    if (previousRoot === undefined) delete process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
    else process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test("work-package runtime blocks exact retry of a verifier path already proven missing", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8"));
  assert.match(source, /knownMissingRepositoryVerifierPaths/);
  assert.match(source, /CODE_AI_WORK_PACKAGE_KNOWN_MISSING_VERIFIER_REPEATED/);
  assert.match(source, /known_missing_verifier_repeat/);
  assert.match(source, /Do not run or verify that path again/);
});
