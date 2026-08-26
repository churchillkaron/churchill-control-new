import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

function insertBeforeRequired(source, marker, insertion, idempotencyMarker, label) {
  if (source.includes(idempotencyMarker)) return source;
  if (!source.includes(marker)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(marker, `${insertion}${marker}`);
}

async function patchFile(path, patcher) {
  const source = await readFile(path, "utf8");
  const updated = patcher(source);
  if (updated !== source) await writeFile(path, updated, "utf8");
}

await patchFile("lib/code/runtime/CodeAICertificationResiliencePolicy.js", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    'export const CHILD_TERMINATION_GRACE_MS = 4000;\n',
    'export const CHILD_TERMINATION_GRACE_MS = 4000;\nexport const CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS = 8 * 60_000;\nexport const CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT = 1;\nexport const CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS = 45_000;\n',
    "resilience constants",
  );
  if (!source.includes("export function shouldRecoverStaleQueuedPlannerJob")) {
    source += `\n\nconst CODE_PLANNER_QUEUED_STATUSES = new Set(["queued", "in_queue", "pending", "submitted"]);\n\nfunction finite(value, fallback = 0) {\n  const number = Number(value);\n  return Number.isFinite(number) ? number : fallback;\n}\n\nexport function codePlannerPendingAgeMs(startedAt, nowMs = Date.now()) {\n  const started = Date.parse(text(startedAt));\n  const now = finite(nowMs, Date.now());\n  return Number.isFinite(started) ? Math.max(0, now - started) : 0;\n}\n\nexport function staleCodePlannerQueueRecoveryExhausted({\n  provider = "",\n  providerStatus = "",\n  startedAt = null,\n  nowMs = Date.now(),\n  recoveryCount = 0,\n} = {}) {\n  return (\n    text(provider).toLowerCase() === "avantiqo-code" &&\n    CODE_PLANNER_QUEUED_STATUSES.has(text(providerStatus).toLowerCase()) &&\n    codePlannerPendingAgeMs(startedAt, nowMs) >= CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS &&\n    finite(recoveryCount, 0) >= CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT\n  );\n}\n\nexport function shouldRecoverStaleQueuedPlannerJob({\n  provider = "",\n  providerStatus = "",\n  startedAt = null,\n  nowMs = Date.now(),\n  recoveryCount = 0,\n  health = null,\n} = {}) {\n  if (text(provider).toLowerCase() !== "avantiqo-code") return false;\n  if (!CODE_PLANNER_QUEUED_STATUSES.has(text(providerStatus).toLowerCase())) return false;\n  if (codePlannerPendingAgeMs(startedAt, nowMs) < CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS) return false;\n  if (finite(recoveryCount, 0) >= CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT) return false;\n  if (!health || typeof health !== "object") return false;\n  const jobs = health.jobs || {};\n  const workers = health.workers || {};\n  if (finite(jobs.in_progress ?? jobs.inProgress, 0) > 0) return false;\n  if (finite(workers.initializing, 0) > 0) return false;\n  return true;\n}\n`;
  }
  return source;
});

await patchFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    'const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V1";\n',
    'import {\n  CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS,\n  CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,\n  shouldRecoverStaleQueuedPlannerJob,\n  staleCodePlannerQueueRecoveryExhausted,\n} from "./CodeAICertificationResiliencePolicy.js";\n\nconst CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V1";\n',
    "planner resilience import",
  );
  source = replaceRequired(
    source,
    'const MAX_POLL_WINDOW_MS = 60000;\n',
    'const MAX_POLL_WINDOW_MS = 60000;\nconst RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";\n',
    "planner runpod queue base",
  );
  source = replaceRequired(
    source,
    'function pendingDescriptor(result = {}, executionInput = {}) {\n',
    'function pendingDescriptor(result = {}, executionInput = {}, recovery = {}) {\n',
    "pending descriptor recovery input",
  );
  source = replaceRequired(
    source,
    '    model: text(result.model) || null,\n  };\n}\n\nfunction assertPendingDescriptor',
    '    model: text(result.model) || null,\n    stale_queue_recovery_count: Math.max(0, number(recovery.stale_queue_recovery_count, 0)),\n    recovered_from_provider_job_id: text(recovery.recovered_from_provider_job_id) || null,\n  };\n}\n\nfunction assertPendingDescriptor',
    "pending descriptor recovery fields",
  );
  source = replaceRequired(
    source,
    '  return pending;\n}\n\nasync function settleOnce',
    '  return {\n    ...pending,\n    stale_queue_recovery_count: Math.max(0, number(pending.stale_queue_recovery_count, 0)),\n    recovered_from_provider_job_id: text(pending.recovered_from_provider_job_id) || null,\n  };\n}\n\nasync function settleOnce',
    "pending descriptor normalization",
  );

  const helperInsertion = `async function runpodQueueJson(endpointId, pathname, options = {}) {\n  const apiKey = text(process.env.RUNPOD_API_KEY);\n  if (!apiKey) throw new Error("RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED");\n  const response = await fetch(\n    \`${RUNPOD_QUEUE_BASE}/\${encodeURIComponent(endpointId)}\${pathname}\`,\n    {\n      method: options.method || "GET",\n      headers: {\n        Authorization: \`Bearer \${apiKey}\`,\n        Accept: "application/json",\n        ...(options.body ? { "Content-Type": "application/json" } : {}),\n      },\n      body: options.body ? JSON.stringify(options.body) : undefined,\n      signal: AbortSignal.timeout(options.timeout_ms || 30_000),\n    },\n  );\n  const body = await responseJson(response);\n  if (!response.ok) {\n    throw new Error(\`CODE_AI_PLANNER_RUNPOD_QUEUE_HTTP_\${response.status}:\${text(body?.error || body?.message) || "UNKNOWN"}\`);\n  }\n  return body;\n}\n\nfunction runpodQueueHealthSummary(body = {}) {\n  const jobs = object(body.jobs);\n  const workers = object(body.workers);\n  return {\n    jobs: {\n      in_queue: number(jobs.inQueue ?? jobs.in_queue, 0),\n      in_progress: number(jobs.inProgress ?? jobs.in_progress, 0),\n    },\n    workers: {\n      idle: number(workers.idle, 0),\n      initializing: number(workers.initializing, 0),\n      ready: number(workers.ready, 0),\n      running: number(workers.running, 0),\n      throttled: number(workers.throttled, 0),\n      unhealthy: number(workers.unhealthy, 0),\n    },\n  };\n}\n\nasync function recoverStaleQueuedPlannerExecution({\n  serviceRuntime,\n  pending,\n  executionInput,\n  result,\n}) {\n  if (!localCodePlannerReview(executionInput)) return null;\n  if (text(pending.provider) !== OWNED_PROVIDER) return null;\n\n  const providerStatus = text(result?.provider_status || result?.output?.status).toLowerCase();\n  const recoveryCount = Math.max(0, number(pending.stale_queue_recovery_count, 0));\n  if (staleCodePlannerQueueRecoveryExhausted({\n    provider: pending.provider,\n    providerStatus,\n    startedAt: pending.started_at,\n    recoveryCount,\n  })) {\n    throw new Error(\n      \`CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_EXHAUSTED:\${pending.provider_job_id}:\${recoveryCount}\`,\n    );\n  }\n\n  const endpointId = text(\n    pending.provider_endpoint_id ||\n    executionInput?.metadata?.provider_endpoint_id ||\n    process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID,\n  );\n  if (!endpointId) return null;\n\n  const health = runpodQueueHealthSummary(\n    await runpodQueueJson(endpointId, "/health"),\n  );\n  if (!shouldRecoverStaleQueuedPlannerJob({\n    provider: pending.provider,\n    providerStatus,\n    startedAt: pending.started_at,\n    recoveryCount,\n    health,\n  })) {\n    return null;\n  }\n\n  await runpodQueueJson(\n    endpointId,\n    \`/cancel/\${encodeURIComponent(pending.provider_job_id)}\`,\n    { method: "POST" },\n  );\n\n  const cancelDeadline = Date.now() + CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS;\n  let canceledSettlement = null;\n  while (Date.now() < cancelDeadline) {\n    await delay(1000);\n    canceledSettlement = await settleOnce(serviceRuntime, pending);\n    if (!canceledSettlement?.pending) break;\n  }\n  if (!canceledSettlement || canceledSettlement.pending) {\n    throw new Error(\n      \`CODE_AI_PLANNER_STALE_QUEUE_CANCEL_NOT_TERMINAL:\${pending.provider_job_id}\`,\n    );\n  }\n\n  if (!canceledSettlement.failed) {\n    const completedOutput = plannerResultText(canceledSettlement);\n    if (!completedOutput) {\n      throw new Error("CODE_AI_PLANNER_STALE_QUEUE_CANCEL_COMPLETED_OUTPUT_REQUIRED");\n    }\n    return {\n      success: true,\n      pending: false,\n      result: canceledSettlement,\n      output: completedOutput,\n      pending_execution: null,\n      stale_queue_recovery: {\n        canceled_provider_job_id: pending.provider_job_id,\n        replacement_submitted: false,\n        completed_during_cancel_settlement: true,\n      },\n    };\n  }\n\n  let replacementInput = executionInput;\n  const endpointPreflight = await assertLocalCodeEndpointAcceptingWork(replacementInput);\n  if (endpointPreflight) {\n    replacementInput = {\n      ...replacementInput,\n      metadata: {\n        ...object(replacementInput.metadata),\n        code_endpoint_preflight: endpointPreflight,\n        stale_queue_recovery_count: recoveryCount + 1,\n        recovered_from_provider_job_id: pending.provider_job_id,\n      },\n    };\n  }\n\n  const replacement = await serviceRuntime.execute(replacementInput);\n  if (!replacement?.success) throw new Error("CODE_AI_PLANNER_STALE_QUEUE_REPLACEMENT_FAILED");\n  if (!replacement?.pending) {\n    const output = plannerResultText(replacement);\n    if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");\n    return {\n      success: true,\n      pending: false,\n      result: replacement,\n      output,\n      pending_execution: null,\n      stale_queue_recovery: {\n        canceled_provider_job_id: pending.provider_job_id,\n        replacement_submitted: true,\n        replacement_provider_job_id: null,\n      },\n    };\n  }\n\n  const replacementPending = pendingDescriptor(replacement, replacementInput, {\n    stale_queue_recovery_count: recoveryCount + 1,\n    recovered_from_provider_job_id: pending.provider_job_id,\n  });\n  return {\n    success: true,\n    pending: true,\n    result: replacement,\n    output: null,\n    pending_execution: replacementPending,\n    stale_queue_recovery: {\n      canceled_provider_job_id: pending.provider_job_id,\n      replacement_submitted: true,\n      replacement_provider_job_id: replacementPending.provider_job_id,\n      recovery_count: replacementPending.stale_queue_recovery_count,\n      recovery_limit: CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,\n    },\n  };\n}\n\n`;
  source = insertBeforeRequired(
    source,
    'export function plannerResultText(result = {}) {\n',
    helperInsertion,
    'async function recoverStaleQueuedPlannerExecution',
    "stale planner recovery helper",
  );

  source = replaceRequired(
    source,
    '  return {\n    success: true,\n    pending: true,\n    result,\n    output: null,\n    pending_execution: pending,\n  };\n}\n\nexport const CodeAIPlannerExecutionRuntime',
    '  const staleRecovery = await recoverStaleQueuedPlannerExecution({\n    serviceRuntime,\n    pending,\n    executionInput,\n    result,\n  });\n  if (staleRecovery) return staleRecovery;\n\n  return {\n    success: true,\n    pending: true,\n    result,\n    output: null,\n    pending_execution: pending,\n  };\n}\n\nexport const CodeAIPlannerExecutionRuntime',
    "stale recovery invocation",
  );
  return source;
});

