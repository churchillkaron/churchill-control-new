import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import {
  openLocalCodeWorkspace,
  CODE_WORKSPACE_LOCAL_CONTRACT,
} from "../lib/code/runtime/CodeWorkspaceLocalRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_LOCAL_COMPUTER_AGENT_CERTIFICATION_V1";
const APPROVAL = "AVANTIQO_CODE_LOCAL_COMPUTER_CERT_APPROVED";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const APP_ROOT = "local-audit-output/avantiqo-computer-agent-generated-app";

function text(value) {
  return String(value ?? "").trim();
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_LOCAL_COMPUTER_CERT_DEVELOPMENT_ONLY");
}
if (text(process.env[APPROVAL]) !== "YES") {
  throw new Error(`CODE_AI_LOCAL_COMPUTER_CERT_APPROVAL_REQUIRED:${APPROVAL}=YES`);
}
if (!text(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT)) {
  throw new Error("AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT_REQUIRED");
}

const workspace = await openLocalCodeWorkspace({
  repository_url: REPOSITORY_URL,
  ref: "main",
  timeout_ms: 30 * 60 * 1000,
});

let server = null;
try {
  assert.equal(workspace.contract, CODE_WORKSPACE_LOCAL_CONTRACT);
  assert.equal(workspace.transport, "LOCAL_COMPUTER");
  assert.ok(workspace.repository_root);
  assert.notEqual(workspace.repository_root, process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT);

  const files = [
    {
      path: `${APP_ROOT}/package.json`,
      content: JSON.stringify({
        name: "avantiqo-computer-agent-proof",
        private: true,
        type: "module",
        scripts: {
          check: "node --check server.mjs",
          test: "node test.mjs",
          start: "node server.mjs",
        },
      }, null, 2) + "\n",
    },
    {
      path: `${APP_ROOT}/server.mjs`,
      content: `import http from "node:http";\n\nconst port = Number(process.env.PORT || 43177);\nconst server = http.createServer((request, response) => {\n  if (request.url === "/api/health") {\n    response.writeHead(200, { "content-type": "application/json" });\n    response.end(JSON.stringify({ success: true, agent: "Avantiqo Code", computer: "local" }));\n    return;\n  }\n  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });\n  response.end("<!doctype html><html><body><main><h1>Avantiqo Computer Agent Proof</h1><p>Built on the local development computer.</p></main></body></html>");\n});\n\nserver.listen(port, "127.0.0.1", () => {\n  console.log(JSON.stringify({ ready: true, port }));\n});\n`,
    },
    {
      path: `${APP_ROOT}/test.mjs`,
      content: `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n\nconst source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");\nassert.match(source, /Avantiqo Computer Agent Proof/);\nassert.match(source, /\\/api\\/health/);\nconsole.log("LOCAL_APP_SOURCE_TEST_PASS");\n`,
    },
    {
      path: `${APP_ROOT}/vercel.json`,
      content: JSON.stringify({
        version: 2,
        builds: [{ src: "server.mjs", use: "@vercel/node" }],
        routes: [{ src: "/(.*)", dest: "server.mjs" }],
      }, null, 2) + "\n",
    },
  ];

  const applied = await workspace.applyFiles(files);
  assert.equal(applied.valid, true);

  const syntax = await workspace.run({
    command: "node",
    args: ["--check", "server.mjs"],
    cwd: APP_ROOT,
  });
  assert.equal(syntax.exit_code, 0, syntax.stderr);

  const sourceTest = await workspace.run({
    command: "node",
    args: ["test.mjs"],
    cwd: APP_ROOT,
  });
  assert.equal(sourceTest.exit_code, 0, sourceTest.stderr);
  assert.match(sourceTest.stdout, /LOCAL_APP_SOURCE_TEST_PASS/);

  server = spawn(process.execPath, ["server.mjs"], {
    cwd: `${workspace.repository_root}/${APP_ROOT}`,
    env: { ...process.env, PORT: "43177" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  server.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });

  const deadline = Date.now() + 15_000;
  let health = null;
  while (Date.now() < deadline) {
    await delay(250);
    try {
      const response = await fetch("http://127.0.0.1:43177/api/health");
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      // local process still starting
    }
  }
  assert.deepEqual(health, {
    success: true,
    agent: "Avantiqo Code",
    computer: "local",
  }, `server_stdout=${stdout}\nserver_stderr=${stderr}`);

  const homepage = await fetch("http://127.0.0.1:43177/").then((response) => response.text());
  assert.match(homepage, /Avantiqo Computer Agent Proof/);

  const diff = await workspace.diff();
  assert.equal(diff.diff_check.exit_code, 0);
  assert.ok(diff.status.length >= 4);
  assert.match(diff.patch, /Avantiqo Computer Agent Proof/);
  assert.match(diff.patch, /vercel\.json/);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    workspace_contract: workspace.contract,
    transport: workspace.transport,
    source_repository_root_preserved: true,
    isolated_real_git_worktree: true,
    generated_app_files: files.map((file) => file.path),
    local_terminal_execution_verified: true,
    local_source_write_verified: true,
    local_http_server_verified: true,
    local_http_health_verified: true,
    git_diff_verified: true,
    github_persistence_executed: false,
    vercel_preview_deployment_executed: false,
    production_deployment_executed: false,
    database_mutation_executed: false,
    secrets_printed: false,
  }, null, 2));
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), delay(2000)]).catch(() => null);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await workspace.stop();
}
