#!/usr/bin/env node

import { lstat, readFile, readlink, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

const CONTRACT = "AVANTIQO_PRODUCTION_SUPABASE_SERVICE_ROLE_VERCEL_REPAIR_V1";
const APPROVAL_ENV = "AVANTIQO_PRODUCTION_SUPABASE_SERVICE_ROLE_VERCEL_REPAIR_APPROVED";
const EXPECTED_PROJECT_ID = "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const EXPECTED_ORG_ID = "team_40jy42BqQOs4U6pVdkawwEfp";
const EXPECTED_SUPABASE_REF = "vfsjqabpkcbiuerhzugk";
const EXPECTED_LIVE_DEPLOYMENT_ID = "dpl_9UiKouxY987DQgqYH9M64XK5A9Ne";
const EXPECTED_LIVE_DEPLOYMENT_URL = "churchill-control-new-kgl1-3l3119z3w-patrics-projects-3ec66dc7.vercel.app";
const EXPECTED_LIVE_GIT_SHA = "ed2b3a8152f5c94f6a2cd87399fb1c23266f3bd4";
const PRODUCTION_ALIAS = "www.avantiqo.ai";
const ENV_KEY = "SUPABASE_SERVICE_ROLE_KEY";

const text = (value) => String(value ?? "").trim();

function redact(value, secret = "") {
  let output = text(value);
  if (secret) output = output.split(secret).join("[REDACTED]");
  return output
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .slice(0, 2400);
}

function run(command, args, { input = null, secret = "", allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    input,
    stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || (!allowFailure && result.status !== 0)) {
    const detail = result.error?.message || result.stderr || result.stdout || "UNKNOWN_FAILURE";
    throw new Error(`${CONTRACT}_COMMAND_FAILED:${command}:${redact(detail, secret)}`);
  }
  return {
    status: Number.isInteger(result.status) ? result.status : 1,
    stdout: text(result.stdout),
    stderr: text(result.stderr),
  };
}

function resolveVercelCommand() {
  const direct = run("vercel", ["--version"], { allowFailure: true });
  if (direct.status === 0) return { command: "vercel", prefix: [] };

  const npx = run("npx", ["--yes", "vercel", "--version"], { allowFailure: true });
  if (npx.status === 0) return { command: "npx", prefix: ["--yes", "vercel"] };

  throw new Error(`${CONTRACT}_VERCEL_CLI_REQUIRED`);
}

function vercel(cli, args, options = {}) {
  return run(cli.command, [...cli.prefix, ...args], options);
}

async function verifyProjectLink() {
  const projectPath = path.join(process.cwd(), ".vercel", "project.json");
  const parsed = JSON.parse(await readFile(projectPath, "utf8"));
  if (text(parsed?.projectId) !== EXPECTED_PROJECT_ID || text(parsed?.orgId) !== EXPECTED_ORG_ID) {
    throw new Error(`${CONTRACT}_VERCEL_PROJECT_LINK_MISMATCH`);
  }
  return true;
}

function supabaseRefFromUrl(raw) {
  try {
    return text(new URL(raw).hostname.split(".")[0]);
  } catch {
    return "";
  }
}

async function validateServiceRoleKey({ supabaseUrl, key }) {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/staff_accounts`);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Cache-Control": "no-store",
    },
    signal: AbortSignal.timeout(20_000),
  });
  await response.text();
  if (!response.ok) {
    throw new Error(`${CONTRACT}_LOCAL_SERVICE_ROLE_KEY_REJECTED:${response.status}`);
  }
  return true;
}

function envListed(output) {
  return output.split(/\r?\n/).some((line) => line.includes(ENV_KEY));
}

async function waitForBootstrapRecovery() {
  const url = `https://${PRODUCTION_ALIAS}/api/session/bootstrap`;
  const deadline = Date.now() + 8 * 60_000;
  let last = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "Cache-Control": "no-store" },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const raw = await response.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch {}
      last = {
        status: response.status,
        error: text(body?.error),
        reason: text(body?.reason),
      };

      const missingSecret = /SUPABASE_SERVICE_ROLE_KEY/i.test(raw);
      const healthyUnauthenticatedBootstrap =
        response.status === 401 &&
        text(body?.reason) === "AUTHENTICATION_REQUIRED" &&
        !missingSecret;

      if (healthyUnauthenticatedBootstrap) return last;
    } catch (error) {
      last = { status: 0, error: text(error?.message), reason: "" };
    }

    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  throw new Error(`${CONTRACT}_PRODUCTION_BOOTSTRAP_RECOVERY_TIMEOUT:last=${JSON.stringify(last)}`);
}

