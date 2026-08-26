import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const policyPath = "lib/code/runtime/CodeAICertificationResiliencePolicy.js";
let policy = await readFile(policyPath, "utf8");
if (!policy.includes("isRunpodSafeLeaseReadRequest")) {
  policy = replaceRequired(
    policy,
    `export function isRunpodHealthRequest(input, init = {}) {\n  let url;\n  try {\n    url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);\n  } catch {\n    return false;\n  }\n  const method = text(init?.method || input?.method || "GET").toUpperCase();\n  return method === "GET" && url.hostname === "api.runpod.ai" && url.pathname.endsWith("/health");\n}\n`,
    `export function isRunpodHealthRequest(input, init = {}) {\n  let url;\n  try {\n    url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);\n  } catch {\n    return false;\n  }\n  const method = text(init?.method || input?.method || "GET").toUpperCase();\n  return method === "GET" && url.hostname === "api.runpod.ai" && url.pathname.endsWith("/health");\n}\n\nexport function isRunpodSafeLeaseReadRequest(input, init = {}) {\n  let url;\n  try {\n    url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);\n  } catch {\n    return false;\n  }\n  const method = text(init?.method || input?.method || "GET").toUpperCase();\n  if (method !== "GET") return false;\n  if (url.hostname === "api.runpod.ai" && url.pathname.endsWith("/health")) return true;\n  return url.hostname === "rest.runpod.io" && url.pathname.startsWith("/v1/endpoints");\n}\n`,
    "policy-runpod-safe-read",
  );
}
if (!policy.includes("failedCodeSafeLeaseCoversUsage")) {
  policy += `\nexport function failedCodeSafeLeaseCoversUsage({\n  lease = null,\n  providerEndpointId = "",\n  usageCreatedAt = null,\n} = {}) {\n  if (!lease || typeof lease !== "object") return false;\n  if (text(lease.distributed_contract) !== "AVANTIQO_CODE_DISTRIBUTED_RUNPOD_LEASE_V1") return false;\n  if (text(lease.contract) !== "AVANTIQO_RUNPOD_SAFE_LEASE_V2") return false;\n  if (text(lease.lane).toLowerCase() !== "code") return false;\n  if (text(lease.state).toUpperCase() !== "FAILED") return false;\n  if (!text(lease.owner_request_id) || !text(lease.release_reason)) return false;\n  if (!text(providerEndpointId) || text(lease.endpoint_id) !== text(providerEndpointId)) return false;\n\n  const acquiredAt = Date.parse(text(lease.acquired_at));\n  const releasedAt = Date.parse(text(lease.released_at));\n  const expiresAt = Date.parse(text(lease.expires_at));\n  const usageAt = Date.parse(text(usageCreatedAt));\n  if (![acquiredAt, releasedAt, expiresAt, usageAt].every(Number.isFinite)) return false;\n  if (usageAt < acquiredAt || usageAt > releasedAt) return false;\n  if (releasedAt < acquiredAt || releasedAt > expiresAt + 60_000) return false;\n  return true;\n}\n`;
}
await writeFile(policyPath, policy, "utf8");

