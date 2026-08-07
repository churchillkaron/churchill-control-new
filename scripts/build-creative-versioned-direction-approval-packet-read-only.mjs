#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT = "CREATIVE_VERSIONED_DIRECTION_APPROVAL_PACKET_V1";
const ENVELOPE_CONTRACT = "CREATIVE_VERSIONED_DIRECTION_APPROVAL_ENVELOPE_V1";
const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";

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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
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
    sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

function amount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Number(number.toFixed(6));
}

const envelopeFile = readJson(
  process.argv[2],
  "DIRECTION_APPROVAL_ENVELOPE",
);
const envelope = object(envelopeFile.value);

if (text(envelope.contract) !== ENVELOPE_CONTRACT) {
  throw new Error("DIRECTION_APPROVAL_PACKET_ENVELOPE_CONTRACT_INVALID");
}
if (
  text(envelope.decision) !==
  "DIRECTION_APPROVAL_ENVELOPE_READY_FOR_EXPLICIT_CANDIDATE_SELECTION"
) {
  throw new Error("DIRECTION_APPROVAL_PACKET_ENVELOPE_NOT_READY");
}
if (list(envelope.blockers).length) {
  throw new Error("DIRECTION_APPROVAL_PACKET_ENVELOPE_BLOCKED");
}

const requestedCandidateHash = text(
  process.env.CREATIVE_DIRECTION_CANDIDATE_HASH,
);
if (!requestedCandidateHash) {
  throw new Error("CREATIVE_DIRECTION_CANDIDATE_HASH_REQUIRED");
}

const candidates = list(envelope.pricing?.candidates);
const candidate = candidates.find(
  (item) => text(item.candidate_hash) === requestedCandidateHash,
);
if (!candidate) {
  throw new Error("CREATIVE_DIRECTION_CANDIDATE_NOT_FOUND");
}
if (list(candidate.blockers).length) {
  throw new Error("CREATIVE_DIRECTION_CANDIDATE_BLOCKED");
}

const maximumCustomerPrice = amount(candidate.maximum_customer_price);
const maximumPerCallCustomerPrice = amount(
  candidate.maximum_per_call_customer_price,
);
const maximumCalls = Number(candidate.maximum_calls);
const currency = text(candidate.currency).toUpperCase();
const provider = text(candidate.provider);
const model = text(candidate.model);
const pricingId = text(candidate.pricing_id);
const allowedOperations = list(envelope.exact_allowed_operations).map(text);

if (
  !maximumCustomerPrice ||
  !maximumPerCallCustomerPrice ||
  !Number.isInteger(maximumCalls) ||
  maximumCalls <= 0 ||
  !currency ||
  !provider ||
  !pricingId ||
  !allowedOperations.length
) {
  throw new Error("CREATIVE_DIRECTION_CANDIDATE_INCOMPLETE");
}

if (maximumCalls !== Number(envelope.maximum_calls)) {
  throw new Error("CREATIVE_DIRECTION_CANDIDATE_CALL_CEILING_MISMATCH");
}

const approvalCore = {
  contract: APPROVAL_CONTRACT,
  id: `creative-direction-${sha256({
    envelope_hash: envelope.envelope_hash,
    candidate_hash: candidate.candidate_hash,
    project_id: envelope.creative_project_id,
    command_identity: envelope.command_identity,
  }).slice(0, 24)}`,
  approved: false,
  status: "PROPOSED",
  provider,
  model: model || null,
  pricing_id: pricingId,
  currency,
  maximum_customer_price: maximumCustomerPrice,
  maximum_per_call_customer_price: maximumPerCallCustomerPrice,
  maximum_calls: maximumCalls,
  call_count: 0,
  spent_customer_price: 0,
  remaining_customer_price: maximumCustomerPrice,
  allowed_operations: allowedOperations,
  operations: [],
  command_identity: envelope.command_identity,
  reconciliation_plan_hash: envelope.reconciliation_plan_hash,
  research_identity: envelope.research_identity,
  direction_envelope_hash: envelope.envelope_hash,
  direction_candidate_hash: candidate.candidate_hash,
  direction_runtime_source_evidence: envelope.runtime_source_evidence,
  direction_workload: {
    duration_seconds: envelope.workflow?.duration_seconds ?? null,
    scene_count_range: envelope.workflow?.scene_count_range || null,
    minimum_calls: envelope.workload?.minimum?.call_count ?? null,
    preferred_calls: envelope.workload?.preferred?.call_count ?? null,
    maximum_calls: envelope.workload?.maximum?.call_count ?? null,
  },
  scope: {
    organization_id: envelope.organization_id,
    creative_project_id: envelope.creative_project_id,
    workflow_kind: envelope.workflow?.kind || "TEMPORAL",
    planning_only: true,
    identity_atlas_materialization_authorized: false,
    media_generation_authorized: false,
    task_dispatch_authorized: false,
    finalisation_authorized: false,
    publication_authorized: false,
  },
  approved_at: null,
  expires_at: null,
  completed_at: null,
  retry_required: false,
};