await patchFile("lib/code/runtime/CodeAIAutonomousRuntime.js", (input) => {
  let source = input;
  const oldRecovery = `function recoveredPlannerIterations(state) {\n  const executionKeys = new Set();\n  let anonymousCompleted = 0;\n  for (const entry of list(state?.evidence)) {\n    const kind = text(entry?.kind, 120);\n    if (kind !== "autonomous_planner" && kind !== "autonomous_planner_pending") continue;\n    const usageId = text(entry?.usage_id, 240);\n    const providerJobId = text(entry?.provider_job_id, 240);\n    if (usageId) executionKeys.add(\`usage:\${usageId}\`);\n    else if (providerJobId) executionKeys.add(\`job:\${providerJobId}\`);\n    else if (kind === "autonomous_planner") anonymousCompleted += 1;\n  }\n  return executionKeys.size + anonymousCompleted;\n}\n`;
  const newRecovery = `function recoveredPlannerIterations(state) {\n  const logicalIterations = new Set();\n  const legacyExecutionKeys = new Set();\n  let anonymousCompleted = 0;\n  for (const entry of list(state?.evidence)) {\n    const kind = text(entry?.kind, 120);\n    if (kind !== "autonomous_planner" && kind !== "autonomous_planner_pending") continue;\n    const iteration = nonNegativeInteger(entry?.iteration);\n    if (iteration > 0) {\n      logicalIterations.add(iteration);\n      continue;\n    }\n    const usageId = text(entry?.usage_id, 240);\n    const providerJobId = text(entry?.provider_job_id, 240);\n    if (usageId) legacyExecutionKeys.add(\`usage:\${usageId}\`);\n    else if (providerJobId) legacyExecutionKeys.add(\`job:\${providerJobId}\`);\n    else if (kind === "autonomous_planner") anonymousCompleted += 1;\n  }\n  return logicalIterations.size + legacyExecutionKeys.size + anonymousCompleted;\n}\n`;
  source = replaceRequired(source, oldRecovery, newRecovery, "logical planner iteration recovery");
  source = replaceRequired(
    source,
    '        provider_job_id: planned.pending_execution?.provider_job_id || null,\n        usage_id: planned.pending_execution?.usage_id || null,\n      });',
    '        provider_job_id: planned.pending_execution?.provider_job_id || null,\n        usage_id: planned.pending_execution?.usage_id || null,\n        stale_queue_recovery_count:\n          Number(planned.pending_execution?.stale_queue_recovery_count || 0),\n        recovered_from_provider_job_id:\n          planned.pending_execution?.recovered_from_provider_job_id || null,\n      });',
    "planner pending recovery evidence",
  );
  return source;
});