const leaseShimPath = "scripts/run-code-ai-runpod-safe-lease-resilient-local.mjs";
let leaseShim = await readFile(leaseShimPath, "utf8");
leaseShim = replaceRequired(
  leaseShim,
  `  RUNPOD_HEALTH_MAX_ATTEMPTS,\n  boundedRetryDelayMs,\n  isRetryableHttpStatus,\n  isRunpodHealthRequest,\n  isTransientNetworkError,\n`,
  `  RUNPOD_HEALTH_MAX_ATTEMPTS,\n  SUPABASE_NETWORK_MAX_ATTEMPTS,\n  boundedRetryDelayMs,\n  isRetryableHttpStatus,\n  isRunpodSafeLeaseReadRequest,\n  isSupabaseCleanupRetryRequest,\n  isTransientNetworkError,\n`,
  "lease-shim-imports",
);
leaseShim = replaceRequired(
  leaseShim,
  `  if (!isRunpodHealthRequest(input, init)) {\n    return originalFetch(input, init);\n  }\n\n  let lastError = null;\n  for (let attempt = 0; attempt < RUNPOD_HEALTH_MAX_ATTEMPTS; attempt += 1) {\n    try {\n      const response = await originalFetch(input, init);\n      if (!isRetryableHttpStatus(response.status) || attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1) {\n        return response;\n      }\n      lastError = new Error(\`RUNPOD_HEALTH_HTTP_\${response.status}\`);\n    } catch (error) {\n      lastError = error;\n      if (!isTransientNetworkError(error) || attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1) {\n        throw error;\n      }\n    }\n\n    console.log(JSON.stringify({\n      event: "AVANTIQO_CODE_SAFE_LEASE_HEALTH_RETRY",\n      contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,\n      attempt: attempt + 1,\n      max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,\n      reason: String(lastError?.message || lastError).slice(0, 180),\n      provider_execution_submitted: false,\n      endpoint_mutation_performed: false,\n      production_deploy_performed: false,\n      secrets_printed: false,\n    }));\n    await sleep(boundedRetryDelayMs(attempt));\n  }\n\n  throw lastError || new Error("CODE_AI_RUNPOD_HEALTH_RETRY_EXHAUSTED");\n`,
  `  const supabaseOrigin = (() => {\n    try { return new URL(String(process.env.NEXT_PUBLIC_SUPABASE_URL || "")).origin; }\n    catch { return ""; }\n  })();\n  const runpodRead = isRunpodSafeLeaseReadRequest(input, init);\n  const supabaseSafeRequest = Boolean(supabaseOrigin) &&\n    isSupabaseCleanupRetryRequest(input, init, supabaseOrigin);\n  if (!runpodRead && !supabaseSafeRequest) {\n    return originalFetch(input, init);\n  }\n\n  const maxAttempts = runpodRead ? RUNPOD_HEALTH_MAX_ATTEMPTS : SUPABASE_NETWORK_MAX_ATTEMPTS;\n  const retryKind = runpodRead ? "RUNPOD_READ" : "SUPABASE_SAFE";\n  let lastError = null;\n  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {\n    try {\n      const response = await originalFetch(input, init);\n      if (!isRetryableHttpStatus(response.status) || attempt === maxAttempts - 1) {\n        return response;\n      }\n      lastError = new Error(\`\${retryKind}_HTTP_\${response.status}\`);\n    } catch (error) {\n      lastError = error;\n      if (!isTransientNetworkError(error) || attempt === maxAttempts - 1) {\n        throw error;\n      }\n    }\n\n    console.log(JSON.stringify({\n      event: "AVANTIQO_CODE_SAFE_LEASE_TRANSIENT_RETRY",\n      contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,\n      retry_kind: retryKind,\n      attempt: attempt + 1,\n      max_attempts: maxAttempts,\n      reason: String(lastError?.message || lastError).slice(0, 180),\n      provider_execution_submitted: false,\n      endpoint_mutation_performed: false,\n      production_deploy_performed: false,\n      secrets_printed: false,\n    }));\n    await sleep(boundedRetryDelayMs(attempt));\n  }\n\n  throw lastError || new Error(\`CODE_AI_SAFE_LEASE_\${retryKind}_RETRY_EXHAUSTED\`);\n`,
  "lease-shim-retry-block",
);
leaseShim = replaceRequired(
  leaseShim,
  `  runpod_health_max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,\n  child_guard_enabled: true,\n`,
  `  runpod_health_max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,\n  runpod_management_read_retry_enabled: true,\n  supabase_distributed_lease_retry_enabled: true,\n  provider_post_retries_forbidden: true,\n  child_guard_enabled: true,\n`,
  "lease-shim-event",
);
await writeFile(leaseShimPath, leaseShim, "utf8");

