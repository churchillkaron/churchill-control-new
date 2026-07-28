#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const ORGANIZATION_ID =
  process.env.COLE_PREFLIGHT_ORGANIZATION_ID ||
  "9550b843-b83c-4d15-b02d-a0b5ca23346e";
const PROJECT_ID = "3866623f-d9a6-45d3-99b8-e978666cc028";
const SHORTLIST_IDENTITY =
  "8c3d2deed60db0f8599ce049d787e83203d18694627fdb1b53351a32d7c49446";
const DOWNLOADS = path.join(process.env.HOME || "", "Downloads");
const REPORT_PATH =
  process.env.COLE_VERIFICATION_RECONCILIATION_REPORT ||
  path.join(
    DOWNLOADS,
    `COLE_LEY_VERIFICATION_RECONCILIATION_${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")}.json`,
  );

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metadata(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function money(value) {
  return finite(value).toFixed(6);
}

const baseUrl = text(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
).replace(/\/$/, "");
const serviceKey = text(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);

if (!baseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL_OR_SERVICE_ROLE_KEY_MISSING");
}

async function readTable(table, parameters) {
  const query = new URLSearchParams(parameters);
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `READ_FAILED:${table}:${response.status}:${raw || response.statusText}`,
    );
  }
  return raw ? JSON.parse(raw) : [];
}

function relatedTransactions(transactions, usageIds) {
  return transactions.filter((transaction) => {
    const usageId = text(transaction.usage_id);
    const reference = text(transaction.reference);
    return (
      usageIds.has(usageId) ||
      [...usageIds].some((id) =>
        reference === id || reference.startsWith(`${id}:`),
      )
    );
  });
}

function transactionTotals(transactions) {
  const totals = {};
  for (const transaction of transactions) {
    const type = text(transaction.type).toUpperCase() || "UNKNOWN";
    totals[type] = finite(totals[type]) + finite(transaction.amount);
  }
  return Object.fromEntries(
    Object.entries(totals).map(([type, amount]) => [
      type,
      Number(amount.toFixed(6)),
    ]),
  );
}

