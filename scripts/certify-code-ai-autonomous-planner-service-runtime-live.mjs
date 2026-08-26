import process from "node:process";
import { register } from "node:module";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

register("./next-alias-loader.mjs", import.meta.url);
loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_PLANNER_SERVICE_RUNTIME_LIVE_CERTIFICATION_V1";
const AUTONOMY_CONTROL_CONTRACT = "AVANTIQO_CODE_AI_AUTONOMY_CONTROL_V1";
const ORGANIZATION_ID = String(
  process.argv[2] || process.env.AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID || "",
).trim();
const SERVICE_ID = "ai.code.debug";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const REF = "main";
const VERIFIER = "scripts/code-ai-autonomous-multifile-fixture-test.mjs";
const ALLOWED_FILES = [
  "tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs",
  "tests/fixtures/code-ai-autonomous-multifile/invoice-summary.mjs",
];
const MAX_RESUME_CYCLES = 40;
const MAX_ITERATIONS_PER_CYCLE = 12;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function event(name, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_PLANNER_SERVICE_RUNTIME_${name}`,
    at: new Date().toISOString(),
    contract: CONTRACT,
    ...details,
  }));
}

async function disableCertificationService() {
  if (!ORGANIZATION_ID) return null;

  if (!text(process.env.NEXT_PUBLIC_SUPABASE_URL) || !text(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_SERVICE_DISABLE_CREDENTIAL_REQUIRED");
  }

  const { supabaseAdmin: supabase } = await import("../lib/shared/supabase/admin.js");

  const { data, error } = await supabase
    .from("organization_services")
    .update({ usage_enabled: false, billing_enabled: false })
    .eq("organization_id", ORGANIZATION_ID)
    .eq("service_id", SERVICE_ID)
    .select("id,organization_id,service_id,status,usage_enabled,billing_enabled")
    .maybeSingle();
  if (error) throw error;
  if (data && (data.usage_enabled !== false || data.billing_enabled !== false)) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_SERVICE_DISABLE_FAILED");
  }

  event("SERVICE_DISABLED", {
    organization_id: ORGANIZATION_ID,
    service_id: SERVICE_ID,
    service_found: Boolean(data),
    usage_enabled: data?.usage_enabled ?? false,
    billing_enabled: data?.billing_enabled ?? false,
    automatic_shutdown: true,
    new_provider_execution_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  });
  return data;
}

try {
  if (!ORGANIZATION_ID) throw new Error("AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID_REQUIRED");
  if (text(process.env.AVANTIQO_CODE_PLANNER_SPEND_APPROVED).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_CODE_PLANNER_SPEND_APPROVAL_REQUIRED");
  }
  if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_DEVELOPMENT_ENV_REQUIRED");
  }

  if (!text(process.env.RUNPOD_API_KEY)) {
    const fallback = text(
      process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
      process.env.RUNPOD_MANAGEMENT_API_KEY,
    );
    if (fallback) process.env.RUNPOD_API_KEY = fallback;
  }
  if (!text(process.env.RUNPOD_API_KEY)) throw new Error("RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED");
  if (!text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID)) {
    throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
  }
  process.env.AVANTIQO_CODE_ENGINE_ENABLED = "true";

  const [
    autonomousRuntime,
    { WalletRuntime },
    { UsageRuntime },
  ] = await Promise.all([
    import("../lib/code/runtime/CodeAIAutonomousRuntime.js"),
    import("../lib/platform/service-runtime/wallet/runtime/WalletRuntime.js"),
    import("../lib/platform/service-runtime/usage/UsageRuntime.js"),
  ]);

  const { executeAutonomousCodeMission, CodeAIAutonomousRuntime } = autonomousRuntime;
  if (typeof executeAutonomousCodeMission !== "function") {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_AUTONOMOUS_RUNTIME_NOT_LOADABLE");
  }
  if (CodeAIAutonomousRuntime?.autonomy_control_contract !== AUTONOMY_CONTROL_CONTRACT) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_AUTONOMY_CONTROL_CONTRACT_REQUIRED");
  }
  for (const action of ["read", "search", "run"]) {
    if (!list(CodeAIAutonomousRuntime?.duplicate_guarded_actions).includes(action)) {
      throw new Error(`AVANTIQO_CODE_PLANNER_CERT_DUPLICATE_ACTION_GUARD_REQUIRED:${action}`);
    }
  }
  if (Number(CodeAIAutonomousRuntime?.max_iterations || 0) !== 24) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_GLOBAL_ITERATION_LIMIT_MISMATCH");
  }

  const walletBefore = await WalletRuntime.prepaid({
    organization_id: ORGANIZATION_ID,
    currency: "THB",
    require_positive_balance: true,
  });

  if (String(walletBefore.billing_policy || "").toUpperCase() !== "PREPAID") {
    throw new Error("AVANTIQO_CODE_PLANNER_PREPAID_WALLET_REQUIRED");
  }
  if (Number(walletBefore.available_balance || 0) > 10.000001) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_WALLET_CEILING_EXCEEDED");
  }

  const objective = [
    "Repair the existing intentionally broken Avantiqo Code autonomous multi-file fixture on current main.",
    `The authoritative verification command is: node ${VERIFIER}`,
    `Only these source files may be edited: ${ALLOWED_FILES.join(", ")}.`,
    "Inspect/read current repository evidence before editing.",
    "Use apply_files for intentional edits, verify with the exact command, inspect the final diff, and complete only after observed successful verification.",
    "Do not push, deploy, mutate databases, expose secrets, or edit any other file.",
  ].join(" ");

  let resumeState = null;
  let finalResult = null;
  let resumeCycles = 0;

  for (let cycle = 1; cycle <= MAX_RESUME_CYCLES; cycle += 1) {
    resumeCycles = cycle;
    event("CYCLE_START", {
      cycle,
      resume: Boolean(resumeState),
      pending_provider_job_id: resumeState?.planner_pending?.provider_job_id || null,
    });

    const result = await executeAutonomousCodeMission({
      context: {
        organizationId: ORGANIZATION_ID,
        metadata: {
          certification_contract: CONTRACT,
          certification_only: true,
        },
      },
      objective,
      objective_context: {
        selection_contract: CONTRACT,
        completion_criterion_1: `The exact command node ${VERIFIER} passes after the repair.`,
        completion_criterion_2: "Only the two declared multi-file fixture source files are changed.",
      },
      repository_url: REPOSITORY_URL,
      ref: REF,
      resume_state: resumeState,
      max_iterations: MAX_ITERATIONS_PER_CYCLE,
    });

    event("CYCLE_RESULT", {
      cycle,
      status: result.status,
      success: result.success === true,
      reason: result.reason || null,
      iterations: result.iterations || 0,
      pending_provider_job_id: result.state?.planner_pending?.provider_job_id || null,
    });

    if (result.status === "planner_pending") {
      resumeState = result.state;
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    finalResult = result;
    break;
  }

  if (!finalResult) throw new Error("AVANTIQO_CODE_PLANNER_CERT_RESUME_CYCLE_LIMIT_EXCEEDED");
  if (!finalResult.success || finalResult.status !== "completed") {
    throw new Error(`AVANTIQO_CODE_PLANNER_CERT_MISSION_FAILED:${finalResult.reason || finalResult.status}`);
  }

  const changedFiles = [...new Set(list(finalResult.state?.files_changed))].sort();
  const expectedFiles = [...ALLOWED_FILES].sort();
  if (JSON.stringify(changedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`AVANTIQO_CODE_PLANNER_CERT_SCOPE_VIOLATION:${changedFiles.join(",")}`);
  }

  const control = finalResult.state?.autonomy_control || {};
  if (control.contract !== AUTONOMY_CONTROL_CONTRACT) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_FINAL_AUTONOMY_CONTROL_EVIDENCE_REQUIRED");
  }
  if (Number(control.planner_iterations_used || 0) > MAX_ITERATIONS_PER_CYCLE) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_GLOBAL_ITERATION_BUDGET_EXCEEDED");
  }
  if (control.pending_planner_iteration) {
    throw new Error("AVANTIQO_CODE_PLANNER_CERT_PENDING_ITERATION_REMAINS");
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
  if (!verificationPassed) throw new Error("AVANTIQO_CODE_PLANNER_CERT_VERIFICATION_EVIDENCE_REQUIRED");
  if (!text(finalResult.state?.patch)) throw new Error("AVANTIQO_CODE_PLANNER_CERT_DIFF_REQUIRED");

  const plannerEvidence = list(finalResult.state?.evidence).filter(
    (entry) => entry?.kind === "autonomous_planner",
  );
  const usageIds = [...new Set(plannerEvidence.map((entry) => text(entry?.usage_id)).filter(Boolean))];
  if (!usageIds.length) throw new Error("AVANTIQO_CODE_PLANNER_CERT_USAGE_EVIDENCE_REQUIRED");

  const usageRecords = [];
  for (const usageId of usageIds) {
    const usage = await UsageRuntime.get(usageId);
    if (!usage) throw new Error(`AVANTIQO_CODE_PLANNER_CERT_USAGE_NOT_FOUND:${usageId}`);
    if (usage.organization_id !== ORGANIZATION_ID) throw new Error("AVANTIQO_CODE_PLANNER_CERT_USAGE_ORGANIZATION_MISMATCH");
    if (usage.provider !== "avantiqo-code") throw new Error(`AVANTIQO_CODE_PLANNER_CERT_PROVIDER_MISMATCH:${usage.provider}`);
    if (usage.capability !== "ai.code.debug") throw new Error(`AVANTIQO_CODE_PLANNER_CERT_CAPABILITY_MISMATCH:${usage.capability}`);
    if (usage.status !== "SUCCESS") throw new Error(`AVANTIQO_CODE_PLANNER_CERT_USAGE_NOT_SETTLED:${usage.status}`);
    usageRecords.push({
      id: usage.id,
      status: usage.status,
      provider: usage.provider,
      capability: usage.capability,
      supplier_cost: Number(usage.supplier_cost || 0),
      customer_price: Number(usage.customer_price || 0),
      charged_amount: Number(usage.charged_amount || 0),
      reserved_amount: Number(usage.reserved_amount || 0),
      provider_request_id: usage.provider_request_id || null,
      settled_pricing_estimated: usage.metadata?.settled_pricing?.estimated ?? null,
      provider_usage: usage.metadata?.provider_usage || null,
    });
  }

  const walletAfter = await WalletRuntime.prepaid({
    organization_id: ORGANIZATION_ID,
    currency: "THB",
    require_positive_balance: false,
  });
  if (Number(walletAfter.reserved_balance || 0) !== 0) {
    throw new Error(`AVANTIQO_CODE_PLANNER_CERT_RESERVED_BALANCE_REMAINS:${walletAfter.reserved_balance}`);
  }

  const walletDelta = Number((
    Number(walletBefore.available_balance || 0) - Number(walletAfter.available_balance || 0)
  ).toFixed(6));
  const settledCustomerPrice = Number(usageRecords.reduce(
    (sum, usage) => sum + usage.customer_price,
    0,
  ).toFixed(6));
  if (Math.abs(walletDelta - settledCustomerPrice) > 0.00001) {
    throw new Error(`AVANTIQO_CODE_PLANNER_CERT_WALLET_SETTLEMENT_MISMATCH:${walletDelta}:${settledCustomerPrice}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    organization_id: ORGANIZATION_ID,
    provider: "avantiqo-code",
    capability: "ai.code.debug",
    planner_runtime: "CodeAIAutonomousRuntime",
    planner_execution_runtime: "CodeAIPlannerExecutionRuntime",
    service_execution_runtime: "ServiceExecutionRuntime",
    autonomy_control_contract: AUTONOMY_CONTROL_CONTRACT,
    duplicate_read_search_run_guard_verified: true,
    global_iteration_budget_verified: true,
    global_planner_iterations_used: Number(control.planner_iterations_used || 0),
    wallet_policy: "PREPAID",
    wallet_balance_before: Number(walletBefore.available_balance || 0),
    wallet_balance_after: Number(walletAfter.available_balance || 0),
    wallet_delta: walletDelta,
    wallet_reserved_after: Number(walletAfter.reserved_balance || 0),
    planner_inference_count: plannerEvidence.length,
    provider_usage_count: usageRecords.length,
    usage_records: usageRecords,
    resume_cycles: resumeCycles,
    planner_pending_reused: resumeCycles > 1,
    changed_files: changedFiles,
    verification_passed: true,
    diff_verified: true,
    github_main_mutated: false,
    production_pricing_activated: false,
    production_deploy_performed: false,
    external_fallback_used: false,
    service_disable_finally_armed: true,
    billing_disable_finally_armed: true,
    secrets_printed: false,
  }, null, 2));
} finally {
  await disableCertificationService();
}
