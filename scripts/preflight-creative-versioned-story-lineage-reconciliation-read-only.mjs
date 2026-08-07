#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const CONTRACT = "CREATIVE_VERSIONED_STORY_LINEAGE_RECONCILIATION_PREFLIGHT_V1";
const RECONCILIATION_CONTRACT =
  "CREATIVE_STORY_LINEAGE_HISTORICAL_RECONCILIATION_PLAN_V1";
const DIRECTION_APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function newest(rows = []) {
  return [...list(rows)].sort((left, right) => {
    const a = Date.parse(left.updated_at || left.created_at || 0) || 0;
    const b = Date.parse(right.updated_at || right.created_at || 0) || 0;
    return b - a;
  })[0] || null;
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

function approvalPreview(project = {}) {
  const approval = object(project.metadata?.paid_direction_approval);
  const contract = text(approval.contract);
  const status = text(approval.status).toUpperCase();
  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const now = Date.now();
  const maximum = Number(approval.maximum_customer_price);
  const spent = Number(approval.spent_customer_price || 0);
  const remaining = Number.isFinite(maximum)
    ? Number(Math.max(0, maximum - (Number.isFinite(spent) ? spent : 0)).toFixed(6))
    : null;
  const active =
    contract === DIRECTION_APPROVAL_CONTRACT &&
    approval.approved === true &&
    ["APPROVED", "IN_PROGRESS"].includes(status) &&
    Number.isFinite(approvedAt) &&
    approvedAt <= now &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    remaining !== null &&
    remaining > 0;

  return {
    contract: contract || null,
    present: Object.keys(approval).length > 0,
    active,
    status: status || null,
    approval_id: approval.id || null,
    provider: approval.provider || null,
    model: approval.model || null,
    pricing_id: approval.pricing_id || null,
    currency: approval.currency || null,
    maximum_customer_price:
      Number.isFinite(maximum) ? maximum : null,
    remaining_customer_price: remaining,
    maximum_per_call_customer_price:
      Number.isFinite(Number(approval.maximum_per_call_customer_price))
        ? Number(approval.maximum_per_call_customer_price)
        : null,
    maximum_calls:
      Number.isFinite(Number(approval.maximum_calls))
        ? Number(approval.maximum_calls)
        : null,
    call_count:
      Number.isFinite(Number(approval.call_count))
        ? Number(approval.call_count)
        : 0,
    allowed_operations: list(approval.allowed_operations),
    approved_at: approval.approved_at || null,
    expires_at: approval.expires_at || null,
    command_identity: approval.command_identity || null,
  };
}

const reconciliationFile = readJson(
  process.argv[2],
  "HISTORICAL_RECONCILIATION_PLAN",
);
const reconciliation = object(reconciliationFile.value);

if (text(reconciliation.contract) !== RECONCILIATION_CONTRACT) {
  throw new Error("HISTORICAL_RECONCILIATION_PLAN_CONTRACT_INVALID");
}
if (text(reconciliation.decision) !== "HISTORICAL_RECONCILIATION_PLAN_READY") {
  throw new Error("HISTORICAL_RECONCILIATION_PLAN_NOT_READY");
}
if (Number(reconciliation.counts?.blockers_requiring_separate_runtime_review || 0) !== 0) {
  throw new Error("HISTORICAL_RECONCILIATION_RUNTIME_BLOCKERS_REMAIN");
}

const organizationId = text(reconciliation.organization_id);
const projectId = text(reconciliation.creative_project_id);
const expectedPlanHash = text(process.env.RECONCILIATION_PLAN_HASH);
if (!organizationId || !projectId) {
  throw new Error("VERSIONED_RECONCILIATION_SCOPE_REQUIRED");
}
if (!expectedPlanHash || expectedPlanHash !== text(reconciliation.plan_hash)) {
  throw new Error("VERSIONED_RECONCILIATION_PLAN_HASH_MISMATCH");
}

const [
  { CreativeProjectRuntime },
  { ResearchRuntime },
  { inspectCreativeStoryResearchAuthority },
] = await Promise.all([
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/research/runtime/ResearchRuntime"),
  import("@/lib/creative/director/runtime/CreativeStoryLineageContractRuntime"),
]);

const project = await CreativeProjectRuntime.get(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("VERSIONED_RECONCILIATION_PROJECT_NOT_FOUND");
}

const researchRows = await ResearchRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const validatedResearch = researchRows.filter((row) =>
  row.metadata?.validation?.passed === true &&
  text(row.metadata?.research_identity),
);
const research = newest(validatedResearch);
if (!research) {
  throw new Error("VERSIONED_RECONCILIATION_VALIDATED_RESEARCH_REQUIRED");
}

const authority = inspectCreativeStoryResearchAuthority(research);
const evidence = object(authority.evidence);
const evidenceCount = list(evidence.evidence_ids).length;
const claimCount = list(evidence.claim_ids).length;
const sourceCount = list(evidence.source_ids).length;
const blockers = [];

if (!text(authority.research_identity)) blockers.push("RESEARCH_IDENTITY_MISSING");
if (!text(authority.industry)) blockers.push("INDUSTRY_CONTEXT_MISSING");
if (!text(authority.business_context_hash)) blockers.push("BUSINESS_CONTEXT_HASH_MISSING");
if (!text(authority.industry_context_hash)) blockers.push("INDUSTRY_CONTEXT_HASH_MISSING");
if (evidenceCount === 0) blockers.push("VERIFIED_RESEARCH_EVIDENCE_MISSING");
if (claimCount === 0 && sourceCount === 0) blockers.push("RESEARCH_CLAIMS_AND_SOURCES_MISSING");

const approval = approvalPreview(project);
const outputPath = writeJson(
  process.env.CREATIVE_VERSIONED_RECONCILIATION_PREFLIGHT_OUTPUT ||
    "/tmp/creative-versioned-story-lineage-reconciliation-preflight.json",
  {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    creative_project_id: projectId,
    historical_production_graph_id:
      reconciliation.historical_production_graph_id || null,
    reconciliation_plan_hash: reconciliation.plan_hash,
    reconciliation_decision: reconciliation.decision,
    historical_graph_authoritative_for_dispatch:
      reconciliation.graph_reconciliation?.historical_graph_authoritative_for_dispatch === true,
    current_research_authority: {
      research_report_id: authority.research_report_id,
      research_identity: authority.research_identity,
      industry: authority.industry,
      business_context_hash: authority.business_context_hash,
      industry_context_hash: authority.industry_context_hash,
      verified_claim_count: claimCount,
      source_count: sourceCount,
      evidence_count: evidenceCount,
    },
    current_direction_budget_approval: approval,
    authority_blockers: blockers,
    authority_ready: blockers.length === 0,
    direction_execution_authorized_by_this_preflight: false,
    database_reconciliation_authorized_by_this_preflight: false,
    provider_selection_executed: false,
    provider_spend_approved_by_this_preflight: false,
    provider_calls_executed: false,
    provider_polls_executed: false,
    task_dispatch_executed: false,
    source_regeneration_executed: false,
    historical_rows_modified: false,
    database_writes_executed: false,
    finalisation_executed: false,
    publication_executed: false,
    next_gate: blockers.length
      ? "RESEARCH_AUTHORITY_REPAIR_REQUIRED"
      : approval.active
        ? "EXPLICIT_DIRECTION_EXECUTION_AUTHORIZATION_STILL_REQUIRED"
        : "DIRECTION_BUDGET_APPROVAL_REQUIRED_BEFORE_NEW_CANONICAL_PLAN",
    decision: blockers.length
      ? "VERSIONED_RECONCILIATION_AUTHORITY_NOT_READY"
      : "VERSIONED_RECONCILIATION_AUTHORITY_READY",
  },
);

const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
console.log("============================================================");
console.log("READ-ONLY VERSIONED CREATIVE STORY LINEAGE PREFLIGHT");
console.log("============================================================");
console.log(`CONTRACT=${report.contract}`);
console.log(`OUTPUT=${outputPath}`);
console.log(`RECONCILIATION_PLAN_HASH=${report.reconciliation_plan_hash}`);
console.log(`RESEARCH_REPORT_ID=${report.current_research_authority.research_report_id || ""}`);
console.log(`RESEARCH_IDENTITY=${report.current_research_authority.research_identity || ""}`);
console.log(`INDUSTRY=${report.current_research_authority.industry || ""}`);
console.log(`BUSINESS_CONTEXT_HASH=${report.current_research_authority.business_context_hash || ""}`);
console.log(`INDUSTRY_CONTEXT_HASH=${report.current_research_authority.industry_context_hash || ""}`);
console.log(`VERIFIED_CLAIM_COUNT=${report.current_research_authority.verified_claim_count}`);
console.log(`RESEARCH_SOURCE_COUNT=${report.current_research_authority.source_count}`);
console.log(`RESEARCH_EVIDENCE_COUNT=${report.current_research_authority.evidence_count}`);
console.log(`AUTHORITY_BLOCKERS=${JSON.stringify(report.authority_blockers)}`);
console.log(`AUTHORITY_READY=${report.authority_ready ? "YES" : "NO"}`);
console.log(`DIRECTION_BUDGET_APPROVAL_PRESENT=${report.current_direction_budget_approval.present ? "YES" : "NO"}`);
console.log(`DIRECTION_BUDGET_APPROVAL_ACTIVE=${report.current_direction_budget_approval.active ? "YES" : "NO"}`);
console.log(`DIRECTION_APPROVAL_PROVIDER=${report.current_direction_budget_approval.provider || ""}`);
console.log(`DIRECTION_APPROVAL_CURRENCY=${report.current_direction_budget_approval.currency || ""}`);
console.log(`DIRECTION_APPROVAL_REMAINING=${report.current_direction_budget_approval.remaining_customer_price ?? ""}`);
console.log(`NEXT_GATE=${report.next_gate}`);
console.log(`DECISION=${report.decision}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("HISTORICAL_ROWS_MODIFIED=NO");
console.log("PROVIDER_SELECTION_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED_BY_PREFLIGHT=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
