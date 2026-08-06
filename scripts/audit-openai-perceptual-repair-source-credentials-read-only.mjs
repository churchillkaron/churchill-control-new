#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_PREVIEW_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_CREDENTIAL_READINESS_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function taskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
  );
}

function taskCounts(tasks = []) {
  return tasks.reduce((result, task) => {
    const status = text(task.status) || "UNKNOWN";
    result[status] = Number(result[status] || 0) + 1;
    return result;
  }, {});
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      production_graph_id: graphId,
    }),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);

  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;

  const scopedTasks = tasks.filter(
    (task) => text(task.production_graph_id) === graphId,
  );

  return {
    tasks: scopedTasks,
    task_count: scopedTasks.length,
    task_status_counts: taskCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

function credentialRecordReady(record = {}) {
  if (!record || typeof record !== "object") return false;
  const status = text(record.status).toUpperCase();
  if (status && status !== "ACTIVE") return false;
  return Boolean(text(record.secret_reference));
}

function providerCredentialObjectReady(record = {}) {
  if (!record || typeof record !== "object") return false;
  return Boolean(
    text(record.api_key) ||
      text(record.access_token) ||
      text(record.secret_reference),
  );
}

const previewFile = readJson(
  process.argv[2],
  "SOURCE_DISPATCH_PREVIEW",
);
const preview = object(previewFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_CREDENTIAL_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-credential-readiness.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_CREDENTIAL_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { resolveCreativeService },
  { OrganizationServiceRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
  { resolveProvider },
  { CredentialRuntime },
  { resolveProviderCredential },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/services/CreativeServiceResolver"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime"),
  import("@/lib/platform/service-runtime/providers/ProviderCredentialRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "SOURCE_DISPATCH_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(preview.organization_id) === organizationId &&
    text(preview.creative_project_id) === projectId &&
    text(preview.production_graph_id) === graphId,
  "SOURCE_DISPATCH_PREVIEW_SCOPE_INVALID",
);
requireValue(
  text(preview.decision) ===
    "REPAIR_SOURCE_DISPATCH_PREVIEW_9_SOURCES_CONFIRMED" &&
    text(preview.readiness) ===
      "READY_FOR_SEPARATE_PROVIDER_BINDING_COST_APPROVAL_AND_DISPATCH_DESIGN" &&
    list(preview.blockers).length === 0 &&
    preview.state_unchanged === true,
  "SOURCE_DISPATCH_PREVIEW_NOT_READY",
);
requireValue(
  Number(preview.source_task_count) === 9 &&
    Number(preview.review_task_count) === 9 &&
    Number(preview.cost_guard_passed_count) === 9 &&
    Number(preview.review_dependency_blocked_count) === 9 &&
    preview.provider_binding_authorized === false &&
    preview.cost_approval_authorized === false &&
    preview.provider_spend_authorized === false &&
    preview.dispatch_authorized === false &&
    preview.provider_calls_executed === false &&
    preview.wallet_reservations_executed === false,
  "SOURCE_DISPATCH_PREVIEW_GATES_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  before.task_state_sha256 ===
    text(preview.exact_state_before?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(preview.exact_state_after?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(preview.exact_state_before?.usage_count) &&
    before.usage_count === Number(preview.exact_state_after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance === money(preview.exact_state_before?.wallet_balance) &&
    before.wallet_balance === money(preview.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at === preview.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at === preview.exact_state_after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const runwayApiKeyPresent = Boolean(text(process.env.RUNWAY_API_KEY));
const runwayApiSecretPresent = Boolean(
  text(process.env.RUNWAYML_API_SECRET),
);
const runwayEnvironmentCredentialPresent =
  runwayApiKeyPresent || runwayApiSecretPresent;
const credentialPlans = [];

for (const dispatchPlan of list(preview.dispatch_plans)) {
  const source = taskMap.get(text(dispatchPlan.source_task_id));
  const review = taskMap.get(text(dispatchPlan.review_task_id));
  const issues = [];
  let serviceId = null;
  let executionCapability = null;
  let selectedProvider = null;
  let selectedCredentialRecord = null;
  let organizationCredential = null;

  if (!source) issues.push("REPLACEMENT_SOURCE_MISSING");
  if (!review) issues.push("REPLACEMENT_REVIEW_MISSING");

  if (source) {
    if (text(source.status) !== "WAITING") {
      issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
    }
    if (source.provider_id !== null) issues.push("SOURCE_PROVIDER_ALREADY_BOUND");
    if (source.cost?.approved !== false) issues.push("SOURCE_COST_ALREADY_APPROVED");
    if (source.timing?.started_at || source.timing?.completed_at) {
      issues.push("SOURCE_TIMING_STARTED");
    }
    if (Object.keys(object(source.output)).length !== 0) {
      issues.push("SOURCE_OUTPUT_PRESENT");
    }
  }

  if (review) {
    if (text(review.status) !== "WAITING") {
      issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
    }
    if (
      list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id)
    ) {
      issues.push("REVIEW_DEPENDENCY_INVALID");
    }
  }

  if (source) {
    try {
      serviceId = resolveCreativeService(source);
      const organizationService = await OrganizationServiceRuntime.get({
        organization_id: organizationId,
        service_id: serviceId,
      });
      if (!organizationService) {
        issues.push("ORGANIZATION_SERVICE_NOT_ENABLED");
      }

      const capabilities = resolveServiceCapabilities(serviceId);
      executionCapability = resolvePrimaryExecutionCapability(
        capabilities?.capabilities || [],
      );
      if (!executionCapability) {
        issues.push("EXECUTION_CAPABILITY_UNRESOLVED");
      }

      const providerPolicy = {
        ...object(organizationService?.provider_policy),
        ...object(
          source.input?.provider_policy ||
            source.metadata?.provider_policy,
        ),
      };
      if (executionCapability) {
        selectedProvider = await resolveProvider({
          organization_id: organizationId,
          capability: executionCapability,
          preferredProvider: source.provider_id,
          country: source.input?.country ?? null,
          currency: source.input?.currency ?? null,
          policy: providerPolicy,
        });
      }

      if (
        selectedProvider &&
        (text(selectedProvider.provider) !==
          text(dispatchPlan.selected_provider) ||
          text(selectedProvider.model) !== text(dispatchPlan.selected_model) ||
          text(selectedProvider.pricing_id) !==
            text(dispatchPlan.selected_pricing_id))
      ) {
        issues.push("PROVIDER_SELECTION_CHANGED");
      }

      if (selectedProvider?.credential_id) {
        selectedCredentialRecord = await CredentialRuntime.resolve(
          selectedProvider.credential_id,
        );
      }

      if (selectedProvider?.provider) {
        organizationCredential = await resolveProviderCredential({
          organization_id: organizationId,
          provider: selectedProvider.provider,
          credential_id: selectedProvider.credential_id || null,
        });
      }
    } catch (error) {
      issues.push(`CREDENTIAL_RESOLUTION_FAILED:${error.message}`);
    }
  }

  const selectedCredentialIdPresent = Boolean(
    text(selectedProvider?.credential_id),
  );
  const selectedCredentialRecordReady = credentialRecordReady(
    selectedCredentialRecord,
  );
  const providerCredentialRuntimeReady = providerCredentialObjectReady(
    organizationCredential,
  );
  const runwayExecutionCredentialReady =
    text(selectedProvider?.provider) === "runway" &&
    (selectedCredentialRecordReady || runwayEnvironmentCredentialPresent);

  if (text(selectedProvider?.provider) !== "runway") {
    issues.push("SELECTED_PROVIDER_NOT_RUNWAY");
  }
  if (!runwayExecutionCredentialReady) {
    issues.push("RUNWAY_EXECUTION_CREDENTIAL_UNAVAILABLE");
  }

  credentialPlans.push({
    execution_node_id: text(dispatchPlan.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    service_id: serviceId,
    execution_capability: executionCapability,
    selected_provider: selectedProvider?.provider || null,
    selected_model: selectedProvider?.model || null,
    selected_pricing_id: selectedProvider?.pricing_id || null,
    selected_credential_id_present: selectedCredentialIdPresent,
    selected_credential_record_ready: selectedCredentialRecordReady,
    provider_credential_runtime_ready: providerCredentialRuntimeReady,
    runway_environment_credential_present:
      runwayEnvironmentCredentialPresent,
    runway_execution_credential_ready: runwayExecutionCredentialReady,
    credential_source: selectedCredentialRecordReady
      ? "CREDENTIAL_RECORD"
      : runwayApiKeyPresent
        ? "RUNWAY_API_KEY"
        : runwayApiSecretPresent
          ? "RUNWAYML_API_SECRET"
          : providerCredentialRuntimeReady
            ? "PROVIDER_CREDENTIAL_RUNTIME_NOT_CONSUMED_BY_RUNWAY_PROVIDER"
            : "NONE",
    secret_value_exposed: false,
    provider_binding_authorized: false,
    cost_approval_authorized: false,
    dispatch_authorized: false,
    issues,
    ready: issues.length === 0,
  });
}

requireValue(credentialPlans.length === 9, "CREDENTIAL_PLAN_COUNT_INVALID");
if (credentialPlans.some((plan) => !plan.ready)) {
  blockers.push("ONE_OR_MORE_SOURCE_CREDENTIAL_PLANS_BLOCKED");
}

const selectedCredentialIdCount = credentialPlans.filter(
  (plan) => plan.selected_credential_id_present,
).length;
const selectedCredentialRecordReadyCount = credentialPlans.filter(
  (plan) => plan.selected_credential_record_ready,
).length;
const providerCredentialRuntimeReadyCount = credentialPlans.filter(
  (plan) => plan.provider_credential_runtime_ready,
).length;
const executionCredentialReadyCount = credentialPlans.filter(
  (plan) => plan.runway_execution_credential_ready,
).length;
const credentialSourceCounts = credentialPlans.reduce((result, plan) => {
  const source = text(plan.credential_source) || "NONE";
  result[source] = Number(result[source] || 0) + 1;
  return result;
}, {});

requireValue(
  executionCredentialReadyCount === 9,
  "RUNWAY_EXECUTION_CREDENTIAL_READY_COUNT_INVALID",
);

const credentialReadinessContract = {
  contract: "PAIR_REPAIR_SOURCE_CREDENTIAL_READINESS_CONTRACT_V1",
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  live_task_state_sha256: before.task_state_sha256,
  source_dispatch_preview_file_sha256: previewFile.file_sha256,
  source_task_ids: credentialPlans.map((plan) => plan.source_task_id),
  selected_provider: "runway",
  execution_credential_ready_count: executionCredentialReadyCount,
  credential_source_counts: credentialSourceCounts,
};
const credentialReadinessContractSha = sha256(
  credentialReadinessContract,
);

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) {
  blockers.push("READ_ONLY_SOURCE_CREDENTIAL_AUDIT_CHANGED_STATE");
}

const decision = blockers.length
  ? "REPAIR_SOURCE_CREDENTIAL_READINESS_BLOCKED"
  : "REPAIR_SOURCE_CREDENTIAL_READINESS_9_SOURCES_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_CREDENTIAL_READINESS_BLOCKED"
  : "READY_FOR_PROVIDER_BINDING_AND_COST_APPROVAL_DRY_RUN_DESIGN";
const instruction = blockers.length
  ? "Resolve every credential-readiness blocker before binding providers, approving cost or dispatching any replacement source task."
  : "Keep dispatch unauthorized. Design a guarded dry run that may preview binding Runway and approving the exact selected source cost on only nine replacement source tasks. Provider binding and cost approval must use distinct explicit authorizations, remain reversible, and perform no wallet reservation or provider call.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  source_dispatch_preview_file: previewFile.absolute,
  source_dispatch_preview_file_sha256: previewFile.file_sha256,
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  source_task_count: credentialPlans.length,
  selected_credential_id_count: selectedCredentialIdCount,
  selected_credential_record_ready_count:
    selectedCredentialRecordReadyCount,
  provider_credential_runtime_ready_count:
    providerCredentialRuntimeReadyCount,
  runway_api_key_present: runwayApiKeyPresent,
  runway_api_secret_present: runwayApiSecretPresent,
  runway_environment_credential_present:
    runwayEnvironmentCredentialPresent,
  execution_credential_ready_count: executionCredentialReadyCount,
  credential_source_counts: credentialSourceCounts,
  credential_readiness_contract: credentialReadinessContract,
  credential_readiness_contract_sha256: credentialReadinessContractSha,
  credential_plans: credentialPlans,
  secret_values_exposed: false,
  provider_binding_authorized: false,
  cost_approval_authorized: false,
  provider_spend_authorized: false,
  dispatch_authorized: false,
  finalisation_eligible: false,
  blockers,
  decision,
  instruction,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_updated_at: after.wallet_updated_at,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  wallet_reservations_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  source_regeneration_executed: false,
  downstream_tasks_updated: 0,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL REPAIR SOURCE CREDENTIAL AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${credentialPlans.length}`);
console.log(`SELECTED_CREDENTIAL_ID_COUNT=${selectedCredentialIdCount}`);
console.log(
  `SELECTED_CREDENTIAL_RECORD_READY_COUNT=${selectedCredentialRecordReadyCount}`,
);
console.log(
  `PROVIDER_CREDENTIAL_RUNTIME_READY_COUNT=${providerCredentialRuntimeReadyCount}`,
);
console.log(`RUNWAY_API_KEY_PRESENT=${runwayApiKeyPresent ? "YES" : "NO"}`);
console.log(
  `RUNWAY_API_SECRET_PRESENT=${runwayApiSecretPresent ? "YES" : "NO"}`,
);
console.log(
  `RUNWAY_ENVIRONMENT_CREDENTIAL_PRESENT=${
    runwayEnvironmentCredentialPresent ? "YES" : "NO"
  }`,
);
console.log(
  `EXECUTION_CREDENTIAL_READY_COUNT=${executionCredentialReadyCount}`,
);
console.log(`CREDENTIAL_SOURCE_COUNTS=${JSON.stringify(credentialSourceCounts)}`);
console.log(
  `CREDENTIAL_READINESS_CONTRACT_SHA256=${credentialReadinessContractSha}`,
);

for (const plan of credentialPlans) {
  console.log([
    `SOURCE_CREDENTIAL_AUDIT=${plan.execution_node_id}`,
    `source=${plan.source_task_id || ""}`,
    `review=${plan.review_task_id || ""}`,
    `provider=${plan.selected_provider || ""}`,
    `model=${plan.selected_model || ""}`,
    `pricing_id=${plan.selected_pricing_id || ""}`,
    `credential_id_present=${plan.selected_credential_id_present ? "YES" : "NO"}`,
    `credential_record_ready=${plan.selected_credential_record_ready ? "YES" : "NO"}`,
    `provider_credential_runtime_ready=${plan.provider_credential_runtime_ready ? "YES" : "NO"}`,
    `environment_credential_present=${plan.runway_environment_credential_present ? "YES" : "NO"}`,
    `execution_credential_ready=${plan.runway_execution_credential_ready ? "YES" : "NO"}`,
    `credential_source=${plan.credential_source}`,
    `secret_exposed=NO`,
    `issues=${plan.issues.join(",")}`,
    `ready=${plan.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_CREDENTIAL_AUDIT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_CREDENTIAL_AUDIT_DECISION=${decision}`);
console.log(`SOURCE_CREDENTIAL_AUDIT_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("SECRET_VALUES_EXPOSED=NO");
console.log("FINALISATION_ELIGIBLE=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_BINDING_AUTHORIZED=NO");
console.log("COST_APPROVAL_AUTHORIZED=NO");
console.log("PROVIDER_SPEND_AUTHORIZED=NO");
console.log("DISPATCH_AUTHORIZED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
