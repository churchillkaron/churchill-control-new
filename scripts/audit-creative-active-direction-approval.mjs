#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";
process.env.CREATIVE_FRESH_DIRECTION_AUTHORIZED = "false";
process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "false";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function closeEnough(left, right) {
  return Math.abs(Number(left) - Number(right)) <= 0.000001;
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);

if (!sourceGraphId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");
}

const expectedApprovalId = text(process.env.EXPECTED_APPROVAL_ID);
const expectedCommandIdentity = text(process.env.EXPECTED_COMMAND_IDENTITY);
const expectedMaximumCustomerPrice = finite(
  process.env.EXPECTED_MAXIMUM_CUSTOMER_PRICE,
);
const expectedMaximumCalls = finite(process.env.EXPECTED_MAXIMUM_CALLS);
const expectedMaximumOutputTokens = finite(
  process.env.EXPECTED_MAXIMUM_REQUESTED_OUTPUT_TOKENS,
);

const [
  ProductionGraphRepository,
  CreativeProjectRepository,
  { WalletRepository },
  { PricingRuntime },
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
]);

const graph = await ProductionGraphRepository.getById(sourceGraphId);
if (!graph) {
  throw new Error(`SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);
}

const organizationId = text(graph.organization_id);
const projectId = text(graph.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

const [project, wallet] = await Promise.all([
  CreativeProjectRepository.getById(projectId),
  WalletRepository.getByOrganization(organizationId),
]);

if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("CREATIVE_PROJECT_NOT_FOUND_IN_SOURCE_SCOPE");
}

const metadata = object(project.metadata);
const approval = object(metadata.paid_direction_approval);
const reasoningBudget = object(
  metadata.reasoning_budget || metadata.creative_reasoning_budget,
);

let pricing = null;
let pricingError = null;
if (text(approval.pricing_id)) {
  try {
    pricing = await PricingRuntime.resolveById({
      pricing_id: approval.pricing_id,
      currency: approval.currency || null,
      usage: { quantity: 1 },
    });
  } catch (error) {
    pricingError = text(error?.message || error);
  }
}

const now = Date.now();
const approvedAt = timestamp(approval.approved_at);
const expiresAt = timestamp(approval.expires_at);
const status = text(approval.status).toUpperCase();
const maximumCustomerPrice = finite(approval.maximum_customer_price);
const maximumPerCallCustomerPrice = finite(
  approval.maximum_per_call_customer_price,
);
const maximumCalls = finite(approval.maximum_calls);
const callCount = finite(approval.call_count) ?? 0;
const spentCustomerPrice = Math.max(
  0,
  finite(approval.spent_customer_price) ?? 0,
);
const remainingCustomerPrice = maximumCustomerPrice === null
  ? null
  : Number(
      Math.max(0, maximumCustomerPrice - spentCustomerPrice).toFixed(6),
    );
const storedRemainingCustomerPrice = finite(
  approval.remaining_customer_price,
);
const walletBalance = finite(wallet?.available_balance) ?? 0;
const walletCurrency = text(wallet?.currency).toUpperCase();
const approvalCurrency = text(approval.currency).toUpperCase();
const projectCommandIdentity = text(metadata.command_identity);
const approvalCommandIdentity = text(approval.command_identity);

const blockers = [];

if (approval.contract !== "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2") {
  blockers.push("PAID_DIRECTION_APPROVAL_CONTRACT_INVALID");
}
if (!text(approval.id)) {
  blockers.push("PAID_DIRECTION_APPROVAL_ID_REQUIRED");
}
if (expectedApprovalId && text(approval.id) !== expectedApprovalId) {
  blockers.push(
    `PAID_DIRECTION_APPROVAL_ID_MISMATCH:${text(approval.id)}:${expectedApprovalId}`,
  );
}
if (approval.approved !== true) {
  blockers.push("PAID_DIRECTION_APPROVAL_NOT_APPROVED");
}
if (!["APPROVED", "IN_PROGRESS"].includes(status)) {
  blockers.push(`PAID_DIRECTION_APPROVAL_STATUS_INVALID:${status || "MISSING"}`);
}
if (approvedAt === null || approvedAt > now) {
  blockers.push("PAID_DIRECTION_APPROVED_AT_INVALID");
}
if (expiresAt === null || expiresAt <= now) {
  blockers.push("PAID_DIRECTION_APPROVAL_EXPIRED");
}
if (!projectCommandIdentity) {
  blockers.push("PROJECT_COMMAND_IDENTITY_REQUIRED");
}
if (approvalCommandIdentity !== projectCommandIdentity) {
  blockers.push("PAID_DIRECTION_COMMAND_IDENTITY_MISMATCH");
}
if (
  expectedCommandIdentity &&
  projectCommandIdentity !== expectedCommandIdentity
) {
  blockers.push(
    `PROJECT_COMMAND_IDENTITY_MISMATCH:${projectCommandIdentity}:${expectedCommandIdentity}`,
  );
}
if (maximumCustomerPrice === null || maximumCustomerPrice <= 0) {
  blockers.push("PAID_DIRECTION_MAXIMUM_CUSTOMER_PRICE_INVALID");
}
if (
  expectedMaximumCustomerPrice !== null &&
  !closeEnough(maximumCustomerPrice, expectedMaximumCustomerPrice)
) {
  blockers.push(
    `PAID_DIRECTION_MAXIMUM_CUSTOMER_PRICE_MISMATCH:${maximumCustomerPrice}:${expectedMaximumCustomerPrice}`,
  );
}
if (
  maximumPerCallCustomerPrice === null ||
  maximumPerCallCustomerPrice <= 0
) {
  blockers.push("PAID_DIRECTION_PER_CALL_MAXIMUM_INVALID");
}
if (maximumCalls === null || maximumCalls <= 0) {
  blockers.push("PAID_DIRECTION_MAXIMUM_CALLS_INVALID");
}
if (
  expectedMaximumCalls !== null &&
  maximumCalls !== expectedMaximumCalls
) {
  blockers.push(
    `PAID_DIRECTION_MAXIMUM_CALLS_MISMATCH:${maximumCalls}:${expectedMaximumCalls}`,
  );
}
if (callCount < 0 || (maximumCalls !== null && callCount >= maximumCalls)) {
  blockers.push(`PAID_DIRECTION_CALL_BUDGET_EXHAUSTED:${callCount}:${maximumCalls}`);
}
if (remainingCustomerPrice === null || remainingCustomerPrice <= 0) {
  blockers.push("PAID_DIRECTION_PRICE_BUDGET_EXHAUSTED");
}
if (
  storedRemainingCustomerPrice !== null &&
  remainingCustomerPrice !== null &&
  !closeEnough(storedRemainingCustomerPrice, remainingCustomerPrice)
) {
  blockers.push(
    `PAID_DIRECTION_REMAINING_PRICE_MISMATCH:${storedRemainingCustomerPrice}:${remainingCustomerPrice}`,
  );
}
if (reasoningBudget.contract !== "CREATIVE_REASONING_BUDGET_V1") {
  blockers.push("CREATIVE_REASONING_BUDGET_CONTRACT_INVALID");
}
if (
  expectedMaximumOutputTokens !== null &&
  finite(reasoningBudget.maximum_requested_output_tokens) !==
    expectedMaximumOutputTokens
) {
  blockers.push(
    `CREATIVE_REASONING_OUTPUT_TOKEN_BUDGET_MISMATCH:${finite(reasoningBudget.maximum_requested_output_tokens)}:${expectedMaximumOutputTokens}`,
  );
}
if (!wallet?.id) {
  blockers.push("ORGANIZATION_WALLET_NOT_FOUND");
}
if (walletCurrency !== approvalCurrency) {
  blockers.push(
    `WALLET_CURRENCY_MISMATCH:${walletCurrency || "MISSING"}:${approvalCurrency || "MISSING"}`,
  );
}
if (
  remainingCustomerPrice !== null &&
  walletBalance < remainingCustomerPrice
) {
  blockers.push(
    `WALLET_BALANCE_INSUFFICIENT:${walletBalance}:${remainingCustomerPrice}`,
  );
}
if (!pricing && pricingError) {
  blockers.push(`PAID_DIRECTION_PRICING_INVALID:${pricingError}`);
}
if (pricing) {
  if (text(pricing.provider) !== text(approval.provider)) {
    blockers.push("PAID_DIRECTION_PROVIDER_CHANGED");
  }
  if (text(pricing.model) !== text(approval.model)) {
    blockers.push("PAID_DIRECTION_MODEL_CHANGED");
  }
  if (text(pricing.currency).toUpperCase() !== approvalCurrency) {
    blockers.push("PAID_DIRECTION_PRICING_CURRENCY_CHANGED");
  }
  if (
    maximumPerCallCustomerPrice !== null &&
    Number(pricing.customer_price) > maximumPerCallCustomerPrice
  ) {
    blockers.push(
      `PAID_DIRECTION_CURRENT_PRICE_EXCEEDS_PER_CALL_MAXIMUM:${pricing.customer_price}:${maximumPerCallCustomerPrice}`,
    );
  }
}
if (metadata.creative_fresh_direction_authorized === true) {
  blockers.push("FRESH_DIRECTION_ALREADY_AUTHORIZED");
}
if (metadata.creative_provider_execution_authorized === true) {
  blockers.push("CREATIVE_PROVIDER_EXECUTION_ALREADY_AUTHORIZED");
}
if (metadata.repair_execution_authorized === true) {
  blockers.push("REPAIR_EXECUTION_ALREADY_AUTHORIZED");
}
if (metadata.publication_authorized === true) {
  blockers.push("PUBLICATION_ALREADY_AUTHORIZED");
}

console.log("============================================================");
console.log("STRICT ACTIVE DIRECTION APPROVAL AUDIT");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log("SOURCE_GRAPH_USAGE=READ_ONLY_PROJECT_LOCATOR_ONLY");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`APPROVAL_ID=${text(approval.id) || "MISSING"}`);
console.log(`APPROVAL_CONTRACT=${text(approval.contract) || "MISSING"}`);
console.log(`APPROVAL_STATUS=${status || "MISSING"}`);
console.log(`APPROVAL_APPROVED=${approval.approved === true ? "YES" : "NO"}`);
console.log(`APPROVED_AT=${approval.approved_at || "MISSING"}`);
console.log(`EXPIRES_AT=${approval.expires_at || "MISSING"}`);
console.log(`APPROVAL_EXPIRED=${expiresAt !== null && expiresAt <= now ? "YES" : "NO"}`);
console.log(`COMMAND_IDENTITY=${projectCommandIdentity || "MISSING"}`);
console.log(`APPROVAL_COMMAND_IDENTITY=${approvalCommandIdentity || "MISSING"}`);
console.log(`MAXIMUM_CUSTOMER_PRICE=${maximumCustomerPrice}`);
console.log(`MAXIMUM_PER_CALL_CUSTOMER_PRICE=${maximumPerCallCustomerPrice}`);
console.log(`MAXIMUM_CALLS=${maximumCalls}`);
console.log(`CALL_COUNT=${callCount}`);
console.log(`SPENT_CUSTOMER_PRICE=${spentCustomerPrice}`);
console.log(`REMAINING_CUSTOMER_PRICE=${remainingCustomerPrice}`);
console.log(`STORED_REMAINING_CUSTOMER_PRICE=${storedRemainingCustomerPrice}`);
console.log(`WALLET_ID=${wallet?.id || "NONE"}`);
console.log(`WALLET_CURRENCY=${walletCurrency || "MISSING"}`);
console.log(`WALLET_AVAILABLE_BALANCE=${walletBalance}`);
console.log(`PRICING=${JSON.stringify(pricing)}`);
console.log(`PRICING_ERROR=${pricingError || "NONE"}`);
console.log(`REASONING_BUDGET=${JSON.stringify(reasoningBudget)}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PROJECT_ROWS_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("USAGE_ROWS_CREATED=NO");
console.log("BILLING_ROWS_CREATED=NO");
console.log("FRESH_DIRECTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("============================================================");
console.log("STRICT APPROVAL RESULT");
console.log("============================================================");
console.log(`ACTIVE_DIRECTION_APPROVAL_READY=${blockers.length ? "NO" : "YES"}`);
console.log(`ACTIVE_DIRECTION_APPROVAL_BLOCKER_COUNT=${blockers.length}`);
console.log(`ACTIVE_DIRECTION_APPROVAL_BLOCKERS=${JSON.stringify(blockers)}`);

if (blockers.length) process.exitCode = 2;
