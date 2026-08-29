#!/usr/bin/env node

import { lstat, readlink, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_ENV_SHIELD_V1";
const WRAPPER_PATH = "scripts/run-avantiqo-voice-realtime-relay-production-bind-env-shield-local.mjs";
const BINDER_PATH = "scripts/bind-avantiqo-voice-realtime-relay-production-local.mjs";

const text = (value) => String(value ?? "").trim();

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[REDACTED]")
    .slice(0, 1200);
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${CONTRACT}_GIT_FAILED:${redact(result.stderr || result.stdout)}`);
  }
  return text(result.stdout);
}

function assertWrapperEquivalentToNewestMain() {
  git(["fetch", "origin", "main", "--quiet"]);
  const head = git(["rev-parse", "HEAD"]);
  const newest = git(["rev-parse", "origin/main"]);
  const localBlob = git(["rev-parse", `${head}:${WRAPPER_PATH}`]);
  const newestBlob = git(["rev-parse", `${newest}:${WRAPPER_PATH}`]);
  if (localBlob !== newestBlob) {
    throw new Error(`${CONTRACT}_WRAPPER_CHANGED_ON_NEWEST_MAIN:head=${head}:origin_main=${newest}`);
  }
  return { head, newest, main_advanced: head !== newest };
}

loadAvantiqoEnv();
const freshness = assertWrapperEquivalentToNewestMain();

const envLocalPath = path.join(process.cwd(), ".env.local");
let symlinkTarget = null;
let shielded = false;
let childStatus = 1;
let restoreFailure = null;

try {
  try {
    const stat = await lstat(envLocalPath);
    if (!stat.isSymbolicLink()) {
      throw new Error(`${CONTRACT}_REFUSING_TO_TOUCH_NON_SYMLINK_ENV_LOCAL`);
    }
    symlinkTarget = await readlink(envLocalPath);
    await unlink(envLocalPath);
    shielded = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    phase: "SUPABASE_CLI_ENV_SHIELD_READY",
    checkout_sha: freshness.head,
    newest_main_sha: freshness.newest,
    parallel_main_advance_tolerated: freshness.main_advanced,
    env_loaded_before_shield: true,
    worktree_env_local_symlink_removed_temporarily: shielded,
    root_env_local_touched: false,
    secrets_printed: false,
  }, null, 2));

  const child = spawnSync(
    process.execPath,
    [BINDER_PATH, ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );

  if (child.error) {
    throw new Error(`${CONTRACT}_BINDER_START_FAILED:${redact(child.error.message)}`);
  }
  childStatus = Number.isInteger(child.status) ? child.status : 1;
} finally {
  if (shielded && symlinkTarget) {
    try {
      await symlink(symlinkTarget, envLocalPath);
    } catch (error) {
      restoreFailure = error;
    }
  }
}

if (restoreFailure) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: `${CONTRACT}_WORKTREE_ENV_LOCAL_SYMLINK_RESTORE_FAILED:${redact(restoreFailure.message)}`,
    root_env_local_touched: false,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    success: childStatus === 0,
    contract: CONTRACT,
    binder_rc: childStatus,
    worktree_env_local_symlink_restored: shielded,
    root_env_local_touched: false,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = childStatus;
}
