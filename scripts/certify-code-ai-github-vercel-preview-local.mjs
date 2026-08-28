import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  openLocalCodeWorkspace,
} from "../lib/code/runtime/CodeWorkspaceLocalRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_GITHUB_VERCEL_PREVIEW_CERTIFICATION_V1";
const APPROVAL = "AVANTIQO_CODE_GITHUB_VERCEL_PREVIEW_CERT_APPROVED";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const APP_ROOT = "local-audit-output/avantiqo-computer-agent-generated-app";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

async function run(command, args = [], cwd = process.cwd(), env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => resolve({
      exit_code: Number.isInteger(code) ? code : 1,
      stdout,
      stderr,
    }));
  });
}

async function required(command, args, cwd, label) {
  const result = await run(command, args, cwd);
  if (result.exit_code !== 0) {
    const error = new Error(`${label}:${command}:${result.exit_code}`);
    error.details = result;
    throw error;
  }
  return result;
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_GITHUB_VERCEL_PREVIEW_CERT_DEVELOPMENT_ONLY");
}
if (text(process.env[APPROVAL]) !== "YES") {
  throw new Error(`CODE_AI_GITHUB_VERCEL_PREVIEW_CERT_APPROVAL_REQUIRED:${APPROVAL}=YES`);
}
if (!text(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT)) {
  throw new Error("AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT_REQUIRED");
}
if (!text(process.env.VERCEL_TOKEN)) {
  throw new Error("VERCEL_TOKEN_REQUIRED_FOR_PREVIEW_CERTIFICATION");
}

