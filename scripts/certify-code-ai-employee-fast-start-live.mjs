import process from "node:process";
import { register } from "node:module";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

register("./next-alias-loader.mjs", import.meta.url);
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_LIVE_CERTIFICATION_V1";
const ORGANIZATION_ID = String(
  process.argv[2] || process.env.AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID || "",
).trim();
const SERVICE_ID = "ai.code.debug";
const PROVIDER = "avantiqo-code";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const REF = "main";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const VERIFIER = "scripts/code-ai-autonomous-multifile-fixture-test.mjs";
const ALLOWED_FILES = Object.freeze([
  "tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs",
  "tests/fixtures/code-ai-autonomous-multifile/invoice-summary.mjs",
]);
const REASONING_CALL_BUDGET = 4;
const WARM_IDLE_MS = 10 * 60 * 1000;
const POLL_DELAY_MS = 5000;
const MAX_WORKER_WARMING_MS = 90 * 1000;
const MAX_RESUME_CYCLES = 180;
const MAX_CERTIFICATION_RUNTIME_MS = 30 * 60 * 1000;
const REST = "https://rest.runpod.io/v1";
const EXPECTED_MAIN_COMMIT = String(
  process.env.AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT || "",
).trim().toLowerCase();

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function event(name, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_EMPLOYEE_CERT_${name}`,
    at: new Date().toISOString(),
    contract: CONTRACT,
    ...details,
  }));
}

function managementKey() {
  return text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
}

async function runpod(pathname) {
  const key = managementKey();
  if (!key) throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_RUNPOD_MANAGEMENT_KEY_REQUIRED");
  const response = await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_CODE_EMPLOYEE_CERT_RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw, 500) || "UNKNOWN"}`,
    );
  }
  return body || {};
}