const approvalPacketHash = sha256(approvalCore);
const activationLiteral = [
  "APPROVE CREATIVE VERSIONED DIRECTION",
  `ENVELOPE ${envelope.envelope_hash}`,
  `CANDIDATE ${candidate.candidate_hash}`,
  `PACKET ${approvalPacketHash}`,
  `MAX ${maximumCustomerPrice} ${currency}`,
  `MAX CALLS ${maximumCalls}`,
].join("\n");

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  source_envelope_file_sha256: envelopeFile.sha256,
  envelope_hash: envelope.envelope_hash,
  candidate_hash: candidate.candidate_hash,
  approval_packet_hash: approvalPacketHash,
  approval: approvalCore,
  activation: {
    literal: activationLiteral,
    exact_literal_required: true,
    approved_at_must_be_set_during_activation: true,
    expires_at_must_be_set_during_activation: true,
    activation_must_revalidate_envelope_hash: true,
    activation_must_revalidate_candidate_hash: true,
    activation_must_revalidate_packet_hash: true,
    activation_must_revalidate_command_identity: true,
    activation_must_revalidate_research_identity: true,
    activation_must_revalidate_runtime_source_hashes: true,
    activation_must_revalidate_pricing: true,
  },
  side_effect_contract: {
    approval_created_in_database: false,
    project_metadata_modified: false,
    provider_selected_for_execution: false,
    provider_spend_approved: false,
    provider_calls_executed: false,
    identity_atlas_materialization_executed: false,
    database_writes_executed: false,
    storage_writes_executed: false,
    task_dispatch_executed: false,
    source_regeneration_executed: false,
    finalisation_executed: false,
    publication_executed: false,
  },
  decision: "DIRECTION_APPROVAL_PACKET_READY_FOR_EXPLICIT_ACTIVATION_AUTHORIZATION",
};

const outputPath = writeJson(
  process.env.CREATIVE_VERSIONED_DIRECTION_APPROVAL_PACKET_OUTPUT ||
    "/tmp/creative-versioned-direction-approval-packet.json",
  report,
);

console.log("============================================================");
console.log("READ-ONLY CREATIVE VERSIONED DIRECTION APPROVAL PACKET");
console.log("============================================================");
console.log(`CONTRACT=${report.contract}`);
console.log(`OUTPUT=${outputPath}`);
console.log(`ENVELOPE_HASH=${report.envelope_hash}`);
console.log(`CANDIDATE_HASH=${report.candidate_hash}`);
console.log(`APPROVAL_PACKET_HASH=${report.approval_packet_hash}`);
console.log(`APPROVAL_ID=${report.approval.id}`);
console.log(`APPROVAL_STATUS=${report.approval.status}`);
console.log(`APPROVED=${report.approval.approved ? "YES" : "NO"}`);
console.log(`PROVIDER=${report.approval.provider}`);
console.log(`MODEL=${report.approval.model || ""}`);
console.log(`PRICING_ID=${report.approval.pricing_id}`);
console.log(`CURRENCY=${report.approval.currency}`);
console.log(`MAXIMUM_CUSTOMER_PRICE=${report.approval.maximum_customer_price}`);
console.log(`MAXIMUM_PER_CALL_CUSTOMER_PRICE=${report.approval.maximum_per_call_customer_price}`);
console.log(`MAXIMUM_CALLS=${report.approval.maximum_calls}`);
console.log(`ALLOWED_OPERATIONS=${JSON.stringify(report.approval.allowed_operations)}`);
console.log("ACTIVATION_LITERAL_BEGIN");
console.log(report.activation.literal);
console.log("ACTIVATION_LITERAL_END");
console.log(`DECISION=${report.decision}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("STORAGE_WRITES_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("IDENTITY_ATLAS_MATERIALIZATION_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");