function usageSummary(row) {
  const meta = metadata(row.metadata);
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    capability: row.capability,
    category: row.category,
    currency: row.currency,
    supplier_cost: finite(row.supplier_cost),
    platform_markup: finite(row.platform_markup),
    customer_price: finite(row.customer_price),
    error_message: row.error_message || null,
    source_asset_node_id: meta.source_asset_node_id || null,
    section_index: meta.section_index ?? null,
    sample_time_seconds: meta.sample_time_seconds ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const [walletRows, transactions, usageRows, projectNodes] = await Promise.all([
  readTable("organization_wallets", {
    select: "*",
    organization_id: `eq.${ORGANIZATION_ID}`,
    limit: "1",
  }),
  readTable("wallet_transactions", {
    select: "*",
    organization_id: `eq.${ORGANIZATION_ID}`,
    order: "created_at.desc",
    limit: "300",
  }),
  readTable("platform_service_usage", {
    select: "*",
    organization_id: `eq.${ORGANIZATION_ID}`,
    capability: "eq.ai.image.analyze",
    order: "created_at.desc",
    limit: "300",
  }),
  readTable("creative_asset_nodes", {
    select:
      "id,parent_asset_node_id,creative_project_id,type,status,name,metadata,technical,created_at,updated_at",
    organization_id: `eq.${ORGANIZATION_ID}`,
    creative_project_id: `eq.${PROJECT_ID}`,
    order: "created_at.asc",
    limit: "3000",
  }),
]);

const wallet = walletRows[0] || null;
const candidates = projectNodes
  .filter((node) =>
    node.type === "MOMENT" &&
    node.status !== "ARCHIVED" &&
    node.metadata?.local_shortlist_candidate === true &&
    node.metadata?.selected_for_ai_verification === true &&
    text(node.metadata?.project_shortlist_identity) === SHORTLIST_IDENTITY,
  )
  .sort((left, right) =>
    finite(left.metadata?.shortlist_rank, 9999) -
    finite(right.metadata?.shortlist_rank, 9999),
  );

const excerpts = projectNodes.filter((node) =>
  node.type === "VIDEO" &&
  node.status !== "ARCHIVED" &&
  text(node.metadata?.project_shortlist_identity) === SHORTLIST_IDENTITY &&
  Boolean(node.metadata?.local_shortlist_candidate_id),
);
const excerptById = new Map(excerpts.map((node) => [node.id, node]));
const excerptByCandidate = new Map();
for (const excerpt of excerpts) {
  const candidateId = text(excerpt.metadata?.local_shortlist_candidate_id);
  if (!excerptByCandidate.has(candidateId)) excerptByCandidate.set(candidateId, []);
  excerptByCandidate.get(candidateId).push(excerpt);
}

const projectUsage = usageRows.filter((row) => {
  const sourceId = text(row.metadata?.source_asset_node_id);
  return excerptById.has(sourceId);
});
const usageIds = new Set(projectUsage.map((row) => text(row.id)).filter(Boolean));
const projectTransactions = relatedTransactions(transactions, usageIds);

const candidateReconciliation = candidates.map((candidate) => {
  const meta = metadata(candidate.metadata);
  const candidateExcerpts = excerptByCandidate.get(candidate.id) || [];
  const excerptIds = new Set(candidateExcerpts.map((node) => node.id));
  const usages = projectUsage
    .filter((row) => excerptIds.has(text(row.metadata?.source_asset_node_id)))
    .sort((left, right) =>
      Date.parse(left.created_at || 0) - Date.parse(right.created_at || 0),
    );
  const candidateUsageIds = new Set(usages.map((row) => text(row.id)));
  const walletTransactions = relatedTransactions(
    projectTransactions,
    candidateUsageIds,
  );
  const status = text(meta.ai_verification_status).toUpperCase() ||
    "PENDING_AUTHORIZATION";
  const ambiguous = [
    "RUNNING",
    "FAILED",
    "FAILED_RECONCILIATION_REQUIRED",
  ].includes(status);

  return {
    rank: finite(meta.shortlist_rank, null),
    candidate_id: candidate.id,
    source_asset_node_id: meta.source_asset_node_id || null,
    verification_status: status,
    paid_analysis_calls_recorded: finite(meta.paid_analysis_calls),
    usage_rows_observed: usages.length,
    success_usage_count: usages.filter((row) => row.status === "SUCCESS").length,
    failed_usage_count: usages.filter((row) => row.status === "FAILED").length,
    pending_usage_count: usages.filter((row) => row.status === "PENDING").length,
    usage_customer_price: Number(usages.reduce(
      (sum, row) => sum + finite(row.customer_price),
      0,
    ).toFixed(6)),
    wallet_transaction_totals: transactionTotals(walletTransactions),
    verification_excerpt_node_id:
      meta.verification_excerpt_node_id || candidateExcerpts.at(-1)?.id || null,
    verified_moment_ids: Array.isArray(meta.verified_moment_ids)
      ? meta.verified_moment_ids
      : [],
    error: meta.ai_verification_error || null,
    error_validation: meta.ai_verification_validation || null,
    ambiguous,
    updated_at: candidate.updated_at,
    usages: usages.map(usageSummary),
    wallet_transactions: walletTransactions.map((row) => ({
      id: row.id,
      type: row.type,
      amount: finite(row.amount),
      currency: row.currency,
      provider: row.provider,
      usage_id: row.usage_id,
      reference: row.reference,
      idempotency_key: row.idempotency_key,
      created_at: row.created_at,
    })),
  };
});

const ambiguousCandidates = candidateReconciliation.filter((row) => row.ambiguous);
const totalObservedCalls = projectUsage.length;
const totalRecordedCalls = candidateReconciliation.reduce(
  (sum, row) => sum + row.paid_analysis_calls_recorded,
  0,
);
const projectTransactionTotals = transactionTotals(projectTransactions);
const report = {
  generated_at: new Date().toISOString(),
  mode: "READ_ONLY_VERIFICATION_RECONCILIATION",
  organization_id: ORGANIZATION_ID,
  creative_project_id: PROJECT_ID,
  project_shortlist_identity: SHORTLIST_IDENTITY,
  wallet,
  selected_candidate_count: candidates.length,
  excerpt_count: excerpts.length,
  observed_usage_count: totalObservedCalls,
  recorded_candidate_call_count: totalRecordedCalls,
  usage_status_totals: {
    SUCCESS: projectUsage.filter((row) => row.status === "SUCCESS").length,
    FAILED: projectUsage.filter((row) => row.status === "FAILED").length,
    PENDING: projectUsage.filter((row) => row.status === "PENDING").length,
  },
  wallet_transaction_totals: projectTransactionTotals,
  ambiguous_candidate_count: ambiguousCandidates.length,
  safe_to_retry: ambiguousCandidates.length === 0,
  candidates: candidateReconciliation,
  project_usage: projectUsage.map(usageSummary),
  project_wallet_transactions: projectTransactions,
  writes_performed: false,
  provider_calls_triggered: false,
  wallet_transactions_triggered: false,
  production_started: false,
};

await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

console.log("============================================================");
console.log("COLE LEY VERIFICATION RECONCILIATION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${ORGANIZATION_ID}`);
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`PROJECT_SHORTLIST_IDENTITY=${SHORTLIST_IDENTITY}`);
console.log(`WALLET_AVAILABLE_BALANCE=${money(wallet?.available_balance)}`);
console.log(`WALLET_RESERVED_BALANCE=${money(wallet?.reserved_balance)}`);
console.log(`WALLET_CURRENCY=${wallet?.currency || "UNKNOWN"}`);
console.log(`SELECTED_CANDIDATE_COUNT=${candidates.length}`);
console.log(`VERIFICATION_EXCERPT_COUNT=${excerpts.length}`);
console.log(`OBSERVED_AI_USAGE_ROWS=${totalObservedCalls}`);
console.log(`RECORDED_CANDIDATE_CALLS=${totalRecordedCalls}`);
console.log(`SUCCESS_USAGE_COUNT=${report.usage_status_totals.SUCCESS}`);
console.log(`FAILED_USAGE_COUNT=${report.usage_status_totals.FAILED}`);
console.log(`PENDING_USAGE_COUNT=${report.usage_status_totals.PENDING}`);
console.log(`WALLET_RESERVE_TOTAL=${money(projectTransactionTotals.RESERVE)}`);
console.log(`WALLET_RELEASE_TOTAL=${money(projectTransactionTotals.RELEASE)}`);
console.log(`WALLET_CHARGE_TOTAL=${money(projectTransactionTotals.CHARGE)}`);
console.log(`AMBIGUOUS_CANDIDATE_COUNT=${ambiguousCandidates.length}`);
console.log(`SAFE_TO_RETRY=${ambiguousCandidates.length ? "NO" : "YES"}`);
console.log("");
console.log("================ CANDIDATES ================");
for (const candidate of candidateReconciliation) {
  console.log([
    `RANK=${candidate.rank}`,
    `CANDIDATE=${candidate.candidate_id}`,
    `STATUS=${candidate.verification_status}`,
    `RECORDED_CALLS=${candidate.paid_analysis_calls_recorded}`,
    `OBSERVED_USAGE_ROWS=${candidate.usage_rows_observed}`,
    `SUCCESS=${candidate.success_usage_count}`,
    `FAILED=${candidate.failed_usage_count}`,
    `PENDING=${candidate.pending_usage_count}`,
    `RESERVE=${money(candidate.wallet_transaction_totals.RESERVE)}`,
    `RELEASE=${money(candidate.wallet_transaction_totals.RELEASE)}`,
    `CHARGE=${money(candidate.wallet_transaction_totals.CHARGE)}`,
    `ERROR=${candidate.error || "NONE"}`,
  ].join(" "));
}
console.log("");
console.log(`REPORT=${REPORT_PATH}`);
console.log("READ_ONLY=YES");
console.log("PROVIDER_CALLS_TRIGGERED=NO");
console.log("WALLET_TRANSACTIONS_TRIGGERED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");
