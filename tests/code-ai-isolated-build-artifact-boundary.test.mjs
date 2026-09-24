import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { openLocalCodeWorkspace } from "../lib/code/runtime/CodeWorkspaceLocalRuntime.js";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || "").trim();
}

test("isolated Next build artifacts are excluded while real source edits remain visible", async () => {
  const root = await mkdtemp(join(tmpdir(), "avantiqo-build-artifact-"));
  const repo = join(root, "repo");
  const previousRoot = process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
  try {
    await mkdir(repo, { recursive: true });
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "benchmark@example.invalid"]);
    git(repo, ["config", "user.name", "Benchmark Runner"]);
    git(repo, ["remote", "add", "origin", "https://github.com/avantiqo-benchmark/build-artifact"]);
    await writeFile(join(repo, "source.js"), "export const value = 1;\n", "utf8");
    const buildScript = [
      "const fs=require('fs');",
      "const dir=process.env.AVANTIQO_NEXT_DIST_DIR;",
      "if(dir!=='.next-code-verify')process.exit(7);",
      "fs.mkdirSync(dir+'/server',{recursive:true});",
      "fs.writeFileSync(dir+'/server/manifest.json','ok\\n');",
    ].join("");
    await writeFile(join(repo, "package.json"), JSON.stringify({
      name: "build-artifact-fixture",
      version: "1.0.0",
      scripts: { build: "node -e " + JSON.stringify(buildScript) },
    }, null, 2) + "\n", "utf8");
    git(repo, ["add", "source.js", "package.json"]);
    git(repo, ["commit", "-qm", "baseline"]);
    const commit = git(repo, ["rev-parse", "HEAD"]);

    process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = repo;
    const workspace = await openLocalCodeWorkspace({
      repository_url: "https://github.com/avantiqo-benchmark/build-artifact",
      ref: commit,
      timeout_ms: 45000,
    });
    try {
      const build = await workspace.run({
        command: "npm",
        args: ["run", "build"],
        env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" },
      });
      assert.equal(build.exit_code, 0);
      const artifactDir = join(workspace.repository_root, ".next-code-verify", "server");
      assert.equal(await readFile(join(artifactDir, "manifest.json"), "utf8"), "ok\n");

      const artifactOnly = await workspace.diff();
      assert.equal(artifactOnly.patch, "");
      assert.deepEqual(artifactOnly.status, []);

      const source = await readFile(join(workspace.repository_root, "source.js"), "utf8");
      await workspace.applyFiles([{ path: "source.js", content: source.replace("1", "2") }]);
      const sourceDiff = await workspace.diff();
      assert.match(sourceDiff.patch, /value = 2/);
      assert.doesNotMatch(sourceDiff.patch, /next-code-verify|manifest\.json/);
      assert.ok(sourceDiff.status.some((line) => line.includes("source.js")));
      assert.ok(sourceDiff.status.every((line) => !line.includes("next-code-verify")));
    } finally {
      await workspace.stop();
    }
  } finally {
    if (previousRoot === undefined) delete process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT;
    else process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});

test("sandbox and device diff accounting exclude only the controller-owned build artifact tree", async () => {
  const sandbox = await readFile("lib/code/runtime/CodeWorkspaceSandboxRuntime.js", "utf8");
  const device = await readFile("scripts/code-device-agent.mjs", "utf8");
  assert.match(sandbox, /:\(exclude\)\.next-code-verify\/\*\*/);
  assert.match(device, /:\(exclude\)\.next-code-verify\/\*\*/);
});
