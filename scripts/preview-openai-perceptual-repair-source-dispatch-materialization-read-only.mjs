#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);

const APPROVAL_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BINDING_COST_APPROVAL_AUDIT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_V1";
const ALLOWED_RUNWAY_BODY_KEYS = new Set([
  "contentModeration",
  "duration",
  "model",
  "negativePrompt",
  "promptImage",
  "promptText",
  "ratio",
  "seed",
]);

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

function safeRequestBody(body = {}) {
  return Object.fromEntries(
    Object.entries(object(body)).map(([key, value]) => {
      if (key === "promptText") {
        return [key, {
          present: Boolean(text(value)),
          length: text(value).length,
          sha256: sha256(text(value)),
        }];
      }
      if (key === "promptImage") {
        const source = text(value);
        return [key, {
          present: Boolean(source),
          transport: /^data:image\//i.test(source)
            ? "DATA_URI"
            : /^https:\/\//i.test(source)
              ? "HTTPS"
              : source
                ? "OTHER"
                : "NONE",
          encoded_bytes: source ? Buffer.byteLength(source, "utf8") : 0,
          sha256: source ? sha256(source) : null,
        }];
      }
      return [key, value];
    }),
  );
}

function safePreparedInput(input = {}) {
  const source = object(input);
  const blocked = new Set([
    "api_key",
    "access_token",
    "secret_reference",
    "credential",
    "prompt",
    "provider_prompt",
    "prompt_image",
    "promptImage",
    "identity_source",
    "identitySource",
  ]);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !blocked.has(key))
      .map(([key, value]) => [key, value]),
  );
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

