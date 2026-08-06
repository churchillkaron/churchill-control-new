#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_POST_CREATION_AUDIT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_PREVIEW_V1";

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

const auditFile = readJson(
  process.argv[2],
  "POST_CREATION_AUDIT",
);
const audit = object(auditFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_DISPATCH_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-dispatch-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_DISPATCH_PREVIEW_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { persistedPromptFieldPaths },
  { resolveCreativeService },
  { OrganizationServiceRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
  { resolveProviders, resolveProvider },
  { PricingRuntime },
  { ServiceExecutionCostGuardRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime"),
  import("@/lib/creative/services/CreativeServiceResolver"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(audit.contract) === AUDIT_CONTRACT,
  "POST_CREATION_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(audit.organization_id) === organizationId &&
    text(audit.creative_project_id) === projectId &&
    text(audit.production_graph_id) === graphId,
  "POST_CREATION_AUDIT_SCOPE_INVALID",
);
requireValue(
  text(audit.decision) ===
    "POST_CREATION_AUDIT_18_WAITING_TASKS_CONFIRMED" &&
    text(audit.readiness) ===
      "READY_FOR_GUARDED_REPAIR_SOURCE_DISPATCH_DESIGN" &&
    list(audit.blockers).length === 0 &&
    audit.audit_state_unchanged === true,
  "POST_CREATION_AUDIT_NOT_READY",
);
requireValue(
  Number(audit.task_count) === 45 &&
    Number(audit.recovered_pair_count) === 4 &&
    Number(audit.repair_pair_count) === 9 &&
    Number(audit.replacement_task_count) === 18 &&
    Number(audit.replacement_waiting_count) === 18 &&
    Number(audit.replacement_provider_bound_count) === 0 &&
    Number(audit.replacement_cost_approved_count) === 0 &&
    Number(audit.replacement_started_count) === 0 &&
    Number(audit.replacement_output_present_count) === 0 &&
    Number(audit.persisted_prompt_path_count) === 0,
  "POST_CREATION_AUDIT_COUNTS_INVALID",
);
requireValue(
  audit.finalisation_eligible === false &&
    audit.finalisation_blocked_by_waiting_repair_tasks === true &&
    audit.provider_selection_authorized === false &&
    audit.provider_spend_authorized === false &&
    audit.dispatch_authorized === false &&
    audit.provider_calls_executed === false &&
    audit.provider_polls_executed === false &&
    audit.source_regeneration_executed === false &&
    audit.finalisation_executed === false &&
    audit.publication_executed === false,
  "POST_CREATION_AUDIT_FORBIDDEN_ACTIVITY_RECORDED",
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
  Number(before.task_status_counts.COMPLETED || 0) === 9 &&
    Number(before.task_status_counts.WAITING || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.task_state_sha256 ===
    text(audit.exact_state_after?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(audit.exact_state_before?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(audit.exact_state_before?.usage_count) &&
    before.usage_count === Number(audit.exact_state_after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance === money(audit.exact_state_before?.wallet_balance) &&
    before.wallet_balance === money(audit.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at === audit.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at === audit.exact_state_after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const sourceIds = new Set(
  list(audit.repair_pairs).map((pair) =>
    text(pair.replacement_source_task_id),
  ),
);
const reviewIds = new Set(
  list(audit.repair_pairs).map((pair) =>
    text(pair.replacement_review_task_id),
  ),
);
requireValue(sourceIds.size === 9, "REPLACEMENT_SOURCE_ID_COUNT_INVALID");
requireValue(reviewIds.size === 9, "REPLACEMENT_REVIEW_ID_COUNT_INVALID");
requireValue(
  [...sourceIds].every((id) => !reviewIds.has(id)),
  "SOURCE_REVIEW_ID_OVERLAP_INVALID",
);

const dispatchPlans = [];

for (const pair of list(audit.repair_pairs)) {
  const source = taskMap.get(text(pair.replacement_source_task_id));
  const review = taskMap.get(text(pair.replacement_review_task_id));
  const issues = [];
  let serviceId = null;
  let executionCapability = null;
  let organizationService = null;
  let resolvedProviders = null;
  let selectedProvider = null;
  let pricing = null;
  let costGuardEvidence = null;
  let providerPolicy = {};

  if (!source) issues.push("REPLACEMENT_SOURCE_MISSING");
  if (!review) issues.push("REPLACEMENT_REVIEW_MISSING");

  if (source) {
    if (text(source.status) !== "WAITING") {
      issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
    }
    if (source.provider_id !== null) issues.push("SOURCE_PROVIDER_ALREADY_BOUND");
    if (source.cost?.approved !== false) issues.push("SOURCE_COST_ALREADY_APPROVED");
    if (Number(source.cost?.actual || 0) !== 0) {
      issues.push("SOURCE_ACTUAL_COST_NONZERO");
    }
    if (text(source.error)) issues.push("SOURCE_ERROR_PRESENT");
    if (source.timing?.started_at || source.timing?.completed_at) {
      issues.push("SOURCE_TIMING_STARTED");
    }
    if (Object.keys(object(source.output)).length !== 0) {
      issues.push("SOURCE_OUTPUT_PRESENT");
    }
    if (
      source.metadata?.pair_aware_repair !== true ||
      source.metadata?.generated_media_perceptual_pair_repair !== true ||
      text(source.metadata?.repair_payload_contract) !==
        "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1" ||
      source.input?.repair_specification?.promptless_source_of_truth !== true
    ) {
      issues.push("SOURCE_REPAIR_CONTRACT_INVALID");
    }
    if (persistedPromptFieldPaths(source, `source_${source.id}`).length) {
      issues.push("SOURCE_PERSISTED_PROMPT_FIELDS_PRESENT");
    }
  }

  if (review) {
    if (text(review.status) !== "WAITING") {
      issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
    }
    if (review.provider_id !== null) issues.push("REVIEW_PROVIDER_ALREADY_BOUND");
    if (review.cost?.approved !== false) issues.push("REVIEW_COST_ALREADY_APPROVED");
    if (review.timing?.started_at || review.timing?.completed_at) {
      issues.push("REVIEW_TIMING_STARTED");
    }
    if (Object.keys(object(review.output)).length !== 0) {
      issues.push("REVIEW_OUTPUT_PRESENT");
    }
    if (
      list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id)
    ) {
      issues.push("REVIEW_DEPENDENCY_INVALID");
    }
    if (persistedPromptFieldPaths(review, `review_${review.id}`).length) {
      issues.push("REVIEW_PERSISTED_PROMPT_FIELDS_PRESENT");
    }
  }

  if (source) {
    try {
      serviceId = resolveCreativeService(source);
      organizationService = await OrganizationServiceRuntime.get({
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
      if (
        text(source.capability) &&
        text(source.capability) !== text(executionCapability)
      ) {
        issues.push("SOURCE_CAPABILITY_MISMATCH");
      }

      const taskProviderPolicy =
        source.input?.provider_policy ||
        source.metadata?.provider_policy ||
        {};
      providerPolicy = {
        ...object(organizationService?.provider_policy),
        ...object(taskProviderPolicy),
      };
      const country = source.input?.country ?? null;
      const currency = source.input?.currency ?? null;

      if (executionCapability) {
        resolvedProviders = await resolveProviders({
          capability: executionCapability,
          country,
          currency,
        });
        selectedProvider = await resolveProvider({
          organization_id: organizationId,
          capability: executionCapability,
          preferredProvider: source.provider_id,
          country,
          currency,
          policy: providerPolicy,
        });
        pricing = await PricingRuntime.resolve({
          provider: selectedProvider.provider,
          model: selectedProvider.model,
          capability: executionCapability,
          country,
          currency,
        });

        if (
          selectedProvider.pricing_id &&
          text(selectedProvider.pricing_id) !== text(pricing.pricing_id)
        ) {
          issues.push("SELECTED_PRICING_ID_MISMATCH");
        }

        const guard = ServiceExecutionCostGuardRuntime.normalizedGuard({
          maximum_customer_price: Number(source.cost?.estimated || 0),
          currency:
            text(source.cost?.currency) || before.wallet_currency,
          reference: `pair-repair-source:${source.id}`,
        });
        if (!guard) {
          issues.push("SOURCE_COST_GUARD_UNRESOLVED");
        } else {
          costGuardEvidence =
            ServiceExecutionCostGuardRuntime.validatePricing(pricing, guard);
        }
      }
    } catch (error) {
      issues.push(`DISPATCH_RESOLUTION_FAILED:${error.message}`);
    }
  }

  if (pricing && pricing.customer_price <= 0) {
    issues.push("SELECTED_CUSTOMER_PRICE_NON_POSITIVE");
  }
  if (
    pricing &&
    money(pricing.customer_price) > money(source?.cost?.estimated)
  ) {
    issues.push("SELECTED_CUSTOMER_PRICE_EXCEEDS_TASK_CEILING");
  }
  if (
    pricing &&
    text(pricing.currency) !==
      (text(source?.cost?.currency) || before.wallet_currency)
  ) {
    issues.push("SELECTED_PRICING_CURRENCY_MISMATCH");
  }

  dispatchPlans.push({
    execution_node_id: text(pair.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    service_id: serviceId,
    execution_capability: executionCapability,
    provider_policy: providerPolicy,
    provider_candidate_count: list(resolvedProviders?.providers).length,
    pricing_candidate_count: list(resolvedProviders?.pricing).length,
    rejected_pricing_count: list(resolvedProviders?.rejected_pricing).length,
    selected_provider: selectedProvider?.provider || null,
    selected_model: selectedProvider?.model || null,
    selected_pricing_id: pricing?.pricing_id || null,
    credential_available: Boolean(selectedProvider?.credential_id),
    selection_evidence: selectedProvider?.selection_evidence || null,
    selected_supplier_cost: money(pricing?.supplier_cost),
    selected_customer_price: money(pricing?.customer_price),
    selected_platform_markup: money(pricing?.platform_markup),
    selected_currency: text(pricing?.currency) || null,
    source_task_cost_ceiling: money(source?.cost?.estimated),
    cost_guard_passed: costGuardEvidence?.passed === true,
    cost_guard_evidence: costGuardEvidence,
    source_status: source?.status || null,
    review_status: review?.status || null,
    review_dependency_blocked: Boolean(
      review &&
      source &&
      text(review.status) === "WAITING" &&
      text(source.status) === "WAITING" &&
      list(review.depends_on).length === 1 &&
      text(review.depends_on[0]) === source.id,
    ),
    provider_binding_authorized: false,
    cost_approval_authorized: false,
    dispatch_authorized: false,
    issues,
    ready: issues.length === 0,
  });
}

requireValue(dispatchPlans.length === 9, "DISPATCH_PLAN_COUNT_INVALID");
if (dispatchPlans.some((plan) => !plan.ready)) {
  blockers.push("ONE_OR_MORE_SOURCE_DISPATCH_PLANS_BLOCKED");
}

const selectedSourceCost = money(
  dispatchPlans.reduce(
    (sum, plan) => sum + Number(plan.selected_customer_price || 0),
    0,
  ),
);
const sourceTaskCeiling = money(
  dispatchPlans.reduce(
    (sum, plan) => sum + Number(plan.source_task_cost_ceiling || 0),
    0,
  ),
);
const sourceSupplierCost = money(
  dispatchPlans.reduce(
    (sum, plan) => sum + Number(plan.selected_supplier_cost || 0),
    0,
  ),
);
const providerCounts = dispatchPlans.reduce((result, plan) => {
  const provider = text(plan.selected_provider) || "UNRESOLVED";
  result[provider] = Number(result[provider] || 0) + 1;
  return result;
}, {});
const pricingCurrencySet = new Set(
  dispatchPlans.map((plan) => text(plan.selected_currency)).filter(Boolean),
);
const reviewDependencyBlockedCount = dispatchPlans.filter(
  (plan) => plan.review_dependency_blocked,
).length;
const costGuardPassedCount = dispatchPlans.filter(
  (plan) => plan.cost_guard_passed,
).length;
const credentialAvailableCount = dispatchPlans.filter(
  (plan) => plan.credential_available,
).length;

requireValue(sourceTaskCeiling === 208.187686, "SOURCE_TASK_CEILING_INVALID");
requireValue(
  selectedSourceCost > 0 && selectedSourceCost <= sourceTaskCeiling,
  "SELECTED_SOURCE_COST_INVALID",
);
requireValue(pricingCurrencySet.size === 1, "PRICING_CURRENCY_SET_INVALID");
requireValue(
  [...pricingCurrencySet][0] === before.wallet_currency,
  "PRICING_WALLET_CURRENCY_MISMATCH",
);
requireValue(
  before.wallet_balance >= selectedSourceCost,
  "WALLET_BALANCE_INSUFFICIENT_FOR_SOURCE_RESERVATIONS",
);
requireValue(costGuardPassedCount === 9, "SOURCE_COST_GUARD_COUNT_INVALID");
requireValue(
  reviewDependencyBlockedCount === 9,
  "REPLACEMENT_REVIEWS_NOT_DEPENDENCY_BLOCKED",
);

const selectionContract = {
  contract: "PAIR_REPAIR_SOURCE_SELECTION_CONTRACT_V1",
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  live_task_state_sha256: before.task_state_sha256,
  post_creation_audit_file_sha256: auditFile.file_sha256,
  selected_source_cost: selectedSourceCost,
  source_task_ceiling: sourceTaskCeiling,
  currency: [...pricingCurrencySet][0] || null,
  selections: dispatchPlans.map((plan) => ({
    source_task_id: plan.source_task_id,
    review_task_id: plan.review_task_id,
    provider: plan.selected_provider,
    model: plan.selected_model,
    pricing_id: plan.selected_pricing_id,
    customer_price: plan.selected_customer_price,
    cost_ceiling: plan.source_task_cost_ceiling,
  })),
};
const selectionContractSha = sha256(selectionContract);

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
if (!stateUnchanged) blockers.push("READ_ONLY_SOURCE_DISPATCH_PREVIEW_CHANGED_STATE");

const decision = blockers.length
  ? "REPAIR_SOURCE_DISPATCH_PREVIEW_BLOCKED"
  : "REPAIR_SOURCE_DISPATCH_PREVIEW_9_SOURCES_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_DISPATCH_PREVIEW_BLOCKED"
  : "READY_FOR_SEPARATE_PROVIDER_BINDING_COST_APPROVAL_AND_DISPATCH_DESIGN";
const instruction = blockers.length
  ? "Resolve every source-dispatch preview blocker before binding providers, approving cost or dispatching replacement sources."
  : "Keep the nine source tasks and nine review tasks unchanged. Design a guarded source-execution workflow with three independent authorizations: provider binding, source-cost approval, and source dispatch. Provider binding and cost approval may update only the nine replacement source tasks. Dispatch must remain a later explicit action, and replacement reviews must remain WAITING until their own repaired source completes.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  post_creation_audit_file: auditFile.absolute,
  post_creation_audit_file_sha256: auditFile.file_sha256,
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  selected_source_cost: selectedSourceCost,
  selected_supplier_cost: sourceSupplierCost,
  source_task_cost_ceiling: sourceTaskCeiling,
  selected_currency: [...pricingCurrencySet][0] || null,
  wallet_balance: before.wallet_balance,
  wallet_currency: before.wallet_currency,
  wallet_headroom_after_full_source_reservation: money(
    before.wallet_balance - selectedSourceCost,
  ),
  provider_counts: providerCounts,
  credential_available_count: credentialAvailableCount,
  cost_guard_passed_count: costGuardPassedCount,
  review_dependency_blocked_count: reviewDependencyBlockedCount,
  selection_contract: selectionContract,
  selection_contract_sha256: selectionContractSha,
  dispatch_plans: dispatchPlans,
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
console.log("READ-ONLY OPENAI PERCEPTUAL REPAIR SOURCE-DISPATCH PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`SELECTED_SOURCE_COST=${selectedSourceCost}`);
console.log(`SELECTED_SUPPLIER_COST=${sourceSupplierCost}`);
console.log(`SOURCE_TASK_COST_CEILING=${sourceTaskCeiling}`);
console.log(`SELECTED_CURRENCY=${[...pricingCurrencySet][0] || ""}`);
console.log(`WALLET_BALANCE=${before.wallet_balance}`);
console.log(
  `WALLET_HEADROOM_AFTER_FULL_SOURCE_RESERVATION=${money(
    before.wallet_balance - selectedSourceCost,
  )}`,
);
console.log(`PROVIDER_COUNTS=${JSON.stringify(providerCounts)}`);
console.log(`CREDENTIAL_AVAILABLE_COUNT=${credentialAvailableCount}`);
console.log(`COST_GUARD_PASSED_COUNT=${costGuardPassedCount}`);
console.log(
  `REVIEW_DEPENDENCY_BLOCKED_COUNT=${reviewDependencyBlockedCount}`,
);
console.log(`SELECTION_CONTRACT_SHA256=${selectionContractSha}`);

for (const plan of dispatchPlans) {
  console.log([
    `SOURCE_DISPATCH_PREVIEW=${plan.execution_node_id}`,
    `source=${plan.source_task_id || ""}`,
    `review=${plan.review_task_id || ""}`,
    `service=${plan.service_id || ""}`,
    `capability=${plan.execution_capability || ""}`,
    `provider=${plan.selected_provider || ""}`,
    `model=${plan.selected_model || ""}`,
    `pricing_id=${plan.selected_pricing_id || ""}`,
    `customer_price=${plan.selected_customer_price}`,
    `supplier_cost=${plan.selected_supplier_cost}`,
    `ceiling=${plan.source_task_cost_ceiling}`,
    `currency=${plan.selected_currency || ""}`,
    `provider_candidates=${plan.provider_candidate_count}`,
    `pricing_candidates=${plan.pricing_candidate_count}`,
    `credential_available=${plan.credential_available ? "YES" : "NO"}`,
    `cost_guard=${plan.cost_guard_passed ? "PASS" : "FAIL"}`,
    `review_blocked=${plan.review_dependency_blocked ? "YES" : "NO"}`,
    `issues=${plan.issues.join(",")}`,
    `ready=${plan.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SOURCE_DISPATCH_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SOURCE_DISPATCH_PREVIEW_DECISION=${decision}`);
console.log(`SOURCE_DISPATCH_PREVIEW_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`FINALISATION_ELIGIBLE=NO`);
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
