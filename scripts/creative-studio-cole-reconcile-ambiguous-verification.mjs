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
const EXPECTED_UNIT_RESERVATION = 0.4368;
const EXPECTED_TOTAL_CONSUMED_CALLS = 16;
const EXPECTED_REMAINING_CALLS = 12;
const CURRENCY = "THB";
const DOWNLOADS = path.join(process.env.HOME || "", "Downloads");
const REPORT_PATH = path.join(
  DOWNLOADS,
  `COLE_LEY_AMBIGUOUS_VERIFICATION_RECONCILIATION_${new Date()
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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function closeEnough(left, right) {
  return Math.abs(finite(left) - finite(right)) <= 0.000001;
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

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `SUPABASE_REQUEST_FAILED:${response.status}:${raw || response.statusText}`,
    );
  }
  return raw ? JSON.parse(raw) : null;
}

async function readTable(table, parameters) {
  const query = new URLSearchParams(parameters);
  return request(`/rest/v1/${table}?${query}`);
}

async function patchTable(table, filters, values) {
  const query = new URLSearchParams(filters);
  return request(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(values),
  });
}

async function releaseReservation({ usage, amount }) {
  return request("/rest/v1/rpc/apply_wallet_transaction", {
    method: "POST",
    body: JSON.stringify({
      p_organization_id: ORGANIZATION_ID,
      p_operation: "RELEASE",
      p_amount: amount,
      p_currency: CURRENCY,
      p_provider: usage.provider || "openai",
      p_usage_id: null,
      p_invoice_id: null,
      p_reference: usage.id,
      p_idempotency_key: `RELEASE:${usage.id}`,
      p_metadata: {
        purpose: "Cole Ley ambiguous verification reconciliation",
        project_id: PROJECT_ID,
        project_shortlist_identity: SHORTLIST_IDENTITY,
        original_usage_status: usage.status,
        provider_result_confirmed: false,
        production_started: false,
      },
    }),
  });
}

function transactionsForUsage(transactions, usageId) {
  return transactions.filter((row) =>
    text(row.usage_id) === usageId ||
    text(row.reference) === usageId ||
    text(row.reference).startsWith(`${usageId}:`),
  );
}

function transactionTotal(rows, type) {
  return Number(rows
    .filter((row) => text(row.type).toUpperCase() === type)
    .reduce((sum, row) => sum + finite(row.amount), 0)
    .toFixed(6));
}

async function loadState() {
  const [walletRows, transactions, usages, nodes] = await Promise.all([
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
      order: "created_at.asc",
      limit: "300",
    }),
    readTable("creative_asset_nodes", {
      select:
        "id,creative_project_id,type,status,metadata,created_at,updated_at",
      organization_id: `eq.${ORGANIZATION_ID}`,
      creative_project_id: `eq.${PROJECT_ID}`,
      order: "created_at.asc",
      limit: "3000",
    }),
  ]);

  const excerpts = nodes.filter((node) =>
    node.type === "VIDEO" &&
    node.status !== "ARCHIVED" &&
    text(node.metadata?.project_shortlist_identity) === SHORTLIST_IDENTITY &&
    Boolean(node.metadata?.local_shortlist_candidate_id),
  );
  const excerptById = new Map(excerpts.map((node) => [node.id, node]));
  const candidates = nodes.filter((node) =>
    node.type === "MOMENT" &&
    node.status !== "ARCHIVED" &&
    node.metadata?.local_shortlist_candidate === true &&
    node.metadata?.selected_for_ai_verification === true &&
    text(node.metadata?.project_shortlist_identity) === SHORTLIST_IDENTITY,
  ).sort((left, right) =>
    finite(left.metadata?.shortlist_rank, 9999) -
    finite(right.metadata?.shortlist_rank, 9999),
  );
  const projectUsages = usages.filter((usage) =>
    excerptById.has(text(usage.metadata?.source_asset_node_id)),
  );

  return {
    wallet: walletRows[0] || null,
    transactions,
    candidates,
    excerpts,
    projectUsages,
  };
}

function usagesForCandidate(state, candidate) {
  const excerptIds = new Set(state.excerpts
    .filter((node) =>
      text(node.metadata?.local_shortlist_candidate_id) === candidate.id,
    )
    .map((node) => node.id));
  return state.projectUsages.filter((usage) =>
    excerptIds.has(text(usage.metadata?.source_asset_node_id)),
  );
}

async function failPendingUsage(usage, reason, reconciliation) {
  const updatedMetadata = {
    ...object(usage.metadata),
    reconciliation: {
      ...object(usage.metadata?.reconciliation),
      ...reconciliation,
      reconciled_at: new Date().toISOString(),
      production_started: false,
    },
  };
  const rows = await patchTable("platform_service_usage", {
    id: `eq.${usage.id}`,
    status: "eq.PENDING",
  }, {
    status: "FAILED",
    error_message: reason,
    metadata: updatedMetadata,
    updated_at: new Date().toISOString(),
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

let state = await loadState();
const changes = [];

for (const candidate of state.candidates) {
  const meta = object(candidate.metadata);
  const usages = usagesForCandidate(state, candidate);
  const pending = usages.filter((usage) => usage.status === "PENDING");
  if (!pending.length) continue;

  if (
    text(meta.ai_verification_status).toUpperCase() === "REJECTED" &&
    finite(meta.paid_analysis_calls) === 2
  ) {
    for (const usage of pending) {
      const related = transactionsForUsage(state.transactions, usage.id);
      const reserve = transactionTotal(related, "RESERVE");
      const release = transactionTotal(related, "RELEASE");
      const charge = transactionTotal(related, "CHARGE");
      if (reserve !== 0 || release !== 0 || charge !== 0) {
        throw new Error(
          `ORPHAN_PENDING_USAGE_HAS_WALLET_ACTIVITY:${usage.id}`,
        );
      }
      const failed = await failPendingUsage(
        usage,
        "INSUFFICIENT_WALLET_BALANCE_BEFORE_PROVIDER_EXECUTION_RECONCILED",
        {
          classification: "NO_PROVIDER_CALL_NO_RESERVATION",
          customer_charge: 0,
          counted_against_call_limit: false,
        },
      );
      changes.push({
        type: "ORPHAN_USAGE_FAILED",
        candidate_id: candidate.id,
        usage_id: usage.id,
        updated: Boolean(failed),
      });
    }
    continue;
  }

  if (text(meta.ai_verification_status).toUpperCase() === "RUNNING") {
    const success = usages.filter((usage) => usage.status === "SUCCESS");
    if (success.length !== 1 || pending.length !== 1) {
      throw new Error(
        `AMBIGUOUS_CANDIDATE_SHAPE_UNEXPECTED:${candidate.id}:${success.length}:${pending.length}`,
      );
    }

    const ambiguousUsage = pending[0];
    const related = transactionsForUsage(state.transactions, ambiguousUsage.id);
    const reserve = transactionTotal(related, "RESERVE");
    const release = transactionTotal(related, "RELEASE");
    const charge = transactionTotal(related, "CHARGE");

    if (!closeEnough(reserve, EXPECTED_UNIT_RESERVATION)) {
      throw new Error(
        `AMBIGUOUS_USAGE_RESERVE_MISMATCH:${ambiguousUsage.id}:${reserve}`,
      );
    }
    if (release > 0 || charge > 0) {
      throw new Error(
        `AMBIGUOUS_USAGE_ALREADY_SETTLED:${ambiguousUsage.id}:${release}:${charge}`,
      );
    }

    const releaseResult = await releaseReservation({
      usage: ambiguousUsage,
      amount: EXPECTED_UNIT_RESERVATION,
    });
    const failed = await failPendingUsage(
      ambiguousUsage,
      "PROVIDER_FETCH_FAILED_WITHOUT_CONFIRMED_RESULT_RECONCILED",
      {
        classification: "AMBIGUOUS_PROVIDER_EXECUTION",
        reservation_released: EXPECTED_UNIT_RESERVATION,
        customer_charge: 0,
        counted_against_call_limit: true,
        conservative_call_count: 1,
      },
    );

    const candidateMetadata = {
      ...meta,
      ai_verification_status: "REJECTED",
      paid_analysis_calls: 2,
      verified_moment_ids: [],
      ai_verification_completed_at: new Date().toISOString(),
      ai_verification_error:
        "PROVIDER_FETCH_FAILED_AFTER_ONE_CONFIRMED_SAMPLE",
      ai_verification_reconciliation: {
        version: "cole-ley-ambiguous-verification-v1",
        confirmed_success_usage_id: success[0].id,
        ambiguous_usage_id: ambiguousUsage.id,
        ambiguous_usage_counted_conservatively: true,
        conservative_total_candidate_calls: 2,
        reservation_released: EXPECTED_UNIT_RESERVATION,
        customer_charge_for_ambiguous_usage: 0,
        production_started: false,
        reconciled_at: new Date().toISOString(),
      },
    };
    const updatedCandidate = await patchTable("creative_asset_nodes", {
      id: `eq.${candidate.id}`,
    }, {
      metadata: candidateMetadata,
      updated_at: new Date().toISOString(),
    });

    changes.push({
      type: "AMBIGUOUS_CANDIDATE_RECONCILED",
      candidate_id: candidate.id,
      success_usage_id: success[0].id,
      ambiguous_usage_id: ambiguousUsage.id,
      release_transaction_id:
        releaseResult?.transaction?.id || releaseResult?.id || null,
      usage_updated: Boolean(failed),
      candidate_updated:
        Array.isArray(updatedCandidate) && updatedCandidate.length === 1,
    });
    continue;
  }

  throw new Error(
    `UNEXPECTED_PENDING_USAGE_CANDIDATE_STATUS:${candidate.id}:${meta.ai_verification_status}`,
  );
}

state = await loadState();
const remainingPending = state.projectUsages.filter((usage) =>
  usage.status === "PENDING",
);
const recordedCalls = state.candidates.reduce((sum, candidate) =>
  sum + finite(candidate.metadata?.paid_analysis_calls),
0);
const ambiguousCandidates = state.candidates.filter((candidate) =>
  ["RUNNING", "FAILED", "FAILED_RECONCILIATION_REQUIRED"].includes(
    text(candidate.metadata?.ai_verification_status).toUpperCase(),
  ),
);

if (remainingPending.length) {
  throw new Error(
    `PENDING_USAGE_REMAINS:${remainingPending.map((row) => row.id).join(",")}`,
  );
}
if (ambiguousCandidates.length) {
  throw new Error(
    `AMBIGUOUS_CANDIDATE_REMAINS:${ambiguousCandidates.map((row) => row.id).join(",")}`,
  );
}
if (recordedCalls !== EXPECTED_TOTAL_CONSUMED_CALLS) {
  throw new Error(
    `RECORDED_CALL_TOTAL_MISMATCH:${recordedCalls}:${EXPECTED_TOTAL_CONSUMED_CALLS}`,
  );
}
if (!closeEnough(state.wallet?.reserved_balance, 0)) {
  throw new Error(
    `WALLET_RESERVATION_REMAINS:${state.wallet?.reserved_balance}`,
  );
}

const report = {
  generated_at: new Date().toISOString(),
  mode: "CONTROLLED_AMBIGUOUS_VERIFICATION_RECONCILIATION",
  organization_id: ORGANIZATION_ID,
  creative_project_id: PROJECT_ID,
  project_shortlist_identity: SHORTLIST_IDENTITY,
  changes,
  wallet: state.wallet,
  pending_usage_count: remainingPending.length,
  ambiguous_candidate_count: ambiguousCandidates.length,
  consumed_call_count: recordedCalls,
  remaining_authorized_call_count: EXPECTED_REMAINING_CALLS,
  project_call_limit: 28,
  project_price_limit: 12.2304,
  currency: CURRENCY,
  production_started: false,
};
await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

console.log("============================================================");
console.log("COLE LEY AMBIGUOUS VERIFICATION RECONCILIATION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${ORGANIZATION_ID}`);
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`PROJECT_SHORTLIST_IDENTITY=${SHORTLIST_IDENTITY}`);
console.log(`CHANGES_APPLIED=${changes.length}`);
console.log(`PENDING_USAGE_COUNT=${remainingPending.length}`);
console.log(`AMBIGUOUS_CANDIDATE_COUNT=${ambiguousCandidates.length}`);
console.log(`WALLET_AVAILABLE_BALANCE=${finite(state.wallet?.available_balance).toFixed(6)}`);
console.log(`WALLET_RESERVED_BALANCE=${finite(state.wallet?.reserved_balance).toFixed(6)}`);
console.log(`CONSUMED_AI_CALLS=${recordedCalls}`);
console.log(`REMAINING_AUTHORIZED_AI_CALLS=${EXPECTED_REMAINING_CALLS}`);
console.log("PROJECT_TOTAL_CALL_LIMIT=28");
console.log("PROJECT_PRICE_LIMIT=12.2304 THB");
console.log("SAFE_TO_CONTINUE=YES");
console.log("PROVIDER_CALLS_TRIGGERED=NO");
console.log("NEW_CUSTOMER_CHARGES=NO");
console.log("STRANDED_RESERVATION_RELEASED=YES");
console.log("PRODUCTION_STARTED=NO");
console.log(`REPORT=${REPORT_PATH}`);
console.log("============================================================");
