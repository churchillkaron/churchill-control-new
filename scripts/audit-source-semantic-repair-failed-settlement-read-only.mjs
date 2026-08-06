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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

const plan = readJson(process.argv[2], "REPAIR_PLAN");
const organizationId = text(process.env.ORGANIZATION_ID || plan.organization_id);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!plan.plan_hash) throw new Error("REPAIR_PLAN_HASH_REQUIRED");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { WalletRuntime } = await import(
  "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime"
);

const { data: usages, error: usageError } = await supabaseAdmin
  .from("platform_service_usage")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("metadata->>source_semantic_repair_plan_hash", plan.plan_hash)
  .order("created_at", { ascending: true });
if (usageError) throw usageError;

const usageRows = usages || [];
const usageIds = usageRows.map((usage) => usage.id);
let transactions = [];
if (usageIds.length) {
  const { data, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .in("reference", usageIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  transactions = data || [];
}

const failed = usageRows.filter((usage) => usage.status === "FAILED");
const successful = usageRows.filter((usage) => usage.status === "SUCCESS");
const pending = usageRows.filter((usage) => usage.status === "PENDING");
const blockers = [];
const settlements = usageRows.map((usage) => {
  const related = transactions.filter((tx) =>
    text(tx.reference) === text(usage.id) ||
    text(tx.usage_id) === text(usage.id),
  );
  const reserves = related.filter((tx) => text(tx.type).toUpperCase() === "RESERVE");
  const releases = related.filter((tx) => text(tx.type).toUpperCase() === "RELEASE");
  const charges = related.filter((tx) => text(tx.type).toUpperCase() === "CHARGE");
  const reserved = money(reserves.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const released = money(releases.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const charged = money(charges.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));

  if (usage.status === "FAILED") {
    if (reserves.length !== 1) blockers.push(`FAILED_USAGE_RESERVE_INVALID:${usage.id}:${reserves.length}`);
    if (releases.length !== 1) blockers.push(`FAILED_USAGE_RELEASE_INVALID:${usage.id}:${releases.length}`);
    if (charges.length !== 0) blockers.push(`FAILED_USAGE_CHARGED:${usage.id}:${charges.length}`);
    if (reserved !== released) blockers.push(`FAILED_USAGE_RELEASE_AMOUNT_MISMATCH:${usage.id}:${reserved}:${released}`);
  }
  if (usage.status === "PENDING") blockers.push(`OPEN_USAGE_REMAINS:${usage.id}`);

  return {
    usage_id: usage.id,
    status: usage.status,
    item_id: usage.metadata?.source_semantic_repair_item_id || null,
    error_message: usage.error_message || null,
    reserve_count: reserves.length,
    release_count: releases.length,
    charge_count: charges.length,
    reserved,
    released,
    charged,
  };
});

const chargedTotal = money(
  successful.reduce((sum, usage) => sum + Number(usage.customer_price || 0), 0),
);
const approvalCeiling = money(plan.pricing?.approval_ceiling);
const remainingAuthorized = money(approvalCeiling - chargedTotal);
const walletBalance = await WalletRuntime.balance({
  organization_id: organizationId,
  currency: plan.pricing?.currency,
});

if (failed.length < 1) blockers.push("EXPECTED_FAILED_USAGE_NOT_FOUND");
if (chargedTotal > approvalCeiling) blockers.push(`APPROVAL_CEILING_EXCEEDED:${chargedTotal}:${approvalCeiling}`);
if (walletBalance < remainingAuthorized) blockers.push(`WALLET_INSUFFICIENT:${walletBalance}:${remainingAuthorized}`);

const report = {
  contract: "CREATIVE_SOURCE_SEMANTIC_REPAIR_FAILED_SETTLEMENT_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  plan_hash: plan.plan_hash,
  counts: {
    usage_count: usageRows.length,
    failed_usage_count: failed.length,
    successful_usage_count: successful.length,
    pending_usage_count: pending.length,
  },
  cost: {
    approval_ceiling: approvalCeiling,
    charged_total: chargedTotal,
    remaining_authorized: remainingAuthorized,
    wallet_balance: walletBalance,
    currency: plan.pricing?.currency || "THB",
  },
  settlements,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
  provider_calls_executed: false,
  database_writes_executed: false,
  wallet_changed: false,
  production_authorized: false,
  publication_authorized: false,
};

const output = path.resolve(
  text(process.env.SOURCE_SEMANTIC_REPAIR_SETTLEMENT_AUDIT_OUTPUT) ||
    "/tmp/churchill-source-semantic-repair-settlement-audit.json",
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SOURCE SEMANTIC REPAIR SETTLEMENT AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`USAGE_COUNT=${report.counts.usage_count}`);
console.log(`FAILED_USAGE_COUNT=${report.counts.failed_usage_count}`);
console.log(`SUCCESSFUL_USAGE_COUNT=${report.counts.successful_usage_count}`);
console.log(`PENDING_USAGE_COUNT=${report.counts.pending_usage_count}`);
console.log(`CHARGED_TOTAL=${report.cost.charged_total}`);
console.log(`REMAINING_AUTHORIZED=${report.cost.remaining_authorized}`);
console.log(`WALLET_BALANCE=${report.cost.wallet_balance}`);
console.log(`SETTLEMENT_AUDIT_READINESS=${report.readiness}`);
console.log(`SETTLEMENT_AUDIT_BLOCKER_COUNT=${blockers.length}`);
console.log(`SETTLEMENT_AUDIT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const settlement of settlements) {
  console.log([
    "USAGE_SETTLEMENT",
    settlement.usage_id,
    `status=${settlement.status}`,
    `item=${settlement.item_id || "NONE"}`,
    `reserve=${settlement.reserved}`,
    `release=${settlement.released}`,
    `charge=${settlement.charged}`,
    `reserve_count=${settlement.reserve_count}`,
    `release_count=${settlement.release_count}`,
    `charge_count=${settlement.charge_count}`,
    `error=${text(settlement.error_message).replaceAll("|", "/") || "NONE"}`,
  ].join("|"));
}

if (blockers.length) process.exitCode = 2;
