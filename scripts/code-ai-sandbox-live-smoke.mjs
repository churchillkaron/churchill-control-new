import assert from "node:assert/strict";

import {
  CodeWorkspaceSandboxRuntime,
} from "../lib/code/runtime/CodeWorkspaceSandboxRuntime.js";

const repositoryUrl =
  process.env.AVANTIQO_CODE_SANDBOX_REPOSITORY ||
  "https://github.com/churchillkaron/churchill-control-new";
const ref = process.env.AVANTIQO_CODE_SANDBOX_REF || "main";
const certificationPath = "tmp/code-ai-sandbox-certification.txt";
const certificationContent = [
  "AVANTIQO_CODE_SANDBOX_LIVE_SMOKE_V1",
  "isolated=true",
  "persistent=false",
  "production_side_effects=false",
  "provider_spend=false",
  "",
].join("\n");

const workspace = await CodeWorkspaceSandboxRuntime.open({
  repository_url: repositoryUrl,
  ref,
  timeout_ms: Number(process.env.AVANTIQO_CODE_SANDBOX_TIMEOUT_MS || 240000),
});

try {
  const baseline = await workspace.inspect();
  assert.equal(baseline.clean, true, "sandbox clone must start clean");
  assert.ok(baseline.head_sha, "sandbox clone must expose the checked-out commit");
  assert.equal(baseline.package_manager, "npm", "repository package manager must resolve to npm");

  const search = await workspace.search({
    query: "AVANTIQO_CODE_AI_MISSION_V1",
    paths: ["lib/code/runtime/CodeAIMissionRuntime.js"],
  });
  assert.ok(search.match_count >= 1, "sandbox search must find the Code AI mission contract");

  const packageJson = await workspace.read({
    file_path: "package.json",
    start_line: 1,
    end_line: 40,
  });
  assert.match(packageJson.content, /"node"\s*:\s*"24\.x"/, "sandbox read must observe Node 24 repository contract");

  const write = await workspace.applyFiles([
    {
      path: certificationPath,
      content: certificationContent,
    },
  ]);
  assert.equal(write.valid, true, "isolated source edit must pass git diff --check");

  const readBack = await workspace.read({
    file_path: certificationPath,
    start_line: 1,
    end_line: 20,
  });
  assert.equal(readBack.content, certificationContent, "sandbox write must be readable exactly");

  const verify = await workspace.run({
    command: "node",
    args: [
      "-e",
      `const fs=require('node:fs');const value=fs.readFileSync(${JSON.stringify(certificationPath)},'utf8');if(!value.includes('AVANTIQO_CODE_SANDBOX_LIVE_SMOKE_V1'))process.exit(2);`,
    ],
    cwd: ".",
  });
  assert.equal(verify.exit_code, 0, `sandbox verification command failed: ${verify.stderr || verify.stdout}`);

  const diff = await workspace.diff();
  assert.equal(diff.diff_check.exit_code, 0, "sandbox final diff must be valid");
  assert.ok(diff.status.some((item) => item.includes(certificationPath)), "sandbox diff must contain isolated certification file");
  assert.match(diff.patch, /AVANTIQO_CODE_SANDBOX_LIVE_SMOKE_V1/, "sandbox patch must contain certification marker");

  const pushPolicy = CodeWorkspaceSandboxRuntime.commandPolicy({
    command: "git",
    args: ["push", "origin", ref],
  });
  assert.equal(pushPolicy.allowed, false, "direct git push must remain blocked inside Code AI workspace");
  assert.equal(pushPolicy.reason, "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME");

  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_CODE_SANDBOX_LIVE_SMOKE_V1",
    sandbox_execution_certified: true,
    repository_url: repositoryUrl,
    ref,
    base_commit: baseline.head_sha,
    package_manager: baseline.package_manager,
    search_verified: true,
    read_verified: true,
    isolated_edit_verified: true,
    command_execution_verified: true,
    diff_verified: true,
    direct_push_blocked: true,
    production_side_effects_executed: false,
    provider_calls_executed: false,
    provider_spend_approved: false,
  }, null, 2));
} finally {
  await workspace.stop();
}
