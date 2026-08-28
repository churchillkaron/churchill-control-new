import process from "node:process";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import {
  CHILD_TERMINATION_GRACE_MS,
  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  RUNPOD_HEALTH_MAX_ATTEMPTS,
  SUPABASE_NETWORK_MAX_ATTEMPTS,
  boundedRetryDelayMs,
  isRetryableHttpStatus,
  isRunpodSafeLeaseReadRequest,
  isSupabaseCleanupRetryRequest,
  isTransientNetworkError,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

const initialSplit = process.argv.indexOf("--");
const initialControl = initialSplit >= 0 ? process.argv.slice(2, initialSplit) : [];
const requestedLane = String(
  initialControl.find((arg) => String(arg).startsWith("--lane=")) || "",
).slice("--lane=".length).trim();

if (requestedLane === "code") {
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_GOVERNED_POD_ROUTING_ACTIVE",
    contract: "AVANTIQO_CODE_GOVERNED_POD_CERTIFICATION_LEASE_V1",
    lane: "code",
    serverless_rest_state: "0/0",
    transport: "pod-http-v3",
    provider_post_retries_forbidden: true,
    serverless_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  await import("./run-code-ai-governed-pod-certification-local.mjs");
} else {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function exists(file) {
    try { await access(file); return true; } catch { return false; }
  }
  function requestUrl(input) {
    try { return new URL(typeof input === "string" || input instanceof URL ? input : input?.url); }
    catch { return null; }
  }
  function methodOf(input, init) {
    return String(init?.method || input?.method || "GET").trim().toUpperCase();
  }
  function isCodeEndpointClosePatch(input, init = {}) {
    const url = requestUrl(input);
    if (!url || url.hostname !== "rest.runpod.io" || !url.pathname.startsWith("/v1/endpoints/")) return false;
    if (methodOf(input, init) !== "PATCH") return false;
    try {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      return Number(body?.workersMin) === 0 && Number(body?.workersMax) === 0;
    } catch { return false; }
  }

  const lifecycleDir = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-safe-lease-child-"));
  const childReadyFile = path.join(lifecycleDir, "ready");
  const childStopFile = path.join(lifecycleDir, "stop");
  const childAckFile = path.join(lifecycleDir, "ack");
  process.env.AVANTIQO_CODE_SAFE_LEASE_CHILD_READY_FILE = childReadyFile;
  process.env.AVANTIQO_CODE_SAFE_LEASE_CHILD_STOP_FILE = childStopFile;
  process.env.AVANTIQO_CODE_SAFE_LEASE_CHILD_ACK_FILE = childAckFile;

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") {
    throw new Error("CODE_AI_CERTIFICATION_FETCH_REQUIRED");
  }

  globalThis.fetch = async function codeCertificationResilientFetch(input, init = {}) {
    if (isCodeEndpointClosePatch(input, init)) {
      const childWasStarted = await exists(childReadyFile);
      const childAlreadyStopped = await exists(childAckFile);
      if (childWasStarted && !childAlreadyStopped) {
        await writeFile(childStopFile, `${new Date().toISOString()}\n`, "utf8");
        const deadline = Date.now() + CHILD_TERMINATION_GRACE_MS + 1000;
        while (!(await exists(childAckFile)) && Date.now() < deadline) await sleep(50);
        console.error(JSON.stringify({
          event: "AVANTIQO_CODE_SAFE_LEASE_CHILD_PRE_RELEASE",
          contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
          child_started: true,
          child_termination_acknowledged: await exists(childAckFile),
          endpoint_close_patch_continuing: true,
          provider_execution_submitted: false,
          production_deploy_performed: false,
          secrets_printed: false,
        }));
      }
      return originalFetch(input, init);
    }

    const supabaseOrigin = (() => {
      try { return new URL(String(process.env.NEXT_PUBLIC_SUPABASE_URL || "")).origin; }
      catch { return ""; }
    })();
    const runpodRead = isRunpodSafeLeaseReadRequest(input, init);
    const supabaseSafeRequest = Boolean(supabaseOrigin) &&
      isSupabaseCleanupRetryRequest(input, init, supabaseOrigin);
    if (!runpodRead && !supabaseSafeRequest) {
      return originalFetch(input, init);
    }

    const maxAttempts = runpodRead ? RUNPOD_HEALTH_MAX_ATTEMPTS : SUPABASE_NETWORK_MAX_ATTEMPTS;
    const retryKind = runpodRead ? "RUNPOD_READ" : "SUPABASE_SAFE";
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await originalFetch(input, init);
        if (!isRetryableHttpStatus(response.status) || attempt === maxAttempts - 1) {
          return response;
        }
        lastError = new Error(`${retryKind}_HTTP_${response.status}`);
      } catch (error) {
        lastError = error;
        if (!isTransientNetworkError(error) || attempt === maxAttempts - 1) {
          throw error;
        }
      }

      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_SAFE_LEASE_TRANSIENT_RETRY",
        contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
        retry_kind: retryKind,
        attempt: attempt + 1,
        max_attempts: maxAttempts,
        reason: String(lastError?.message || lastError).slice(0, 180),
        provider_execution_submitted: false,
        endpoint_mutation_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }));
      await sleep(boundedRetryDelayMs(attempt));
    }

    throw lastError || new Error(`CODE_AI_SAFE_LEASE_${retryKind}_RETRY_EXHAUSTED`);
  };

  const split = process.argv.indexOf("--");
  if (split < 0 || process.argv.length <= split + 1) {
    throw new Error("CODE_AI_CERTIFICATION_COMMAND_REQUIRED_AFTER_DOUBLE_DASH");
  }

  const control = process.argv.slice(2, split);
  const command = process.argv.slice(split + 1);
  process.argv = [
    process.argv[0],
    process.argv[1],
    ...control,
    "--",
    process.execPath,
    "scripts/run-code-ai-safe-lease-child-guard-local.mjs",
    "--",
    ...command,
  ];

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_SAFE_LEASE_RESILIENCE_ACTIVE",
    contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
    runpod_health_max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,
    runpod_management_read_retry_enabled: true,
    supabase_distributed_lease_retry_enabled: true,
    provider_post_retries_forbidden: true,
    child_guard_enabled: true,
    child_pre_release_handshake: true,
    shared_safe_lease_code_lane_inert_peer_isolation: true,
    shared_safe_lease_runtime_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  await import("./run-avantiqo-runpod-safe-lease-v2-local.mjs");
}
