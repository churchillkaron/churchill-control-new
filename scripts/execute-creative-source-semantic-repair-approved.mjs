#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

const planFile = readJson(process.argv[2], "SOURCE_SEMANTIC_REPAIR_PLAN");
const output = path.resolve(
  text(process.env.SOURCE_SEMANTIC_REPAIR_EXECUTION_OUTPUT) ||
    "/tmp/creative-source-semantic-repair-execution.json",
);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");
if (text(planFile.value.organization_id) !== organizationId) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_ORGANIZATION_MISMATCH");
}
if (text(planFile.value.creative_project_id) !== projectId) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_PROJECT_MISMATCH");
}

const approvalMaximum = finite(planFile.value.pricing?.approval_ceiling);
const approvalCurrency = text(planFile.value.pricing?.currency).toUpperCase();
const approvedAt = text(process.env.SOURCE_SEMANTIC_REPAIR_APPROVED_AT);
if (approvalMaximum === null || approvalMaximum <= 0) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_APPROVAL_CEILING_REQUIRED");
}
if (!approvalCurrency) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_APPROVAL_CURRENCY_REQUIRED");
}
if (!approvedAt) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_APPROVED_AT_REQUIRED");
}

const {
  SupabaseStorageFetchRuntime,
} = await import(
  "@/lib/shared/supabase/SupabaseStorageFetchRuntime"
);

const {
  executeCreativeSourceSemanticRepair,
  sourceSemanticRepairApprovalLiteral,
} = await import(
  "@/lib/creative/assets/intelligence/runtime/CreativeSourceSemanticRepairExecutionRuntime"
);

const approvalLiteral = sourceSemanticRepairApprovalLiteral(planFile.value);

console.log("============================================================");
console.log("APPROVED CREATIVE SOURCE SEMANTIC REPAIR");
console.log("============================================================");
console.log(`PLAN=${planFile.absolute}`);
console.log(`PLAN_HASH=${planFile.value.plan_hash}`);
console.log(`APPROVAL_LITERAL=${approvalLiteral}`);
console.log(`APPROVAL_MAXIMUM=${approvalMaximum}`);
console.log(`APPROVAL_CURRENCY=${approvalCurrency}`);
console.log(`APPROVED_AT=${approvedAt}`);
console.log(`SUPABASE_STORAGE_RECOVERY_INSTALLED=${SupabaseStorageFetchRuntime.installation.installed ? "YES" : "NO"}`);
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("============================================================");

const report = await executeCreativeSourceSemanticRepair({
  plan: planFile.value,
  approval_literal: approvalLiteral,
  approval_maximum: approvalMaximum,
  approval_currency: approvalCurrency,
  approved_at: approvedAt,
  output_file: output,
});

console.log("============================================================");
console.log("SOURCE SEMANTIC REPAIR RESULT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`EXECUTION_HASH=${report.execution_hash}`);
console.log(`PLANNED_WORK_ITEM_COUNT=${report.counts.planned_work_items}`);
console.log(`RETRY_RESERVE_COUNT=${report.counts.retry_reserve_count}`);
console.log(`MAXIMUM_PAID_CALLS=${report.counts.maximum_paid_calls}`);
console.log(`SUCCESSFUL_USAGE_COUNT=${report.counts.paid_successful_usage_count}`);
console.log(`FAILED_USAGE_COUNT=${report.counts.failed_usage_count}`);
console.log(`VERIFIED_ASSET_COUNT=${report.counts.verified_asset_count}`);
console.log(`SELECTED_PROVIDER=${report.preflight.provider}`);
console.log(`SELECTED_MODEL=${report.preflight.model}`);
console.log(`SELECTED_PRICING_ID=${report.preflight.pricing_id}`);
console.log(`CUSTOMER_PRICE_PER_ANALYSIS=${report.preflight.customer_price_per_analysis}`);
console.log(`APPROVAL_CEILING=${report.cost.approval_ceiling}`);
console.log(`ACTUAL_CHARGED=${report.cost.charged}`);
console.log(`REMAINING_AUTHORIZED_AMOUNT=${report.cost.remaining_authorized_amount}`);
console.log(`WALLET_BALANCE_BEFORE=${report.cost.wallet_balance_before}`);
console.log(`WALLET_BALANCE_AFTER=${report.cost.wallet_balance_after}`);
console.log(`WALLET_DELTA=${report.cost.wallet_delta}`);
console.log(`CURRENCY=${report.cost.currency}`);
console.log(`SOURCE_SEMANTIC_REPAIR_READINESS=${report.readiness}`);
console.log(`PRODUCTION_AUTHORIZED=${report.production_authorized ? "YES" : "NO"}`);
console.log(`PUBLICATION_AUTHORIZED=${report.publication_authorized ? "YES" : "NO"}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const asset of report.asset_results || []) {
  console.log([
    "SEMANTIC_REPAIR_ASSET",
    asset.asset_id,
    `file=${text(asset.file_name).replaceAll("|", "/")}`,
    `media=${asset.media_kind}`,
    `status=${asset.semantic_status}`,
    `evidence=${asset.semantic_evidence_count}`,
    `verified=${asset.verified ? "YES" : "NO"}`,
  ].join("|"));
}

for (const item of report.item_results || []) {
  console.log([
    "SEMANTIC_REPAIR_RESULT",
    item.item_id,
    `asset=${item.asset_id}`,
    `status=${item.status}`,
    `attempt=${item.attempt || 0}`,
    `usage=${item.usage_id || "NONE"}`,
    `price=${item.customer_price || 0}`,
    `cumulative=${item.cumulative_charge ?? report.cost.charged}`,
  ].join("|"));
}

if (report.readiness !== "PASS") process.exitCode = 2;