await patchFile("scripts/settle-code-ai-planner-certification-pending-local.mjs", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    'import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";\n',
    'import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";\nimport {\n  CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS,\n  shouldRecoverStaleQueuedPlannerJob,\n} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";\n',
    "settlement stale policy import",
  );
  source = replaceRequired(
    source,
    'const MIN_ORPHAN_AGE_MS = 60 * 60_000;\n',
    'const MIN_ORPHAN_AGE_MS = CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS;\n',
    "orphan minimum age",
  );
  source = replaceRequired(
    source,
    'async function runpodRequest(url, key) {\n  const response = await fetch(url, {\n    headers: {',
    'async function runpodRequest(url, key, options = {}) {\n  const response = await fetch(url, {\n    method: options.method || "GET",\n    headers: {',
    "settlement runpod method",
  );
  source = replaceRequired(
    source,
    'let totalTransientStatusErrors = 0;\n\nif (!endpointResolution.found) {',
    `let totalTransientStatusErrors = 0;\nlet staleQueuedJobCanceled = false;\n\nif (endpointResolution.found && usageStatusBefore === "PENDING") {\n  const healthProbe = await runpodRequest(\n    \`${RUNPOD_SERVERLESS}/\${encodeURIComponent(endpointResolution.endpoint_id)}/health\`,\n    codeApiKey,\n  );\n  const health = healthProbe.response.ok ? healthSummary(healthProbe.body) : null;\n  if (shouldRecoverStaleQueuedPlannerJob({\n    provider: PROVIDER,\n    providerStatus: endpointResolution.provider_status,\n    startedAt: usageBefore.created_at,\n    recoveryCount: 0,\n    health,\n  })) {\n    const cancel = await runpodRequest(\n      \`${RUNPOD_SERVERLESS}/\${encodeURIComponent(endpointResolution.endpoint_id)}/cancel/\${encodeURIComponent(PROVIDER_JOB_ID)}\`,\n      codeApiKey,\n      { method: "POST" },\n    );\n    if (!cancel.response.ok) {\n      throw new Error(\n        \`AVANTIQO_CODE_PLANNER_PENDING_STALE_CANCEL_FAILED:\${cancel.response.status}\`,\n      );\n    }\n    staleQueuedJobCanceled = true;\n    console.log(JSON.stringify({\n      event: "AVANTIQO_CODE_PLANNER_PENDING_STALE_QUEUE_CANCELED",\n      contract: CONTRACT,\n      usage_id: USAGE_ID,\n      provider_job_id: PROVIDER_JOB_ID,\n      endpoint_id: endpointResolution.endpoint_id,\n      provider_status_before_cancel: endpointResolution.provider_status,\n      usage_age_ms: usageAgeMs,\n      exact_job_cancel_only: true,\n      blind_queue_purge_performed: false,\n      new_provider_execution_submitted: false,\n      service_reenabled: false,\n      secrets_printed: false,\n    }));\n  }\n}\n\nif (!endpointResolution.found) {`,
    "settlement exact stale cancel",
  );
  source = replaceRequired(
    source,
    '  orphaned_job_reconciled: orphanedJobReconciled,\n  usage_status: finalStatus,',
    '  orphaned_job_reconciled: orphanedJobReconciled,\n  stale_queued_job_canceled: staleQueuedJobCanceled,\n  usage_status: finalStatus,',
    "settlement stale cancel evidence",
  );
  return source;
});