async function assertServerlessRestState() {
  const endpoint = await runpod(`/endpoints/${ENDPOINT_ID}`);
  const workersMin = Number(endpoint?.workersMin ?? endpoint?.workers_min ?? 0);
  const workersMax = Number(endpoint?.workersMax ?? endpoint?.workers_max ?? 0);
  if (workersMin !== 0 || workersMax !== 0) {
    throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_SERVERLESS_NOT_RESTING_0_0:${workersMin}:${workersMax}`);
  }
  return { workers_min: workersMin, workers_max: workersMax };
}

async function disableCertificationService() {
  if (!ORGANIZATION_ID) return null;
  const { supabaseAdmin: supabase } = await import("../lib/shared/supabase/admin.js");
  const result = await supabase
    .from("organization_services")
    .update({ usage_enabled: false, billing_enabled: false })
    .eq("organization_id", ORGANIZATION_ID)
    .eq("service_id", SERVICE_ID)
    .select("id,usage_enabled,billing_enabled")
    .maybeSingle();
  if (result.error) throw result.error;
  if (result.data && (result.data.usage_enabled !== false || result.data.billing_enabled !== false)) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_SERVICE_DISABLE_FAILED");
  }
  return result.data || null;
}

let releaseWorkerSession = null;
let certificationSucceeded = false;
let cleanupFailure = null;

try {
  if (!ORGANIZATION_ID) throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_ORGANIZATION_ID_REQUIRED");
  if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_DEVELOPMENT_ENV_REQUIRED");
  }
  if (text(process.env.AVANTIQO_CODE_EMPLOYEE_CERT_SPEND_APPROVED).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_SPEND_APPROVAL_REQUIRED");
  }
  if (text(process.env.AVANTIQO_CODE_WORKER_SESSION_ENABLED).toLowerCase() !== "true") {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WORKER_SESSION_ENABLE_REQUIRED");
  }
  if (!text(process.env.AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID)) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WORKER_CONTROL_ORGANIZATION_REQUIRED");
  }
  if (text(process.env.AVANTIQO_CODE_WORKER_SESSION_SECRET).length < 32) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WORKER_SESSION_SECRET_REQUIRED");
  }
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_MAIN_COMMIT)) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_EXPECTED_MAIN_COMMIT_REQUIRED");
  }

  process.env.AVANTIQO_CODE_ENGINE_ENABLED = "true";
  const [
    fastStartRuntime,
    workerReleaseRuntime,
    { WalletRuntime },
    { UsageRuntime },
  ] = await Promise.all([
    import("../lib/code/runtime/CodeAIEmployeeFastStartRuntime.js"),
    import("../lib/code/runtime/CodeAIWorkerSessionReleaseRuntime.js"),
    import("../lib/platform/service-runtime/wallet/runtime/WalletRuntime.js"),
    import("../lib/platform/service-runtime/usage/UsageRuntime.js"),
  ]);
  const { executeCodeAIEmployeeFastStartMission } = fastStartRuntime;
  releaseWorkerSession = workerReleaseRuntime.releaseCodeAIWorkerSession;
  if (typeof executeCodeAIEmployeeFastStartMission !== "function") {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_FAST_START_RUNTIME_NOT_LOADABLE");
  }
  if (fastStartRuntime.CODE_AI_EMPLOYEE_FAST_START_CONTRACT !== "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_V2") {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_FAST_START_CONTRACT_INVALID");
  }

  await releaseWorkerSession({ reason: "CERTIFICATION_BASELINE_CLEANUP" });
  const serverlessBefore = await assertServerlessRestState();
  const walletBefore = await WalletRuntime.prepaid({
    organization_id: ORGANIZATION_ID,
    currency: "THB",
    require_positive_balance: true,
  });
  if (String(walletBefore.billing_policy || "").toUpperCase() !== "PREPAID") {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_PREPAID_WALLET_REQUIRED");
  }
  if (Number(walletBefore.available_balance || 0) > 10.000001) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WALLET_CEILING_EXCEEDED");
  }

  const objective = [
    "Repair the intentionally broken Avantiqo Code multi-file fixture as one coherent engineering job.",
    "Numeric strings must normalize to finite numbers, invalid money inputs must normalize to zero, and finite numbers must remain unchanged.",
    "Invoice summary must use line.total and count only totals that are valid finite numeric values after normalization.",
    `The authoritative verification command is node ${VERIFIER}.`,
    `Only these source files may be edited: ${ALLOWED_FILES.join(", ")}.`,
    "Use the source evidence already loaded by Fast Start. Do not waste a reasoning call rereading those files unless the evidence is insufficient.",
    "Apply coherent edits together, verify with the exact command, inspect the final diff, and finish only after observed successful verification.",
    "Do not push, deploy, mutate databases, expose secrets, or edit any other file.",
  ].join(" ");
  const objectiveContext = {
    selection_contract: CONTRACT,
    repository_head_observed: EXPECTED_MAIN_COMMIT,
    evidence_backed: true,
    evidence_path_1: ALLOWED_FILES[0],
    evidence_path_2: ALLOWED_FILES[1],
    evidence_path_3: VERIFIER,
    completion_criterion_1: `The exact command node ${VERIFIER} passes after the repair.`,
    completion_criterion_2: "Only the two declared multi-file fixture source files are changed.",
    completion_criterion_3: "The final diff proves numeric-string normalization and invoice total/count behavior are both repaired.",
  };

  let resumeState = null;
  let finalResult = null;
  let firstWorkerReadyCycle = null;
  let firstReasoningObservedCycle = null;
  let workerWarmingCycles = 0;
  let plannerPendingCycles = 0;
  let firstInvocationElapsedMs = null;
  let workerWarmingStartedAt = null;
  const startedAt = Date.now();

  for (let cycle = 1; cycle <= MAX_RESUME_CYCLES; cycle += 1) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_CERTIFICATION_RUNTIME_MS) {
      throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_RUNTIME_LIMIT_EXCEEDED:${elapsed}`);
    }

    const invocationStartedAt = Date.now();
    const result = await executeCodeAIEmployeeFastStartMission({
      context: {
        organizationId: ORGANIZATION_ID,
        metadata: {
          certification_contract: CONTRACT,
          certification_only: true,
        },
      },
      objective,
      owner_intent: "Act as a human employee coder: understand the complete repair, implement it coherently, prove it, and stop only when done.",
      objective_context: objectiveContext,
      repository_url: REPOSITORY_URL,
      ref: REF,
      resume_state: resumeState,
      reasoning_call_budget: REASONING_CALL_BUDGET,
      max_employee_passes: 8,
      warm_session_idle_ms: WARM_IDLE_MS,
      timeout_ms: 1_200_000,
    });
    const invocationElapsed = Date.now() - invocationStartedAt;
    if (firstInvocationElapsedMs === null) firstInvocationElapsedMs = invocationElapsed;

    const observedBase = text(result.state?.base_commit).toLowerCase();
    if (observedBase !== EXPECTED_MAIN_COMMIT) {
      throw new Error(
        `AVANTIQO_CODE_EMPLOYEE_CERT_PINNED_BASE_MISMATCH:${observedBase || "missing"}:${EXPECTED_MAIN_COMMIT}`,
      );
    }
    const reasoningCalls = Number(result.state?.work_package_control?.reasoning_calls_used || 0);
    if (reasoningCalls > REASONING_CALL_BUDGET) {
      throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_REASONING_BUDGET_EXCEEDED:${reasoningCalls}`);
    }
    if (result.worker_session?.ready === true && firstWorkerReadyCycle === null) {
      firstWorkerReadyCycle = cycle;
    }
    if (reasoningCalls > 0 && firstReasoningObservedCycle === null) {
      firstReasoningObservedCycle = cycle;
    }

    const workerWarming = result.status === "worker_warming";
    if (workerWarming && workerWarmingStartedAt === null) {
      workerWarmingStartedAt = Date.now();
    }
    const workerWarmingElapsedMs = workerWarming && workerWarmingStartedAt !== null
      ? Date.now() - workerWarmingStartedAt
      : 0;

    event("CYCLE", {
      cycle,
      status: result.status,
      success: result.success === true,
      invocation_elapsed_ms: invocationElapsed,
      total_elapsed_ms: elapsed,
      fast_start_elapsed_ms: result.fast_start?.deterministic_start_elapsed_ms ?? null,
      worker_ready: result.worker_session?.ready === true,
      worker_warming: workerWarming,
      worker_warming_elapsed_ms: workerWarmingElapsedMs,
      worker_warming_limit_ms: MAX_WORKER_WARMING_MS,
      worker_state: result.worker_session?.state || null,
      worker_reason: result.worker_session?.reason || null,
      worker_transport_ready: result.worker_session?.transport_ready === true,
      worker_cached_model_found: result.worker_session?.cached_model_found === true,
      worker_engine_loaded: result.worker_session?.engine_loaded === true,
      worker_engine_warmup_job_present: result.worker_session?.engine_warmup_job_present === true,
      worker_engine_warmup_status: result.worker_session?.engine_warmup_status || null,
      worker_pod_id_present: result.worker_session?.pod_id_present === true,
      reasoning_calls_used: reasoningCalls,
      reasoning_call_budget: REASONING_CALL_BUDGET,
      package_count: Number(result.state?.work_package_control?.packages_executed || 0),
      operation_count: Number(result.state?.work_package_control?.operations_executed || 0),
      provider_job_pending: Boolean(result.state?.planner_pending?.provider_job_id),
    });

    if (workerWarming) {
      workerWarmingCycles += 1;
      if (reasoningCalls !== 0) {
        throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WARMING_MUST_NOT_SPEND_REASONING_CALL");
      }
      if (workerWarmingElapsedMs >= MAX_WORKER_WARMING_MS) {
        throw new Error(
          `AVANTIQO_CODE_EMPLOYEE_CERT_WORKER_WARMING_LIMIT_EXCEEDED:` +
          `elapsed_ms=${workerWarmingElapsedMs}:` +
          `state=${text(result.worker_session?.state, 120) || "UNKNOWN"}:` +
          `reason=${text(result.worker_session?.reason, 200) || "UNKNOWN"}:` +
          `transport_ready=${result.worker_session?.transport_ready === true}:` +
          `cached_model_found=${result.worker_session?.cached_model_found === true}:` +
          `engine_loaded=${result.worker_session?.engine_loaded === true}:` +
          `warmup_status=${text(result.worker_session?.engine_warmup_status, 120) || "UNKNOWN"}`,
        );
      }
      resumeState = result.state;
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
      continue;
    }

    if (result.status === "planner_pending") {
      plannerPendingCycles += 1;
      resumeState = result.state;
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
      continue;
    }

    finalResult = result;
    break;
  }

  if (!finalResult) throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_FINAL_RESULT_REQUIRED");
  if (finalResult.success !== true || finalResult.status !== "completed") {
    throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_MISSION_FAILED:${finalResult.reason || finalResult.status}`);
  }

  const changedFiles = [...new Set(list(finalResult.state?.files_changed).map((item) => text(item)))].sort();
  const expectedFiles = [...ALLOWED_FILES].sort();
  if (JSON.stringify(changedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_SCOPE_VIOLATION:${changedFiles.join(",")}`);
  }

  const passedVerificationOperationIds = new Set(
    list(finalResult.state?.verification)
      .filter((entry) => entry?.passed === true)
      .map((entry) => text(entry?.operation_id))
      .filter(Boolean),
  );
  const verificationPassed = list(finalResult.state?.tests).some(
    (entry) =>
      passedVerificationOperationIds.has(text(entry?.operation_id)) &&
      text(entry?.command) === "node" &&
      list(entry?.args).includes(VERIFIER) &&
      Number(entry?.exit_code) === 0,
  );
  if (!verificationPassed) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_EXACT_VERIFICATION_EVIDENCE_REQUIRED");
  }
  if (!text(finalResult.state?.patch)) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_FINAL_DIFF_REQUIRED");
  }
  if (finalResult.employee_completion?.complete !== true) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_EMPLOYEE_COMPLETION_REQUIRED");
  }
  if (finalResult.worldclass_quality?.verified !== true) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WORLDCLASS_QUALITY_REQUIRED");
  }
  if (finalResult.product_completion_criteria?.verified !== true) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_PRODUCT_COMPLETION_REQUIRED");
  }

  const control = finalResult.state?.work_package_control || {};
  const reasoningCalls = Number(control.reasoning_calls_used || 0);
  if (reasoningCalls < 1 || reasoningCalls > REASONING_CALL_BUDGET) {
    throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_REASONING_CALL_COUNT_INVALID:${reasoningCalls}`);
  }
  if (control.pending_reasoning_call) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_PENDING_REASONING_CALL_REMAINS");
  }

  const packages = list(finalResult.state?.evidence).filter(
    (entry) => entry?.kind === "batched_reasoning_package",
  );
  if (!packages.length) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_BATCHED_PACKAGE_EVIDENCE_REQUIRED");
  }
  if (!packages.some((entry) => Number(entry?.operation_count || 0) >= 3)) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_MULTI_OPERATION_PACKAGE_REQUIRED");
  }
  const usageIds = [...new Set(packages.map((entry) => text(entry?.usage_id)).filter(Boolean))];
  if (!usageIds.length || usageIds.length > REASONING_CALL_BUDGET) {
    throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_USAGE_COUNT_INVALID:${usageIds.length}`);
  }

  const usageRecords = [];
  for (const usageId of usageIds) {
    const usage = await UsageRuntime.get(usageId);
    if (!usage) throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_USAGE_NOT_FOUND:${usageId}`);
    if (usage.organization_id !== ORGANIZATION_ID) {
      throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_USAGE_ORGANIZATION_MISMATCH");
    }
    if (usage.provider !== PROVIDER || usage.capability !== SERVICE_ID) {
      throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_USAGE_PROVIDER_MISMATCH:${usage.provider}:${usage.capability}`);
    }
    if (usage.status !== "SUCCESS") {
      throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_USAGE_NOT_SETTLED:${usage.status}`);
    }
    usageRecords.push({
      id: usage.id,
      status: usage.status,
      provider: usage.provider,
      capability: usage.capability,
      customer_price: Number(usage.customer_price || 0),
      charged_amount: Number(usage.charged_amount || 0),
      reserved_amount: Number(usage.reserved_amount || 0),
      provider_request_id: usage.provider_request_id || null,
    });
  }

  const walletAfter = await WalletRuntime.prepaid({
    organization_id: ORGANIZATION_ID,
    currency: "THB",
    require_positive_balance: false,
  });
  if (Number(walletAfter.reserved_balance || 0) !== 0) {
    throw new Error(`AVANTIQO_CODE_EMPLOYEE_CERT_RESERVED_BALANCE_REMAINS:${walletAfter.reserved_balance}`);
  }

  const releaseResult = await releaseWorkerSession({ reason: "CERTIFICATION_COMPLETE" });
  if (releaseResult.released !== true || releaseResult.pod_deletion_verified !== true) {
    throw new Error("AVANTIQO_CODE_EMPLOYEE_CERT_WORKER_RELEASE_NOT_VERIFIED");
  }
  const serverlessAfter = await assertServerlessRestState();
  certificationSucceeded = true;

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    expected_main_commit: EXPECTED_MAIN_COMMIT,
    observed_base_commit: text(finalResult.state?.base_commit),
    fast_start: {
      first_invocation_elapsed_ms: firstInvocationElapsedMs,
      worker_warming_cycles: workerWarmingCycles,
      first_worker_ready_cycle: firstWorkerReadyCycle,
      first_reasoning_observed_cycle: firstReasoningObservedCycle,
      model_call_required_to_start: false,
      source_seed_paths: finalResult.fast_start?.seed_paths || [],
    },
    employee: {
      status: finalResult.status,
      completion_verified: finalResult.employee_completion?.complete === true,
      worldclass_quality_verified: finalResult.worldclass_quality?.verified === true,
      product_completion_criteria_verified:
        finalResult.product_completion_criteria?.verified === true,
      files_changed: changedFiles,
      exact_verification_passed: true,
      final_diff_present: true,
    },
    efficiency: {
      reasoning_calls_used: reasoningCalls,
      reasoning_call_budget: REASONING_CALL_BUDGET,
      packages_executed: Number(control.packages_executed || 0),
      deterministic_operations_executed: Number(control.operations_executed || 0),
      maximum_operations_in_one_reasoning_package: Math.max(
        ...packages.map((entry) => Number(entry?.operation_count || 0)),
      ),
      planner_pending_cycles: plannerPendingCycles,
      usage_record_count: usageRecords.length,
    },
    governance: {
      serverless_before: serverlessBefore,
      serverless_after: serverlessAfter,
      warm_worker_released: true,
      warm_worker_pod_deletion_verified: true,
      wallet_reserved_balance_after: Number(walletAfter.reserved_balance || 0),
      production_deploy_performed: false,
      github_commit_performed: false,
      database_schema_mutation_performed: false,
      secrets_printed: false,
      raw_reasoning_persisted: false,
    },
    usage_records: usageRecords,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} finally {
  if (!certificationSucceeded && typeof releaseWorkerSession === "function") {
    try {
      await releaseWorkerSession({ reason: "CERTIFICATION_FAILURE_CLEANUP" });
    } catch (error) {
      cleanupFailure = error;
      console.error(`AVANTIQO_CODE_EMPLOYEE_CERT_WORKER_CLEANUP_FAILED:${error?.message || error}`);
    }
  }
  try {
    await disableCertificationService();
  } catch (error) {
    console.error(`AVANTIQO_CODE_EMPLOYEE_CERT_SERVICE_DISABLE_FAILED:${error?.message || error}`);
    if (!cleanupFailure) cleanupFailure = error;
  }
  if (cleanupFailure && certificationSucceeded) throw cleanupFailure;
}