const workspace = await openLocalCodeWorkspace({
  repository_url: REPOSITORY_URL,
  ref: "main",
  timeout_ms: 30 * 60 * 1000,
});
const branch = `avantiqo-computer-proof-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
let branchPushed = false;

try {
  const files = [
    {
      path: `${APP_ROOT}/package.json`,
      content: JSON.stringify({
        name: "avantiqo-computer-agent-proof",
        private: true,
        type: "module",
      }, null, 2) + "\n",
    },
    {
      path: `${APP_ROOT}/api/health.mjs`,
      content: `export default function handler(request, response) {\n  response.status(200).json({ success: true, agent: "Avantiqo Code", stage: "vercel-preview" });\n}\n`,
    },
    {
      path: `${APP_ROOT}/public/index.html`,
      content: "<!doctype html><html><body><main><h1>Avantiqo Computer Agent Preview</h1><p>GitHub to Vercel preview proof.</p></main></body></html>\n",
    },
    {
      path: `${APP_ROOT}/vercel.json`,
      content: JSON.stringify({
        version: 2,
        rewrites: [
          { source: "/", destination: "/index.html" },
        ],
      }, null, 2) + "\n",
    },
  ];
  const applied = await workspace.applyFiles(files);
  assert.equal(applied.valid, true);

  const check = await workspace.run({
    command: "node",
    args: ["--check", "api/health.mjs"],
    cwd: APP_ROOT,
  });
  assert.equal(check.exit_code, 0, check.stderr);

  const diff = await workspace.diff();
  assert.equal(diff.diff_check.exit_code, 0);
  assert.match(diff.patch, /Avantiqo Computer Agent Preview/);

  await required("git", ["checkout", "-b", branch], workspace.repository_root, "CODE_AI_PREVIEW_BRANCH_CREATE_FAILED");
  await required("git", ["add", "--", APP_ROOT], workspace.repository_root, "CODE_AI_PREVIEW_GIT_ADD_FAILED");
  await required(
    "git",
    ["-c", "user.name=Avantiqo Code", "-c", "user.email=code@avantiqo.local", "commit", "-m", "Certify Avantiqo computer agent preview"],
    workspace.repository_root,
    "CODE_AI_PREVIEW_GIT_COMMIT_FAILED",
  );
  const commitSha = text((await required("git", ["rev-parse", "HEAD"], workspace.repository_root, "CODE_AI_PREVIEW_COMMIT_SHA_REQUIRED")).stdout, 160);
  assert.match(commitSha, /^[a-f0-9]{40}$/i);

  await required(
    "git",
    ["push", "--set-upstream", "origin", `${branch}:${branch}`],
    workspace.repository_root,
    "CODE_AI_PREVIEW_GITHUB_PUSH_FAILED",
  );
  branchPushed = true;
  const remote = await required(
    "git",
    ["ls-remote", "--heads", "origin", branch],
    workspace.repository_root,
    "CODE_AI_PREVIEW_GITHUB_VERIFY_FAILED",
  );
  assert.match(remote.stdout, new RegExp(`^${commitSha}\\s+refs/heads/${branch}$`, "m"));

  let project = null;
  try {
    project = JSON.parse(await readFile(`${process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT}/.vercel/project.json`, "utf8"));
  } catch {
    project = null;
  }
  const orgId = text(process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID || project?.orgId, 300);
  const projectId = text(process.env.VERCEL_PROJECT_ID || project?.projectId, 300);
  if (!orgId || !projectId) {
    throw new Error("CODE_AI_PREVIEW_VERCEL_PROJECT_BINDING_REQUIRED");
  }

  const deployResponse = await fetch(`https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "churchill-control",
      project: projectId,
      target: undefined,
      gitSource: {
        type: "github",
        ref: branch,
        repoId: Number(process.env.AVANTIQO_CODE_GITHUB_REPOSITORY_ID || 1210794056),
      },
    }),
  });
  const deployBody = await deployResponse.json().catch(() => ({}));
  if (!deployResponse.ok) {
    throw new Error(`CODE_AI_PREVIEW_VERCEL_DEPLOY_HTTP_${deployResponse.status}:${text(deployBody?.error?.message || deployBody?.error || deployBody?.message, 1000)}`);
  }
  const deploymentId = text(deployBody.id, 300);
  const deploymentUrl = text(deployBody.url, 1000);
  if (!deploymentId || !deploymentUrl) throw new Error("CODE_AI_PREVIEW_VERCEL_DEPLOYMENT_ID_URL_REQUIRED");

  let ready = null;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(orgId)}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) continue;
    const state = text(body.readyState || body.state, 80).toUpperCase();
    if (state === "READY") {
      ready = body;
      break;
    }
    if (["ERROR", "CANCELED"].includes(state)) {
      throw new Error(`CODE_AI_PREVIEW_VERCEL_DEPLOYMENT_FAILED:${state}`);
    }
  }
  if (!ready) throw new Error("CODE_AI_PREVIEW_VERCEL_DEPLOYMENT_READY_TIMEOUT");

  const previewBaseUrl = `https://${deploymentUrl}`;
  const page = await fetch(previewBaseUrl).then((response) => response.text());
  assert.match(page, /Avantiqo Computer Agent Preview/);
  const healthResponse = await fetch(`${previewBaseUrl}/api/health`);
  assert.equal(healthResponse.ok, true);
  const health = await healthResponse.json();
  assert.deepEqual(health, {
    success: true,
    agent: "Avantiqo Code",
    stage: "vercel-preview",
  });

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    local_computer_worktree_verified: true,
    github_branch: branch,
    github_commit_sha: commitSha,
    github_push_verified: true,
    vercel_deployment_id: deploymentId,
    vercel_preview_url: previewBaseUrl,
    vercel_preview_ready_verified: true,
    vercel_preview_http_verified: true,
    production_deployment_executed: false,
    production_alias_modified: false,
    database_mutation_executed: false,
    secrets_printed: false,
  }, null, 2));
} finally {
  if (branchPushed && text(process.env.AVANTIQO_CODE_PREVIEW_KEEP_GITHUB_BRANCH).toUpperCase() !== "YES") {
    await run("git", ["push", "origin", "--delete", branch], workspace.repository_root).catch(() => null);
  }
  await workspace.stop();
}