const settlementPath = "scripts/settle-code-ai-planner-certification-pending-local.mjs";
let settlement = await readFile(settlementPath, "utf8");
settlement = replaceRequired(
  settlement,
  `  CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS,\n  shouldRecoverStaleQueuedPlannerJob,\n`,
  `  CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS,\n  failedCodeSafeLeaseCoversUsage,\n  shouldRecoverStaleQueuedPlannerJob,\n`,
  "settlement-import",
);
settlement = replaceRequired(
  settlement,
  `const usageAgeMs = Number.isFinite(usageCreatedAtMs)\n  ? Math.max(0, Date.now() - usageCreatedAtMs)\n  : 0;\n`,
  `const usageAgeMs = Number.isFinite(usageCreatedAtMs)\n  ? Math.max(0, Date.now() - usageCreatedAtMs)\n  : 0;\nconst usageProviderEndpointId = text(\n  usageBefore.metadata?.provider_endpoint_id ||\n  usageBefore.metadata?.code_endpoint_preflight?.endpoint_id,\n);\nconst sameRunFailedSafeLeaseEvidence = Boolean(explicitUsageId && explicitProviderJobId) &&\n  failedCodeSafeLeaseCoversUsage({\n    lease: organizationService.metadata?.runpod_safe_lease_v2,\n    providerEndpointId: usageProviderEndpointId,\n    usageCreatedAt: usageBefore.created_at,\n  });\n`,
  "settlement-safe-lease-evidence",
);
settlement = replaceRequired(
  settlement,
  `  reservation_customer_price: reservedAmount,\n  new_provider_execution_submitted: false,\n`,
  `  reservation_customer_price: reservedAmount,\n  same_run_failed_safe_lease_evidence: sameRunFailedSafeLeaseEvidence,\n  new_provider_execution_submitted: false,\n`,
  "settlement-start-event",
);
settlement = replaceRequired(
  settlement,
  `  if (usageAgeMs < MIN_ORPHAN_AGE_MS) {\n    throw new Error(\n      \`AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_MINIMUM_AGE_REQUIRED:\${usageAgeMs}:\${MIN_ORPHAN_AGE_MS}\`,\n    );\n  }\n`,
  `  if (sameRunFailedSafeLeaseEvidence) {\n    console.log(JSON.stringify({\n      event: "AVANTIQO_CODE_PLANNER_PENDING_SAFE_LEASE_ORPHAN_PROVEN",\n      contract: CONTRACT,\n      usage_id: USAGE_ID,\n      provider_job_id: PROVIDER_JOB_ID,\n      provider_endpoint_id: usageProviderEndpointId,\n      usage_age_ms: usageAgeMs,\n      generic_minimum_orphan_age_ms: MIN_ORPHAN_AGE_MS,\n      minimum_age_waived_for_same_failed_safe_lease: usageAgeMs < MIN_ORPHAN_AGE_MS,\n      all_current_endpoints_returned_404: true,\n      explicit_target: true,\n      new_provider_execution_submitted: false,\n      service_reenabled: false,\n      secrets_printed: false,\n    }));\n  }\n  if (usageAgeMs < MIN_ORPHAN_AGE_MS && !sameRunFailedSafeLeaseEvidence) {\n    throw new Error(\n      \`AVANTIQO_CODE_PLANNER_PENDING_ORPHAN_MINIMUM_AGE_REQUIRED:\${usageAgeMs}:\${MIN_ORPHAN_AGE_MS}\`,\n    );\n  }\n`,
  "settlement-orphan-age",
);
settlement = replaceRequired(
  settlement,
  `        minimum_orphan_age_ms: MIN_ORPHAN_AGE_MS,\n        observed_usage_age_ms: usageAgeMs,\n`,
  `        minimum_orphan_age_ms: MIN_ORPHAN_AGE_MS,\n        observed_usage_age_ms: usageAgeMs,\n        same_run_failed_safe_lease_evidence: sameRunFailedSafeLeaseEvidence,\n        minimum_orphan_age_waived: usageAgeMs < MIN_ORPHAN_AGE_MS && sameRunFailedSafeLeaseEvidence,\n`,
  "settlement-orphan-metadata",
);
await writeFile(settlementPath, settlement, "utf8");