await patchFile("scripts/code-ai-certification-resilience-selftest.mjs", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    '  CHILD_TERMINATION_GRACE_MS,\n  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,\n',
    '  CHILD_TERMINATION_GRACE_MS,\n  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,\n  CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS,\n  CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,\n',
    "resilience selftest stale constants",
  );
  source = replaceRequired(
    source,
    '  isRunpodHealthRequest,\n  isSupabaseCleanupRetryRequest,\n  isTransientNetworkError,\n',
    '  isRunpodHealthRequest,\n  isSupabaseCleanupRetryRequest,\n  isTransientNetworkError,\n  shouldRecoverStaleQueuedPlannerJob,\n  staleCodePlannerQueueRecoveryExhausted,\n',
    "resilience selftest stale functions",
  );
  source = replaceRequired(
    source,
    'assert.ok(boundedRetryDelayMs(0) >= 1 && boundedRetryDelayMs(20) <= 2000);\n',
    `assert.ok(boundedRetryDelayMs(0) >= 1 && boundedRetryDelayMs(20) <= 2000);\nassert.equal(CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT, 1);\nassert.ok(CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS >= 5 * 60_000);\nconst stalledHealth = { jobs: { in_queue: 1, in_progress: 0 }, workers: { initializing: 0 } };\nconst oldStartedAt = new Date(Date.now() - CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS - 1000).toISOString();\nassert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 0, health: stalledHealth }), true);\nassert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "processing", startedAt: oldStartedAt, recoveryCount: 0, health: stalledHealth }), false);\nassert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 0, health: { jobs: { in_progress: 1 }, workers: { initializing: 0 } } }), false);\nassert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 0, health: { jobs: { in_progress: 0 }, workers: { initializing: 1 } } }), false);\nassert.equal(staleCodePlannerQueueRecoveryExhausted({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 1 }), true);\n`,
    "resilience selftest stale decisions",
  );
  source = replaceRequired(
    source,
    'const [leaseShim, childGuard, cleanupShim, capacityRunner, packageJson] = await Promise.all([\n',
    'const [leaseShim, childGuard, cleanupShim, capacityRunner, packageJson, plannerExecution, autonomousRuntime, pendingSettlement] = await Promise.all([\n',
    "resilience selftest source list",
  );
  source = replaceRequired(
    source,
    '  readFile("package.json", "utf8"),\n]);',
    '  readFile("package.json", "utf8"),\n  readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8"),\n  readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8"),\n  readFile("scripts/settle-code-ai-planner-certification-pending-local.mjs", "utf8"),\n]);',
    "resilience selftest extra sources",
  );
  source = replaceRequired(
    source,
    'assert.match(packageJson, /code-ai-certification-resilience-selftest\\.mjs/);\n',
    `assert.match(packageJson, /code-ai-certification-resilience-selftest\\.mjs/);\nassert.match(plannerExecution, /recoverStaleQueuedPlannerExecution/);\nassert.match(plannerExecution, /\\/cancel\\//);\nassert.match(plannerExecution, /CODE_AI_PLANNER_STALE_QUEUE_CANCEL_NOT_TERMINAL/);\nassert.match(plannerExecution, /stale_queue_recovery_count/);\nassert.match(autonomousRuntime, /const logicalIterations = new Set\\(\\)/);\nassert.match(autonomousRuntime, /stale_queue_recovery_count/);\nassert.match(pendingSettlement, /AVANTIQO_CODE_PLANNER_PENDING_STALE_QUEUE_CANCELED/);\nassert.match(pendingSettlement, /exact_job_cancel_only: true/);\nassert.doesNotMatch(pendingSettlement, /purge-queue/);\n`,
    "resilience selftest wiring assertions",
  );
  source = replaceRequired(
    source,
    '    shared_safe_lease_runtime_reused_without_source_rewrite: true,\n',
    '    shared_safe_lease_runtime_reused_without_source_rewrite: true,\n    stale_queued_provider_job_detected_by_age_and_health: true,\n    stale_queued_provider_job_exact_cancel_before_replacement: true,\n    stale_replacement_is_bounded_to_one: true,\n    logical_planner_iteration_deduplicates_replacement_job_ids: true,\n    stale_pending_certification_reservation_cleanup_supported: true,\n',
    "resilience selftest output evidence",
  );
  return source;
});

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_STALE_PLANNER_QUEUE_CONVERGENCE_PATCH_V1",
  production_deploy_performed: false,
  provider_execution_submitted: false,
  runpod_lease_opened: false,
}, null, 2));
