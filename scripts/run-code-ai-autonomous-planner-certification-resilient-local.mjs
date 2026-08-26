import process from "node:process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  SUPABASE_NETWORK_MAX_ATTEMPTS,
  boundedRetryDelayMs,
  isRetryableHttpStatus,
  isSupabaseCleanupRetryRequest,
  isTransientNetworkError,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

const REQUIRED_NODE_MAJOR = 24;
const THIS_SCRIPT = fileURLToPath(import.meta.url);

function text(value) { return String(value ?? "").trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function nodeMajor(version) {
  const major = Number(String(version || "").replace(/^v/, "").split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}
function nodeVersion(candidate) {
  if (!candidate) return null;
  const result = spawnSync(candidate, ["-p", "process.versions.node"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.error || result.status !== 0) return null;
  return text(result.stdout);
}
function versionedNodeCandidates(root, relativeNodePath) {
  if (!root || !fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root).filter((entry) => /^v?24(?:\.|$)/.test(entry)).map((entry) => path.join(root, entry, ...relativeNodePath));
  } catch { return []; }
}
function node24Candidates() {
  const home = os.homedir();
  const candidates = [
    text(process.env.AVANTIQO_NODE24_BIN),
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/opt/node@24/bin/node",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
  ];
  for (const directory of text(process.env.PATH).split(path.delimiter).filter(Boolean)) candidates.push(path.join(directory, "node"));
  for (const root of new Set([text(process.env.NVM_DIR), path.join(home, ".nvm")].filter(Boolean))) {
    candidates.push(...versionedNodeCandidates(path.join(root, "versions", "node"), ["bin", "node"]));
  }
  for (const root of [path.join(home, ".fnm", "node-versions"), path.join(home, ".local", "share", "fnm", "node-versions")]) {
    candidates.push(...versionedNodeCandidates(root, ["installation", "bin", "node"]));
  }
  candidates.push(...versionedNodeCandidates(path.join(home, ".volta", "tools", "image", "node"), ["bin", "node"]));
  return [...new Set(candidates.filter(Boolean))];
}

if (nodeMajor(process.versions.node) !== REQUIRED_NODE_MAJOR) {
  if (process.env.AVANTIQO_CODE_CERT_RESILIENCE_NODE24_REEXEC === "1") {
    throw new Error(`CODE_AI_CERTIFICATION_RESILIENCE_NODE_24_REEXEC_FAILED:current=${process.version}`);
  }
  const compatibleNode = node24Candidates().find((candidate) => nodeMajor(nodeVersion(candidate)) === REQUIRED_NODE_MAJOR);
  if (!compatibleNode) throw new Error(`CODE_AI_CERTIFICATION_NODE_24_REQUIRED:current=${process.version}`);
  const relaunched = spawnSync(compatibleNode, [THIS_SCRIPT, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: { ...process.env, AVANTIQO_CODE_CERT_RESILIENCE_NODE24_REEXEC: "1" },
    stdio: "inherit",
  });
  if (relaunched.error) throw relaunched.error;
  process.exit(Number.isInteger(relaunched.status) ? relaunched.status : 1);
}

const supabaseOrigin = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") throw new Error("CODE_AI_CERTIFICATION_FETCH_REQUIRED");

globalThis.fetch = async function codeCertificationSupabaseResilientFetch(input, init = {}) {
  if (!isSupabaseCleanupRetryRequest(input, init, supabaseOrigin)) return originalFetch(input, init);

  let lastError = null;
  for (let attempt = 0; attempt < SUPABASE_NETWORK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await originalFetch(input, init);
      if (!isRetryableHttpStatus(response.status) || attempt === SUPABASE_NETWORK_MAX_ATTEMPTS - 1) return response;
      lastError = new Error(`CODE_AI_CERTIFICATION_SUPABASE_HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === SUPABASE_NETWORK_MAX_ATTEMPTS - 1) throw error;
    }
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_CERTIFICATION_SUPABASE_NETWORK_RETRY",
      contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
      attempt: attempt + 1,
      max_attempts: SUPABASE_NETWORK_MAX_ATTEMPTS,
      method: text(init?.method || input?.method || "GET").toUpperCase(),
      reason: text(lastError?.message || lastError).slice(0, 180),
      new_provider_execution_submitted: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }));
    await sleep(boundedRetryDelayMs(attempt));
  }
  throw lastError || new Error("CODE_AI_CERTIFICATION_SUPABASE_RETRY_EXHAUSTED");
};

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CERTIFICATION_RESILIENCE_ACTIVE",
  contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  node_runtime: process.version,
  supabase_network_max_attempts: SUPABASE_NETWORK_MAX_ATTEMPTS,
  retries_limited_to_same_origin_get_head_patch: true,
  provider_post_retries_forbidden: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

await import("./run-code-ai-autonomous-planner-certification-local.mjs");