const selftestPath = "scripts/code-ai-certification-resilience-selftest.mjs";
let selftest = await readFile(selftestPath, "utf8");
selftest = replaceRequired(
  selftest,
  `  boundedRetryDelayMs,\n  isRunpodHealthRequest,\n  isSupabaseCleanupRetryRequest,\n`,
  `  boundedRetryDelayMs,\n  failedCodeSafeLeaseCoversUsage,\n  isRunpodHealthRequest,\n  isRunpodSafeLeaseReadRequest,\n  isSupabaseCleanupRetryRequest,\n`,
  "selftest-import",
);
selftest = replaceRequired(
  selftest,
  `assert.equal(isRunpodHealthRequest("https://rest.runpod.io/v1/endpoints", { method: "GET" }), false);\n`,
  `assert.equal(isRunpodHealthRequest("https://rest.runpod.io/v1/endpoints", { method: "GET" }), false);\nassert.equal(isRunpodSafeLeaseReadRequest("https://api.runpod.ai/v2/code-endpoint/health"), true);\nassert.equal(isRunpodSafeLeaseReadRequest("https://rest.runpod.io/v1/endpoints?includeWorkers=true", { method: "GET" }), true);\nassert.equal(isRunpodSafeLeaseReadRequest("https://rest.runpod.io/v1/endpoints/code", { method: "PATCH" }), false);\n`,
  "selftest-runpod-safe-read",
);
if (!selftest.includes("sameFailedLease")) {
  selftest = replaceRequired(
    selftest,
    `assert.equal(isSupabaseCleanupRetryRequest("https://other.supabase.co/rest/v1/organization_services", { method: "PATCH" }, supabaseOrigin), false);\n`,
    `assert.equal(isSupabaseCleanupRetryRequest("https://other.supabase.co/rest/v1/organization_services", { method: "PATCH" }, supabaseOrigin), false);\n\nconst sameFailedLease = {\n  distributed_contract: "AVANTIQO_CODE_DISTRIBUTED_RUNPOD_LEASE_V1",\n  contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",\n  lane: "code",\n  state: "FAILED",\n  endpoint_id: "code-endpoint",\n  owner_request_id: "owner-1",\n  acquired_at: "2026-08-26T13:54:32.681Z",\n  released_at: "2026-08-26T13:59:58.426Z",\n  expires_at: "2026-08-26T14:24:32.681Z",\n  release_reason: "fetch failed",\n};\nassert.equal(failedCodeSafeLeaseCoversUsage({ lease: sameFailedLease, providerEndpointId: "code-endpoint", usageCreatedAt: "2026-08-26T13:55:35.649Z" }), true);\nassert.equal(failedCodeSafeLeaseCoversUsage({ lease: sameFailedLease, providerEndpointId: "other-endpoint", usageCreatedAt: "2026-08-26T13:55:35.649Z" }), false);\nassert.equal(failedCodeSafeLeaseCoversUsage({ lease: { ...sameFailedLease, state: "ACTIVE" }, providerEndpointId: "code-endpoint", usageCreatedAt: "2026-08-26T13:55:35.649Z" }), false);\nassert.equal(failedCodeSafeLeaseCoversUsage({ lease: sameFailedLease, providerEndpointId: "code-endpoint", usageCreatedAt: "2026-08-26T13:53:35.649Z" }), false);\n`,
    "selftest-safe-lease-window",
  );
}
selftest = replaceRequired(
  selftest,
  `assert.match(leaseShim, /isRunpodHealthRequest/);\n`,
  `assert.match(leaseShim, /isRunpodSafeLeaseReadRequest/);\nassert.match(leaseShim, /isSupabaseCleanupRetryRequest/);\nassert.match(leaseShim, /AVANTIQO_CODE_SAFE_LEASE_TRANSIENT_RETRY/);\nassert.match(leaseShim, /provider_post_retries_forbidden: true/);\n`,
  "selftest-lease-shim-assert",
);
selftest = replaceRequired(
  selftest,
  `assert.match(pendingSettlement, /AVANTIQO_CODE_PLANNER_PENDING_STALE_QUEUE_CANCELED/);\n`,
  `assert.match(pendingSettlement, /AVANTIQO_CODE_PLANNER_PENDING_STALE_QUEUE_CANCELED/);\nassert.match(pendingSettlement, /AVANTIQO_CODE_PLANNER_PENDING_SAFE_LEASE_ORPHAN_PROVEN/);\nassert.match(pendingSettlement, /sameRunFailedSafeLeaseEvidence/);\n`,
  "selftest-settlement-assert",
);
selftest = replaceRequired(
  selftest,
  `    runpod_health_retry_is_narrow_and_bounded: true,\n`,
  `    runpod_health_retry_is_narrow_and_bounded: true,\n    runpod_management_read_retry_is_bounded: true,\n    distributed_code_lease_supabase_retry_is_bounded: true,\n`,
  "selftest-verified-network",
);
selftest = replaceRequired(
  selftest,
  `    stale_pending_certification_reservation_cleanup_supported: true,\n`,
  `    stale_pending_certification_reservation_cleanup_supported: true,\n    failed_safe_lease_orphan_can_settle_without_generic_age_delay: true,\n`,
  "selftest-verified-orphan",
);
await writeFile(selftestPath, selftest, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_CERT_TRANSIENT_ORPHAN_RECOVERY_CONVERGENCE_V1",
  files: [policyPath, leaseShimPath, settlementPath, selftestPath],
  provider_execution_submitted: false,
  wallet_mutation_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