const approvalAuditFile = readJson(
  process.argv[2],
  "SOURCE_BINDING_COST_APPROVAL_AUDIT",
);
const approvalAudit = object(approvalAuditFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-source-dispatch-materialization-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { resolveCreativeService },
  { OrganizationServiceRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
  { resolveProvider },
  { resolveProviderCredential },
  { PricingRuntime },
  { ServiceExecutionCostGuardRuntime },
  { CreativeApprovedProductionTaskCostGuardRuntime },
  {
    serializeCreativeProviderInstruction,
    hasStructuredCreativeInstruction,
  },
  { prepareRunwayProviderInputByProbe },
  { RunwayProviderRequestRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/services/CreativeServiceResolver"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderCredentialRuntime"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime"),
  import("@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"),
  import("@/lib/creative/execution/runtime/CreativeProviderInstructionSerializer"),
  import("@/lib/platform/service-runtime/providers/runway/RunwayProviderMediaProbeRuntime"),
  import("@/lib/platform/service-runtime/providers/runway/RunwayProvider"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(approvalAudit.contract) === APPROVAL_AUDIT_CONTRACT,
  "APPROVAL_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(approvalAudit.organization_id) === organizationId &&
    text(approvalAudit.creative_project_id) === projectId &&
    text(approvalAudit.production_graph_id) === graphId,
  "APPROVAL_AUDIT_SCOPE_INVALID",
);
requireValue(
  text(approvalAudit.decision) ===
    "REPAIR_SOURCE_BINDING_COST_APPROVAL_AUDIT_9_SOURCES_CONFIRMED" &&
    text(approvalAudit.readiness) ===
      "READY_FOR_GUARDED_REPAIR_SOURCE_DISPATCH_PREVIEW_DESIGN" &&
    list(approvalAudit.blockers).length === 0 &&
    approvalAudit.state_unchanged === true,
  "APPROVAL_AUDIT_NOT_READY",
);
requireValue(
  Number(approvalAudit.source_task_count) === 9 &&
    Number(approvalAudit.review_task_count) === 9 &&
    Number(approvalAudit.provider_bound_count) === 9 &&
    Number(approvalAudit.cost_approved_count) === 9 &&
    money(approvalAudit.approved_estimated_cost) === 47.34288 &&
    Number(approvalAudit.source_started_count) === 0 &&
    Number(approvalAudit.source_output_present_count) === 0 &&
    Number(approvalAudit.dispatch_authorized_count) === 0 &&
    Number(approvalAudit.review_dependency_blocked_count) === 9 &&
    Number(approvalAudit.persisted_prompt_path_count) === 0,
  "APPROVAL_AUDIT_COUNTS_INVALID",
);
requireValue(
  approvalAudit.provider_binding_authorized === true &&
    approvalAudit.cost_approval_authorized === true &&
    approvalAudit.provider_spend_authorized === false &&
    approvalAudit.dispatch_authorized === false &&
    approvalAudit.wallet_reservations_executed === false &&
    approvalAudit.provider_calls_executed === false,
  "APPROVAL_AUDIT_AUTHORIZATION_STATE_INVALID",
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
    text(approvalAudit.exact_state_before?.task_state_sha256) &&
    before.task_state_sha256 ===
      text(approvalAudit.exact_state_after?.task_state_sha256),
  "LIVE_TASK_STATE_SHA_MISMATCH",
);
requireValue(
  before.usage_count === Number(approvalAudit.exact_state_before?.usage_count) &&
    before.usage_count === Number(approvalAudit.exact_state_after?.usage_count),
  "USAGE_COUNT_CHANGED",
);
requireValue(
  before.wallet_balance ===
    money(approvalAudit.exact_state_before?.wallet_balance) &&
    before.wallet_balance ===
      money(approvalAudit.exact_state_after?.wallet_balance) &&
    before.wallet_updated_at ===
      approvalAudit.exact_state_before?.wallet_updated_at &&
    before.wallet_updated_at ===
      approvalAudit.exact_state_after?.wallet_updated_at,
  "WALLET_STATE_CHANGED",
);

const dispatchPlans = [];
const runwayEnvironmentCredentialPresent = Boolean(
  text(process.env.RUNWAY_API_KEY) || text(process.env.RUNWAYML_API_SECRET),
);

for (const approvedItem of list(approvalAudit.source_audits)) {
  const source = taskMap.get(text(approvedItem.source_task_id));
  const review = taskMap.get(text(approvedItem.review_task_id));
  const issues = [];
  let serviceId = null;
  let executionCapability = null;
  let organizationService = null;
  let selectedProvider = null;
  let credential = null;
  let pricing = null;
  let guard = null;
  let costGuardEvidence = null;
  let structuredInput = null;
  let preparedInput = null;
  let request = null;

  if (!source) issues.push("SOURCE_TASK_MISSING");
  if (!review) issues.push("REVIEW_TASK_MISSING");

  if (source) {
    if (text(source.status) !== "WAITING") {
      issues.push(`SOURCE_STATUS_INVALID:${source.status}`);
    }
    if (text(source.provider_id) !== "runway") {
      issues.push("SOURCE_PROVIDER_NOT_RUNWAY");
    }
    if (source.cost?.approved !== true) {
      issues.push("SOURCE_COST_NOT_APPROVED");
    }
    if (money(source.cost?.estimated) !== 5.26032) {
      issues.push("SOURCE_APPROVED_PRICE_INVALID");
    }
    if (source.metadata?.dispatch_authorized === true) {
      issues.push("SOURCE_DISPATCH_ALREADY_AUTHORIZED");
    }
    if (source.timing?.started_at || source.timing?.completed_at) {
      issues.push("SOURCE_ALREADY_STARTED");
    }
    if (Object.keys(object(source.output)).length !== 0) {
      issues.push("SOURCE_OUTPUT_PRESENT");
    }
  }

  if (review) {
    if (text(review.status) !== "WAITING") {
      issues.push(`REVIEW_STATUS_INVALID:${review.status}`);
    }
    if (review.provider_id !== null || review.cost?.approved !== false) {
      issues.push("REVIEW_WAS_BOUND_OR_APPROVED");
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

      const country = source.input?.country ?? null;
      const currency = source.input?.currency ?? null;
      const providerPolicy = {
        ...object(organizationService?.provider_policy),
        ...object(
          source.input?.provider_policy ||
            source.metadata?.provider_policy,
        ),
      };
      selectedProvider = await resolveProvider({
        organization_id: organizationId,
        capability: executionCapability,
        preferredProvider: source.provider_id,
        country,
        currency,
        policy: providerPolicy,
      });
      credential = await resolveProviderCredential({
        organization_id: organizationId,
        provider: selectedProvider.provider,
        credential_id: selectedProvider.credential_id || null,
      });
      pricing = await PricingRuntime.resolve({
        provider: selectedProvider.provider,
        model: selectedProvider.model,
        capability: executionCapability,
        country,
        currency,
      });
      guard = CreativeApprovedProductionTaskCostGuardRuntime.guardFromTask(
        source,
      );
      costGuardEvidence =
        ServiceExecutionCostGuardRuntime.validatePricing(pricing, guard);

      const context = {
        organization_id: organizationId,
        party_id: null,
        entity_id: null,
        credential_id: selectedProvider.credential_id || null,
        organization_service_id: organizationService?.id || null,
        country,
        currency: pricing.currency,
        usage_id: null,
      };
      structuredInput = {
        capability: executionCapability,
        model: selectedProvider.model,
        ...object(source.input),
        payload: source.input,
        ...object(credential),
        credential: credential || null,
        context,
        credential_id: context.credential_id,
      };
      if (hasStructuredCreativeInstruction(structuredInput)) {
        const instruction = serializeCreativeProviderInstruction(
          structuredInput,
        );
        structuredInput = {
          ...structuredInput,
          prompt: instruction,
          provider_prompt: instruction,
          prompt_serialization_contract: {
            contract: "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1",
            boundary: "EXECUTION_TRANSPORT_ONLY",
            persisted: false,
          },
        };
      }
      preparedInput = await prepareRunwayProviderInputByProbe(
        structuredInput,
      );
      request = await RunwayProviderRequestRuntime.build(preparedInput);
    } catch (error) {
      issues.push(`REQUEST_MATERIALIZATION_FAILED:${error.message}`);
    }
  }

  const bodyKeys = Object.keys(object(request?.body)).sort();
  const unexpectedBodyKeys = bodyKeys.filter(
    (key) => !ALLOWED_RUNWAY_BODY_KEYS.has(key),
  );
  const promptLength = text(request?.prompt).length;
  const identityRequired = request?.lock?.required === true;
  const referenceCount = list(request?.referenceIds).length;
  const sourcePresent = Boolean(request?.source);
  const sourceTransport = text(request?.source?.transport) || null;
  const safeBody = safeRequestBody(request?.body);
  const expectedEndpointSuffix = sourcePresent
    ? "/v1/image_to_video"
    : "/v1/text_to_video";

  if (selectedProvider) {
    if (text(selectedProvider.provider) !== "runway") {
      issues.push("SELECTED_PROVIDER_CHANGED");
    }
    if (text(selectedProvider.model) !== "gen4.5") {
      issues.push("SELECTED_MODEL_CHANGED");
    }
    if (
      text(selectedProvider.pricing_id) &&
      text(selectedProvider.pricing_id) !== text(pricing?.pricing_id)
    ) {
      issues.push("SELECTED_PRICING_ID_CHANGED");
    }
  }
  if (pricing) {
    if (
      text(pricing.pricing_id) !==
      text(source?.metadata?.approved_pricing_id)
    ) {
      issues.push("LIVE_PRICING_ID_DIFFERS_FROM_APPROVAL");
    }
    if (money(pricing.customer_price) !== money(source?.cost?.estimated)) {
      issues.push("LIVE_PRICE_DIFFERS_FROM_APPROVAL");
    }
    if (text(pricing.currency) !== text(source?.cost?.currency)) {
      issues.push("LIVE_PRICING_CURRENCY_DIFFERS_FROM_APPROVAL");
    }
  }
  if (costGuardEvidence?.passed !== true) {
    issues.push("APPROVED_COST_GUARD_FAILED");
  }
  if (!runwayEnvironmentCredentialPresent && !selectedProvider?.credential_id) {
    issues.push("RUNWAY_EXECUTION_CREDENTIAL_UNAVAILABLE");
  }
  if (!request) {
    issues.push("RUNWAY_REQUEST_NOT_MATERIALIZED");
  } else {
    if (text(request.model) !== "gen4.5") {
      issues.push("RUNWAY_REQUEST_MODEL_INVALID");
    }
    if (!text(request.endpoint).endsWith(expectedEndpointSuffix)) {
      issues.push("RUNWAY_REQUEST_ENDPOINT_INVALID");
    }
    if (!promptLength || promptLength > 1000) {
      issues.push("RUNWAY_PROMPT_LENGTH_INVALID");
    }
    if (unexpectedBodyKeys.length) {
      issues.push(`RUNWAY_BODY_KEYS_INVALID:${unexpectedBodyKeys.join(",")}`);
    }
    if (money(request.body?.duration) < 2 || money(request.body?.duration) > 10) {
      issues.push("RUNWAY_DURATION_INVALID");
    }
    if (!["1280:720", "720:1280", "960:960"].includes(text(request.body?.ratio))) {
      issues.push("RUNWAY_RATIO_INVALID");
    }
    if (identityRequired && referenceCount === 0) {
      issues.push("IDENTITY_REFERENCE_SET_MISSING");
    }
    if (identityRequired && !sourcePresent) {
      issues.push("IDENTITY_SOURCE_MISSING");
    }
    if (sourcePresent && !["DATA_URI_EXISTING", "DATA_URI_NORMALIZED_JPEG"].includes(sourceTransport)) {
      issues.push("RUNWAY_SOURCE_TRANSPORT_INVALID");
    }
    if (request.body?.promptText !== request.prompt) {
      issues.push("RUNWAY_PROMPT_BODY_MISMATCH");
    }
    if (sourcePresent && !request.body?.promptImage) {
      issues.push("RUNWAY_PROMPT_IMAGE_BODY_MISSING");
    }
  }

  dispatchPlans.push({
    execution_node_id: text(approvedItem.execution_node_id),
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    service_id: serviceId,
    execution_capability: executionCapability,
    selected_provider: selectedProvider?.provider || null,
    selected_model: selectedProvider?.model || null,
    selected_pricing_id: pricing?.pricing_id || null,
    selected_customer_price: money(pricing?.customer_price),
    selected_supplier_cost: money(pricing?.supplier_cost),
    selected_currency: text(pricing?.currency) || null,
    expected_wallet_reservation: money(pricing?.customer_price),
    cost_guard_passed: costGuardEvidence?.passed === true,
    cost_guard_evidence: costGuardEvidence || null,
    environment_credential_present: runwayEnvironmentCredentialPresent,
    credential_record_present: Boolean(selectedProvider?.credential_id),
    credential_runtime_object_present: Boolean(credential),
    provider_instruction_serialized:
      preparedInput?.prompt_serialization_contract?.contract ===
      "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1",
    provider_instruction_persisted: false,
    prepared_input_sha256: preparedInput
      ? sha256(safePreparedInput(preparedInput))
      : null,
    request_endpoint: request?.endpoint || null,
    request_api_version: request?.apiVersion || null,
    request_model: request?.model || null,
    request_body_keys: bodyKeys,
    request_body_sha256: request ? sha256(request.body) : null,
    safe_request_body: safeBody,
    prompt_length: promptLength,
    prompt_sha256: request?.prompt ? sha256(request.prompt) : null,
    identity_required: identityRequired,
    identity_reference_count: referenceCount,
    identity_reference_ids_sha256: referenceCount
      ? sha256(request.referenceIds)
      : null,
    source_present: sourcePresent,
    source_transport: sourceTransport,
    source_content_type: request?.source?.content_type || null,
    source_bytes: Number(request?.source?.source_bytes || 0),
    normalized_bytes: Number(request?.source?.normalized_bytes || 0),
    encoded_bytes: Number(request?.source?.encoded_bytes || 0),
    source_width: Number(request?.source?.width || 0),
    source_height: Number(request?.source?.height || 0),
    source_aspect_ratio: Number(request?.source?.aspect_ratio || 0),
    review_dependency_blocked: Boolean(
      review &&
      source &&
      text(review.status) === "WAITING" &&
      list(review.depends_on).length === 1 &&
      text(review.depends_on[0]) === source.id,
    ),
    provider_spend_authorized: false,
    dispatch_authorized: false,
    wallet_reservation_authorized: false,
    provider_call_authorized: false,
    issues,
    ready: issues.length === 0,
  });
}

requireValue(dispatchPlans.length === 9, "DISPATCH_PLAN_COUNT_INVALID");
if (dispatchPlans.some((plan) => !plan.ready)) {
  blockers.push("ONE_OR_MORE_DISPATCH_MATERIALIZATIONS_BLOCKED");
}

const selectedSourceCost = money(
  dispatchPlans.reduce(
    (sum, plan) => sum + Number(plan.selected_customer_price || 0),
    0,
  ),
);
const expectedWalletReservation = money(
  dispatchPlans.reduce(
    (sum, plan) => sum + Number(plan.expected_wallet_reservation || 0),
    0,
  ),
);
const costGuardPassedCount = dispatchPlans.filter(
  (plan) => plan.cost_guard_passed,
).length;
const requestMaterializedCount = dispatchPlans.filter(
  (plan) => Boolean(plan.request_body_sha256),
).length;
const identityRequiredCount = dispatchPlans.filter(
  (plan) => plan.identity_required,
).length;
const identityReadyCount = dispatchPlans.filter(
  (plan) =>
    !plan.identity_required ||
    (plan.identity_reference_count > 0 && plan.source_present),
).length;
const sourcePresentCount = dispatchPlans.filter(
  (plan) => plan.source_present,
).length;
const serializedInstructionCount = dispatchPlans.filter(
  (plan) => plan.provider_instruction_serialized,
).length;
const reviewDependencyBlockedCount = dispatchPlans.filter(
  (plan) => plan.review_dependency_blocked,
).length;

requireValue(selectedSourceCost === 47.34288, "SELECTED_SOURCE_COST_INVALID");
requireValue(
  expectedWalletReservation === 47.34288,
  "EXPECTED_WALLET_RESERVATION_INVALID",
);
requireValue(
  before.wallet_balance >= expectedWalletReservation,
  "WALLET_BALANCE_INSUFFICIENT",
);
requireValue(costGuardPassedCount === 9, "COST_GUARD_PASSED_COUNT_INVALID");
requireValue(
  requestMaterializedCount === 9,
  "REQUEST_MATERIALIZED_COUNT_INVALID",
);
requireValue(identityReadyCount === 9, "IDENTITY_READY_COUNT_INVALID");
requireValue(
  serializedInstructionCount === 9,
  "SERIALIZED_INSTRUCTION_COUNT_INVALID",
);
requireValue(
  reviewDependencyBlockedCount === 9,
  "REVIEW_DEPENDENCY_BLOCKED_COUNT_INVALID",
);

const dispatchContract = {
  contract: "PAIR_REPAIR_SOURCE_DISPATCH_MATERIALIZATION_CONTRACT_V1",
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  live_task_state_sha256: before.task_state_sha256,
  source_approval_audit_file_sha256: approvalAuditFile.file_sha256,
  selected_source_cost: selectedSourceCost,
  expected_wallet_reservation: expectedWalletReservation,
  currency: "THB",
  dispatches: dispatchPlans.map((plan) => ({
    source_task_id: plan.source_task_id,
    review_task_id: plan.review_task_id,
    provider: plan.selected_provider,
    model: plan.selected_model,
    pricing_id: plan.selected_pricing_id,
    customer_price: plan.selected_customer_price,
    request_body_sha256: plan.request_body_sha256,
    prepared_input_sha256: plan.prepared_input_sha256,
  })),
};
const dispatchContractSha = sha256(dispatchContract);

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
  blockers.push("READ_ONLY_DISPATCH_MATERIALIZATION_PREVIEW_CHANGED_STATE");
}

const decision = blockers.length
  ? "REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_BLOCKED"
  : "REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_9_SOURCES_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_BLOCKED"
  : "READY_FOR_EXPLICIT_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_DESIGN";
const instruction = blockers.length
  ? "Resolve every dispatch-materialization blocker before authorizing wallet reservations or calling Runway."
  : "This preview authorizes nothing. A later dispatch workflow must require a new explicit token bound to this dispatch contract, reserve no more than 47.342880 THB, dispatch only the nine approved source tasks, leave all review tasks dependency-blocked, and stop before polling or review execution unless separately authorized.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  source_approval_audit_file: approvalAuditFile.absolute,
  source_approval_audit_file_sha256: approvalAuditFile.file_sha256,
  task_count: before.task_count,
  task_status_counts: before.task_status_counts,
  source_task_count: dispatchPlans.length,
  review_task_count: list(approvalAudit.source_audits).length,
  selected_source_cost: selectedSourceCost,
  expected_wallet_reservation: expectedWalletReservation,
  currency: "THB",
  wallet_balance: before.wallet_balance,
  wallet_headroom_after_full_reservation: money(
    before.wallet_balance - expectedWalletReservation,
  ),
  cost_guard_passed_count: costGuardPassedCount,
  request_materialized_count: requestMaterializedCount,
  identity_required_count: identityRequiredCount,
  identity_ready_count: identityReadyCount,
  source_present_count: sourcePresentCount,
  serialized_instruction_count: serializedInstructionCount,
  review_dependency_blocked_count: reviewDependencyBlockedCount,
  dispatch_contract: dispatchContract,
  dispatch_contract_sha256: dispatchContractSha,
  dispatch_plans: dispatchPlans,
  asset_reads_executed: true,
  asset_writes_executed: false,
  prompt_values_exposed: false,
  image_data_exposed: false,
  credential_values_exposed: false,
  provider_binding_authorized: true,
  cost_approval_authorized: true,
  provider_spend_authorized: false,
  dispatch_authorized: false,
  wallet_reservation_authorized: false,
  provider_call_authorized: false,
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
console.log("READ-ONLY REPAIR SOURCE DISPATCH MATERIALIZATION PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${dispatchPlans.length}`);
console.log(`REVIEW_TASK_COUNT=${list(approvalAudit.source_audits).length}`);
console.log(`SELECTED_SOURCE_COST=${selectedSourceCost}`);
console.log(`EXPECTED_WALLET_RESERVATION=${expectedWalletReservation}`);
console.log(`CURRENCY=THB`);
console.log(`WALLET_BALANCE=${before.wallet_balance}`);
console.log(
  `WALLET_HEADROOM_AFTER_FULL_RESERVATION=${money(
    before.wallet_balance - expectedWalletReservation,
  )}`,
);
console.log(`COST_GUARD_PASSED_COUNT=${costGuardPassedCount}`);
console.log(`REQUEST_MATERIALIZED_COUNT=${requestMaterializedCount}`);
console.log(`IDENTITY_REQUIRED_COUNT=${identityRequiredCount}`);
console.log(`IDENTITY_READY_COUNT=${identityReadyCount}`);
console.log(`SOURCE_PRESENT_COUNT=${sourcePresentCount}`);
console.log(`SERIALIZED_INSTRUCTION_COUNT=${serializedInstructionCount}`);
console.log(
  `REVIEW_DEPENDENCY_BLOCKED_COUNT=${reviewDependencyBlockedCount}`,
);
console.log(`DISPATCH_CONTRACT_SHA256=${dispatchContractSha}`);

for (const plan of dispatchPlans) {
  console.log([
    `SOURCE_DISPATCH_MATERIALIZATION=${plan.execution_node_id}`,
    `source=${plan.source_task_id || ""}`,
    `review=${plan.review_task_id || ""}`,
    `provider=${plan.selected_provider || ""}`,
    `model=${plan.selected_model || ""}`,
    `pricing_id=${plan.selected_pricing_id || ""}`,
    `reservation=${plan.expected_wallet_reservation}`,
    `cost_guard=${plan.cost_guard_passed ? "PASS" : "FAIL"}`,
    `endpoint=${plan.request_endpoint || ""}`,
    `body_keys=${plan.request_body_keys.join(",")}`,
    `request_sha=${plan.request_body_sha256 || ""}`,
    `prompt_length=${plan.prompt_length}`,
    `identity_required=${plan.identity_required ? "YES" : "NO"}`,
    `identity_references=${plan.identity_reference_count}`,
    `source_present=${plan.source_present ? "YES" : "NO"}`,
    `source_transport=${plan.source_transport || ""}`,
    `source_dimensions=${plan.source_width}x${plan.source_height}`,
    `review_blocked=${plan.review_dependency_blocked ? "YES" : "NO"}`,
    `issues=${plan.issues.join(",")}`,
    `ready=${plan.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`DISPATCH_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`DISPATCH_PREVIEW_DECISION=${decision}`);
console.log(`DISPATCH_PREVIEW_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("ASSET_READS_EXECUTED=YES");
console.log("ASSET_WRITES_EXECUTED=NO");
console.log("PROMPT_VALUES_EXPOSED=NO");
console.log("IMAGE_DATA_EXPOSED=NO");
console.log("CREDENTIAL_VALUES_EXPOSED=NO");
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATION_AUTHORIZED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_SPEND_AUTHORIZED=NO");
console.log("DISPATCH_AUTHORIZED=NO");
console.log("PROVIDER_CALL_AUTHORIZED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("DOWNSTREAM_TASKS_UPDATED=0");
console.log("FINALISATION_ELIGIBLE=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