const apply = process.argv.includes("--apply");
if (!apply || text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_AND_--apply_REQUIRED`);
}

loadAvantiqoEnv();

const serviceRoleKey = text(process.env[ENV_KEY]);
if (!serviceRoleKey || serviceRoleKey.length < 32) {
  throw new Error(`${CONTRACT}_LOCAL_${ENV_KEY}_REQUIRED`);
}

const supabaseUrl = text(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
if (supabaseRefFromUrl(supabaseUrl) !== EXPECTED_SUPABASE_REF) {
  throw new Error(`${CONTRACT}_PRODUCTION_SUPABASE_PROJECT_MISMATCH`);
}

await validateServiceRoleKey({ supabaseUrl, key: serviceRoleKey });
await verifyProjectLink();
const cli = resolveVercelCommand();

const envLocalPath = path.join(process.cwd(), ".env.local");
let envSymlinkTarget = null;
let envShielded = false;
let restoreError = null;

try {
  try {
    const stat = await lstat(envLocalPath);
    if (stat.isSymbolicLink()) {
      envSymlinkTarget = await readlink(envLocalPath);
      await unlink(envLocalPath);
      envShielded = true;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const currentAlias = vercel(cli, ["inspect", `https://${PRODUCTION_ALIAS}`]);
  const aliasInspection = `${currentAlias.stdout}\n${currentAlias.stderr}`;
  const stillExpectedProduction =
    aliasInspection.includes(EXPECTED_LIVE_DEPLOYMENT_ID) ||
    aliasInspection.includes(EXPECTED_LIVE_DEPLOYMENT_URL) ||
    aliasInspection.includes(EXPECTED_LIVE_GIT_SHA);
  if (!stillExpectedProduction) {
    throw new Error(`${CONTRACT}_PRODUCTION_ALIAS_CHANGED_RECONCILIATION_REQUIRED`);
  }

  const envList = vercel(cli, ["env", "ls", "production"]);
  const alreadyPresent = envListed(`${envList.stdout}\n${envList.stderr}`);
  const secretInput = `${serviceRoleKey}\n`;

  if (alreadyPresent) {
    const update = vercel(
      cli,
      ["env", "update", ENV_KEY, "production", "--sensitive"],
      { input: secretInput, secret: serviceRoleKey, allowFailure: true },
    );
    if (update.status !== 0) {
      throw new Error(`${CONTRACT}_VERCEL_ENV_UPDATE_FAILED:${redact(update.stderr || update.stdout, serviceRoleKey)}`);
    }
  } else {
    const add = vercel(
      cli,
      ["env", "add", ENV_KEY, "production", "--sensitive"],
      { input: secretInput, secret: serviceRoleKey, allowFailure: true },
    );
    if (add.status !== 0) {
      throw new Error(`${CONTRACT}_VERCEL_ENV_ADD_FAILED:${redact(add.stderr || add.stdout, serviceRoleKey)}`);
    }
  }

  const afterList = vercel(cli, ["env", "ls", "production"]);
  if (!envListed(`${afterList.stdout}\n${afterList.stderr}`)) {
    throw new Error(`${CONTRACT}_VERCEL_ENV_NOT_LISTED_AFTER_WRITE`);
  }

  const aliasRecheck = vercel(cli, ["inspect", `https://${PRODUCTION_ALIAS}`]);
  const aliasRecheckText = `${aliasRecheck.stdout}\n${aliasRecheck.stderr}`;
  const stillSafeToRedeploy =
    aliasRecheckText.includes(EXPECTED_LIVE_DEPLOYMENT_ID) ||
    aliasRecheckText.includes(EXPECTED_LIVE_DEPLOYMENT_URL) ||
    aliasRecheckText.includes(EXPECTED_LIVE_GIT_SHA);
  if (!stillSafeToRedeploy) {
    throw new Error(`${CONTRACT}_PRODUCTION_ALIAS_CHANGED_AFTER_ENV_WRITE_REDEPLOY_REFUSED`);
  }

  const redeploy = vercel(
    cli,
    ["redeploy", EXPECTED_LIVE_DEPLOYMENT_ID, "--yes"],
    { allowFailure: true },
  );
  if (redeploy.status !== 0) {
    throw new Error(`${CONTRACT}_VERCEL_REDEPLOY_FAILED:${redact(redeploy.stderr || redeploy.stdout)}`);
  }

  const verification = await waitForBootstrapRecovery();

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    production_project_id: EXPECTED_PROJECT_ID,
    production_team_id: EXPECTED_ORG_ID,
    production_supabase_ref: EXPECTED_SUPABASE_REF,
    local_service_role_key_present: true,
    local_service_role_key_validated: true,
    secret_printed: false,
    vercel_variable: ENV_KEY,
    vercel_variable_sensitive: true,
    vercel_variable_existed_before: alreadyPresent,
    vercel_variable_upserted: true,
    redeployed_exact_previous_production_deployment: EXPECTED_LIVE_DEPLOYMENT_ID,
    newest_main_deployed: false,
    unrelated_parallel_work_deployed: false,
    production_bootstrap_status: verification.status,
    production_bootstrap_reason: verification.reason,
    production_bootstrap_missing_service_role_error: false,
    worktree_env_local_symlink_temporarily_removed: envShielded,
    root_env_local_touched: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} finally {
  if (envShielded && envSymlinkTarget) {
    try {
      await symlink(envSymlinkTarget, envLocalPath);
    } catch (error) {
      restoreError = error;
    }
  }
  if (restoreError) {
    console.error(`${CONTRACT}_WORKTREE_ENV_LOCAL_RESTORE_FAILED`);
    process.exitCode = 1;
  }
}
