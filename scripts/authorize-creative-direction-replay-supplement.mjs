#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";
process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "false";

const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";
const SUPPLEMENT_CONTRACT =
  "CREATIVE_DIRECTION_REPLAY_SUPPLEMENT_AUTHORIZATION_V1";
const REPLAY_SOURCE_CONTRACT =
  "CREATIVE_DIRECTION_IMMUTABLE_REPLAY_SOURCE_V1";
const REASONING_BUDGET_CONTRACT =
  "CREATIVE_REASONING_BUDGET_V1";

const EXACT_AUTHORIZATION_TEXT =
  "MAXIMUM ADDITIONAL CHARGE OF 10 THB FOR THESE THREE OPENAI REASONING CALLS ONLY";
const MAXIMUM_CUSTOMER_PRICE = 10;
const MAXIMUM_CALLS = 3;
const APPROVAL_DURATION_MINUTES = 90;
const MAXIMUM_REQUESTED_OUTPUT_TOKENS = 28000;
const MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS = 16000;
const MAXIMUM_PROMPT_CHARACTERS = 1000000;
const MAXIMUM_TOTAL_PROMPT_CHARACTERS = 3000000;

const ALLOWED_OPERATIONS = Object.freeze([
  "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1",
  "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
  "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameStrings(left = [], right = []) {
  return JSON.stringify([...left].map(text).sort()) ===
    JSON.stringify([...right].map(text).sort());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateSourceApproval(approval, expectedId, commandIdentity) {
  assert(
    approval.contract === APPROVAL_CONTRACT,
    "REPLAY_SOURCE_APPROVAL_CONTRACT_INVALID",
  );
  assert(
    text(approval.id) === expectedId,
    `REPLAY_SOURCE_APPROVAL_ID_MISMATCH:${text(approval.id)}:${expectedId}`,
  );
  assert(
    text(approval.command_identity) === commandIdentity,
    "REPLAY_SOURCE_COMMAND_IDENTITY_MISMATCH",
  );
  assert(
    text(approval.status).toUpperCase() === "COMPLETED",
    `REPLAY_SOURCE_STATUS_INVALID:${text(approval.status)}`,
  );
  assert(
    approval.approved === false,
    "REPLAY_SOURCE_APPROVED_FLAG_INVALID",
  );
  assert(
    Number(approval.call_count) === 20 &&
      Number(approval.maximum_calls) === 20,
    `REPLAY_SOURCE_CALL_COUNT_INVALID:${approval.call_count}:${approval.maximum_calls}`,
  );
  assert(
    list(approval.operations).length === 20,
    `REPLAY_SOURCE_LEDGER_COUNT_INVALID:${list(approval.operations).length}:20`,
  );

  const operations = list(approval.operations)
    .map((entry) => ({
      ...object(entry),
      sequence: Number(entry?.sequence),
      operation: text(entry?.operation).toUpperCase(),
      usage_id: text(entry?.usage_id),
    }))
    .sort((left, right) => left.sequence - right.sequence);

  for (let index = 0; index < operations.length; index += 1) {
    const entry = operations[index];
    const expectedSequence = index + 1;
    assert(
      entry.sequence === expectedSequence,
      `REPLAY_SOURCE_SEQUENCE_INVALID:${entry.sequence}:${expectedSequence}`,
    );
    assert(
      Boolean(entry.operation),
      `REPLAY_SOURCE_OPERATION_REQUIRED:${expectedSequence}`,
    );
    assert(
      Boolean(entry.usage_id),
      `REPLAY_SOURCE_USAGE_REQUIRED:${expectedSequence}`,
    );
  }

  assert(
    operations[15]?.operation ===
      "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1",
    `REPLAY_SOURCE_SEQUENCE_16_INVALID:${operations[15]?.operation || "MISSING"}`,
  );

  return operations;
}

function validateExistingSupplement(
  approval,
  sourceApprovalId,
  commandIdentity,
) {
  const expiresAt = Date.parse(text(approval.expires_at));
  return Boolean(
    approval.contract === APPROVAL_CONTRACT &&
    approval.supplemental_authorization_contract ===
      SUPPLEMENT_CONTRACT &&
    text(approval.source_approval_id) === sourceApprovalId &&
    text(approval.command_identity) === commandIdentity &&
    approval.approved === true &&
    ["APPROVED", "IN_PROGRESS"].includes(
      text(approval.status).toUpperCase(),
    ) &&
    Number(approval.maximum_calls) === MAXIMUM_CALLS &&
    Number(approval.call_count || 0) === 0 &&
    Number(approval.maximum_customer_price) ===
      MAXIMUM_CUSTOMER_PRICE &&
    Number(approval.spent_customer_price || 0) === 0 &&
    list(approval.operations).length === 0 &&
    sameStrings(approval.allowed_operations, ALLOWED_OPERATIONS) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  );
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);
const expectedSourceApprovalId = text(
  process.env.EXPECTED_SOURCE_APPROVAL_ID,
);
const expectedCommandIdentity = text(
  process.env.EXPECTED_COMMAND_IDENTITY,
);
const authorizationFlag =
  text(
    process.env
      .CREATIVE_SUPPLEMENTAL_DIRECTION_APPROVAL_AUTHORIZED,
  ).toLowerCase() === "true";
const suppliedAuthorizationText = text(
  process.env.CREATIVE_SUPPLEMENTAL_DIRECTION_AUTHORIZATION_TEXT,
);
const requestedMaximum = finite(
  process.env
    .CREATIVE_SUPPLEMENTAL_DIRECTION_MAXIMUM_CUSTOMER_PRICE,
);
const requestedCalls = finite(
  process.env.CREATIVE_SUPPLEMENTAL_DIRECTION_MAXIMUM_CALLS,
);

assert(Boolean(sourceGraphId), "SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");
assert(
  Boolean(expectedSourceApprovalId),
  "EXPECTED_SOURCE_APPROVAL_ID_REQUIRED",
);
assert(
  Boolean(expectedCommandIdentity),
  "EXPECTED_COMMAND_IDENTITY_REQUIRED",
);
assert(
  authorizationFlag,
  "EXPLICIT_SUPPLEMENTAL_DIRECTION_AUTHORIZATION_REQUIRED",
);
assert(
  normalized(suppliedAuthorizationText) ===
    normalized(EXACT_AUTHORIZATION_TEXT),
  "SUPPLEMENTAL_DIRECTION_AUTHORIZATION_TEXT_MISMATCH",
);
assert(
  requestedMaximum === MAXIMUM_CUSTOMER_PRICE,
  `SUPPLEMENTAL_DIRECTION_MAXIMUM_INVALID:${requestedMaximum}:${MAXIMUM_CUSTOMER_PRICE}`,
);
assert(
  requestedCalls === MAXIMUM_CALLS,
  `SUPPLEMENTAL_DIRECTION_CALL_COUNT_INVALID:${requestedCalls}:${MAXIMUM_CALLS}`,
);

const [
  ProductionGraphRepository,
  { CreativeProjectRuntime },
  { WalletRepository },
  { getProviderPricingById },
] = await Promise.all([
  import(
    "@/lib/creative/production-graph/repositories/ProductionGraphRepository"
  ),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import(
    "@/lib/platform/service-runtime/wallet/repositories/WalletRepository"
  ),
  import(
    "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository"
  ),
]);

const graph = await ProductionGraphRepository.getById(sourceGraphId);
assert(Boolean(graph), `SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);

const organizationId = text(graph.organization_id);
const projectId = text(graph.creative_project_id);
assert(
  Boolean(organizationId && projectId),
  "SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE",
);

let project = await CreativeProjectRuntime.get(projectId);
assert(Boolean(project), `CREATIVE_PROJECT_NOT_FOUND:${projectId}`);
assert(
  text(project.organization_id) === organizationId,
  "CREATIVE_PROJECT_ORGANIZATION_MISMATCH",
);
assert(
  text(project.metadata?.command_identity) ===
    expectedCommandIdentity,
  "PROJECT_COMMAND_IDENTITY_MISMATCH",
);

const metadata = object(project.metadata);
const currentApproval = object(metadata.paid_direction_approval);
const archivedSource = object(
  metadata.paid_direction_replay_source,
);

let sourceApproval;
if (text(currentApproval.id) === expectedSourceApprovalId) {
  sourceApproval = currentApproval;
} else if (text(archivedSource.id) === expectedSourceApprovalId) {
  sourceApproval = archivedSource;
} else {
  throw new Error(
    `REPLAY_SOURCE_APPROVAL_NOT_FOUND:${expectedSourceApprovalId}`,
  );
}

const sourceOperations = validateSourceApproval(
  sourceApproval,
  expectedSourceApprovalId,
  expectedCommandIdentity,
);

if (
  text(currentApproval.id) !== expectedSourceApprovalId &&
  validateExistingSupplement(
    currentApproval,
    expectedSourceApprovalId,
    expectedCommandIdentity,
  )
) {
  console.log("============================================================");
  console.log("SUPPLEMENTAL DIRECTION APPROVAL");
  console.log("============================================================");
  console.log("SUPPLEMENTAL_APPROVAL_MODE=REUSED_EXISTING");
  console.log(`ORGANIZATION_ID=${organizationId}`);
  console.log(`CREATIVE_PROJECT_ID=${projectId}`);
  console.log(`SOURCE_APPROVAL_ID=${expectedSourceApprovalId}`);
  console.log(`SUPPLEMENTAL_APPROVAL_ID=${currentApproval.id}`);
  console.log(`MAXIMUM_CALLS=${currentApproval.maximum_calls}`);
  console.log(
    `MAXIMUM_CUSTOMER_PRICE=${currentApproval.maximum_customer_price}`,
  );
  console.log(`CURRENCY=${currentApproval.currency}`);
  console.log(`EXPIRES_AT=${currentApproval.expires_at}`);
  console.log(
    `ALLOWED_OPERATIONS=${JSON.stringify(currentApproval.allowed_operations)}`,
  );
  console.log("PROJECT_METADATA_CHANGED=NO");
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("WALLET_CHANGED=NO");
  console.log("GRAPH_CREATED=NO");
  console.log("TASKS_CREATED=NO");
  process.exit(0);
}

assert(
  text(currentApproval.id) === expectedSourceApprovalId,
  `UNEXPECTED_ACTIVE_DIRECTION_APPROVAL:${text(currentApproval.id) || "MISSING"}`,
);

const [pricing, wallet] = await Promise.all([
  getProviderPricingById(text(sourceApproval.pricing_id)),
  WalletRepository.getByOrganization(organizationId),
]);

assert(
  pricing?.active === true,
  `ACTIVE_PRICING_NOT_FOUND:${text(sourceApproval.pricing_id)}`,
);
assert(
  text(pricing.provider) === text(sourceApproval.provider),
  "SUPPLEMENTAL_DIRECTION_PROVIDER_CHANGED",
);
assert(
  text(pricing.model) === text(sourceApproval.model),
  "SUPPLEMENTAL_DIRECTION_MODEL_CHANGED",
);
assert(
  text(pricing.currency).toUpperCase() ===
    text(sourceApproval.currency).toUpperCase(),
  "SUPPLEMENTAL_DIRECTION_CURRENCY_CHANGED",
);

const currency = text(sourceApproval.currency).toUpperCase();
assert(currency === "THB", `SUPPLEMENTAL_DIRECTION_CURRENCY_INVALID:${currency}`);
assert(Boolean(wallet?.id), "ORGANIZATION_WALLET_NOT_FOUND");
assert(
  text(wallet.currency).toUpperCase() === currency,
  `WALLET_CURRENCY_MISMATCH:${text(wallet.currency)}:${currency}`,
);
assert(
  Number(wallet.available_balance) >= MAXIMUM_CUSTOMER_PRICE,
  `WALLET_BALANCE_INSUFFICIENT:${wallet.available_balance}:${MAXIMUM_CUSTOMER_PRICE}`,
);

const sourcePerCallMaximum = finite(
  sourceApproval.maximum_per_call_customer_price,
);
assert(
  sourcePerCallMaximum !== null && sourcePerCallMaximum > 0,
  "REPLAY_SOURCE_PER_CALL_MAXIMUM_INVALID",
);
const maximumPerCallCustomerPrice = Number(
  Math.min(
    MAXIMUM_CUSTOMER_PRICE,
    sourcePerCallMaximum,
  ).toFixed(6),
);

const approvedAt = new Date();
const expiresAt = new Date(
  approvedAt.getTime() +
  APPROVAL_DURATION_MINUTES * 60 * 1000,
);
const supplementalApprovalId = crypto.randomUUID();
const authorizationId = crypto.randomUUID();

const replaySource = {
  ...sourceApproval,
  replay_source_contract: REPLAY_SOURCE_CONTRACT,
  immutable_replay_source: true,
  archived_for_replay_at: approvedAt.toISOString(),
  archived_by_supplemental_authorization_id: authorizationId,
};

const supplementalApproval = {
  contract: APPROVAL_CONTRACT,
  supplemental_authorization_contract: SUPPLEMENT_CONTRACT,
  supplemental_authorization_id: authorizationId,
  id: supplementalApprovalId,
  approved: true,
  status: "APPROVED",
  scope: "CREATIVE_DIRECTION_REPLAY_SUPPLEMENT",
  source_approval_id: expectedSourceApprovalId,
  replay_sequences: {
    start: 1,
    end: 16,
    skip: [16],
    recover: [1, 15],
  },
  command_identity: expectedCommandIdentity,
  provider: text(sourceApproval.provider),
  model: text(sourceApproval.model),
  pricing_id: text(sourceApproval.pricing_id),
  currency,
  maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
  maximum_per_call_customer_price: maximumPerCallCustomerPrice,
  maximum_calls: MAXIMUM_CALLS,
  call_count: 0,
  spent_customer_price: 0,
  remaining_customer_price: MAXIMUM_CUSTOMER_PRICE,
  operations: [],
  allowed_operations: [...ALLOWED_OPERATIONS],
  maximum_requested_output_tokens:
    MAXIMUM_REQUESTED_OUTPUT_TOKENS,
  maximum_single_call_output_tokens:
    MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS,
  maximum_prompt_characters: MAXIMUM_PROMPT_CHARACTERS,
  maximum_total_prompt_characters:
    MAXIMUM_TOTAL_PROMPT_CHARACTERS,
  approved_at: approvedAt.toISOString(),
  expires_at: expiresAt.toISOString(),
  approval_duration_minutes: APPROVAL_DURATION_MINUTES,
  explicit_user_authorization: true,
  explicit_user_authorization_text:
    EXACT_AUTHORIZATION_TEXT,
  media_generation_authorized: false,
  graph_materialization_authorized: false,
  task_materialization_authorized: false,
  repair_execution_authorized: false,
  publication_authorized: false,
  retry_required: false,
  execution_error: null,
};

const reasoningBudget = {
  contract: REASONING_BUDGET_CONTRACT,
  id: supplementalApprovalId,
  budget_id: supplementalApprovalId,
  source_approval_id: expectedSourceApprovalId,
  maximum_calls: MAXIMUM_CALLS,
  maximum_requested_output_tokens:
    MAXIMUM_REQUESTED_OUTPUT_TOKENS,
  maximum_single_call_output_tokens:
    MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS,
  maximum_prompt_characters: MAXIMUM_PROMPT_CHARACTERS,
  maximum_total_prompt_characters:
    MAXIMUM_TOTAL_PROMPT_CHARACTERS,
  maximum_customer_price: MAXIMUM_CUSTOMER_PRICE,
  currency,
};

const existingHistory = list(
  metadata.paid_direction_approval_history,
);
const history = existingHistory.some(
  (entry) => text(entry?.id) === expectedSourceApprovalId,
)
  ? existingHistory
  : [...existingHistory, replaySource];

const authorizationEvidence = {
  contract: SUPPLEMENT_CONTRACT,
  id: authorizationId,
  authorized: true,
  authorization_text: EXACT_AUTHORIZATION_TEXT,
  authorized_at: approvedAt.toISOString(),
  source_approval_id: expectedSourceApprovalId,
  supplemental_approval_id: supplementalApprovalId,
  maximum_additional_customer_price:
    MAXIMUM_CUSTOMER_PRICE,
  maximum_calls: MAXIMUM_CALLS,
  currency,
  provider: text(sourceApproval.provider),
  model: text(sourceApproval.model),
  pricing_id: text(sourceApproval.pricing_id),
  allowed_operations: [...ALLOWED_OPERATIONS],
  replayed_source_sequence_range: [1, 15],
  regenerated_source_sequence: 16,
  media_generation_authorized: false,
  graph_materialization_authorized: false,
  task_materialization_authorized: false,
  repair_execution_authorized: false,
  publication_authorized: false,
};

project = await CreativeProjectRuntime.get(projectId);
const latestMetadata = object(project?.metadata);
assert(
  text(latestMetadata.command_identity) ===
    expectedCommandIdentity,
  "PROJECT_COMMAND_IDENTITY_CHANGED_BEFORE_ACTIVATION",
);
assert(
  text(latestMetadata.paid_direction_approval?.id) ===
    expectedSourceApprovalId,
  "ACTIVE_DIRECTION_APPROVAL_CHANGED_BEFORE_ACTIVATION",
);

await CreativeProjectRuntime.update(projectId, {
  metadata: {
    ...latestMetadata,
    paid_direction_replay_source: replaySource,
    paid_direction_approval_history: history,
    paid_direction_approval: supplementalApproval,
    creative_reasoning_budget: reasoningBudget,
    paid_direction_supplemental_authorization:
      authorizationEvidence,
  },
});

const verified = await CreativeProjectRuntime.get(projectId);
const verifiedMetadata = object(verified?.metadata);
const verifiedActive = object(
  verifiedMetadata.paid_direction_approval,
);
const verifiedSource = object(
  verifiedMetadata.paid_direction_replay_source,
);

assert(
  text(verifiedActive.id) === supplementalApprovalId,
  "SUPPLEMENTAL_APPROVAL_WRITE_VERIFICATION_FAILED",
);
assert(
  text(verifiedSource.id) === expectedSourceApprovalId,
  "REPLAY_SOURCE_ARCHIVE_WRITE_VERIFICATION_FAILED",
);
assert(
  Number(verifiedActive.maximum_customer_price) ===
    MAXIMUM_CUSTOMER_PRICE,
  "SUPPLEMENTAL_APPROVAL_MAXIMUM_WRITE_MISMATCH",
);
assert(
  Number(verifiedActive.maximum_calls) === MAXIMUM_CALLS,
  "SUPPLEMENTAL_APPROVAL_CALL_COUNT_WRITE_MISMATCH",
);
assert(
  sameStrings(
    verifiedActive.allowed_operations,
    ALLOWED_OPERATIONS,
  ),
  "SUPPLEMENTAL_APPROVAL_OPERATIONS_WRITE_MISMATCH",
);

console.log("============================================================");
console.log("SUPPLEMENTAL DIRECTION APPROVAL");
console.log("============================================================");
console.log("SUPPLEMENTAL_APPROVAL_MODE=ACTIVATED_NEW");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log(`SOURCE_APPROVAL_ID=${expectedSourceApprovalId}`);
console.log(`SOURCE_LEDGER_COUNT=${sourceOperations.length}`);
console.log("REPLAY_SEQUENCE_START=1");
console.log("REPLAY_SEQUENCE_END=16");
console.log("REPLAY_SEQUENCE_SKIP=16");
console.log(`SUPPLEMENTAL_AUTHORIZATION_ID=${authorizationId}`);
console.log(`SUPPLEMENTAL_APPROVAL_ID=${supplementalApprovalId}`);
console.log(`PROVIDER=${supplementalApproval.provider}`);
console.log(`MODEL=${supplementalApproval.model}`);
console.log(`PRICING_ID=${supplementalApproval.pricing_id}`);
console.log(`CURRENCY=${currency}`);
console.log(`MAXIMUM_CALLS=${MAXIMUM_CALLS}`);
console.log(
  `MAXIMUM_PER_CALL_CUSTOMER_PRICE=${maximumPerCallCustomerPrice}`,
);
console.log(
  `MAXIMUM_CUSTOMER_PRICE=${MAXIMUM_CUSTOMER_PRICE}`,
);
console.log(`APPROVED_AT=${supplementalApproval.approved_at}`);
console.log(`EXPIRES_AT=${supplementalApproval.expires_at}`);
console.log(
  `ALLOWED_OPERATIONS=${JSON.stringify(ALLOWED_OPERATIONS)}`,
);
console.log(`WALLET_AVAILABLE_BALANCE=${wallet.available_balance}`);
console.log("PROJECT_METADATA_CHANGED=YES");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("USAGE_ROWS_CREATED=NO");
console.log("BILLING_ROWS_CREATED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("RUNWAY_PROVIDER_CALLS_AUTHORIZED=NO");
console.log("REPAIR_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("SUPPLEMENTAL_APPROVAL_ACTIVATION=PASS");
