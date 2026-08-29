#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V3";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const PRICING_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_V1";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V3_APPROVED";
const REVIEWER_ENV = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER";

const text = (value) => String(value ?? "").trim();

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

function normalizedReviewer(value) {
  return text(value).replace(/\s+/g, " ");
}

function reviewerIdentityValid(value) {
  const reviewer = normalizedReviewer(value);
  const lower = reviewer.toLowerCase();
  if (reviewer.length < 2 || reviewer.length > 120) return false;
  if (!/[\p{L}]/u.test(reviewer)) return false;

  const forbiddenExact = new Set([
    "your actual reviewer name",
    "actual reviewer name",
    "your reviewer name",
    "real reviewer name here",
    "real reviewer name",
    "reviewer name here",
    "reviewer name",
    "reviewer",
    "placeholder",
    "unknown",
    "tbd",
    "todo",
    "n/a",
    "na",
    "none",
    "test",
    "example",
    "human",
    "operator",
    "person",
  ]);
  if (forbiddenExact.has(lower)) return false;

  const forbiddenFragments = [
    "your actual reviewer",
    "actual reviewer name",
    "real reviewer name",
    "reviewer name here",
    "replace with",
    "placeholder",
    "enter name",
    "full name here",
  ];
  if (forbiddenFragments.some((fragment) => lower.includes(fragment))) return false;

  const words = reviewer.split(/\s+/).filter(Boolean);
  const genericTokens = new Set([
    "real", "actual", "reviewer", "name", "here", "person", "human", "operator",
  ]);
  const normalizedWords = words.map((word) => word.toLowerCase().replace(/[^\p{L}]/gu, "")).filter(Boolean);
  if (normalizedWords.length && normalizedWords.every((word) => genericTokens.has(word))) return false;

  return true;
}

function providerForCertification() {
  return {
    id: PROVIDER,
    metadata: {
      configured_foundation_model: MODEL,
      foundation_models: [MODEL],
    },
  };
}

function requireCertified(row, phase) {
  const certification = ownedExecutionCertification({
    provider: providerForCertification(),
    capability: CAPABILITY,
    pricing: row,
  });
  if (certification?.eligible !== true) {
    throw new Error(`${CONTRACT}_${phase}_OWNED_EXECUTION_CERTIFICATION_FAILED:${certification?.reason || "UNKNOWN"}`);
  }
  return certification;
}

approved(APPROVAL_ENV);
const reviewer = normalizedReviewer(required(REVIEWER_ENV));
if (!reviewerIdentityValid(reviewer)) {
  throw new Error(`${CONTRACT}_REVIEWER_IDENTITY_INVALID_OR_PLACEHOLDER`);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
let projectRef = "";
try {
  projectRef = new URL(supabaseUrl).hostname.split(".")[0];
} catch {
  throw new Error(`${CONTRACT}_SUPABASE_URL_INVALID`);
}
if (projectRef !== PRODUCTION_PROJECT_REF) {
  throw new Error(`${CONTRACT}_PRODUCTION_PROJECT_REF_MISMATCH:${projectRef || "UNKNOWN"}`);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function elasticServices() {
  const { data, error } = await supabase
    .from("organization_services")
    .select("id,organization_id,service_id,status")
    .eq("service_id", CAPABILITY);
  if (error) throw new Error(`${CONTRACT}_ORGANIZATION_SERVICE_READ_FAILED:${error.message}`);
  return data || [];
}

async function exactPricingRows() {
  const { data, error } = await supabase
    .from("provider_pricing")
    .select("*")
    .eq("provider", PROVIDER)
    .eq("capability", CAPABILITY)
    .eq("model", MODEL)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`${CONTRACT}_PRICING_READ_FAILED:${error.message}`);
  return data || [];
}

const servicesBefore = await elasticServices();
if (servicesBefore.length !== 0) {
  throw new Error(`${CONTRACT}_ELASTIC_ORGANIZATION_SERVICE_MUST_REMAIN_UNENABLED:count=${servicesBefore.length}`);
}

const rows = await exactPricingRows();
if (rows.length !== 1) throw new Error(`${CONTRACT}_EXACT_PRICING_ROW_REQUIRED:count=${rows.length}`);
const before = rows[0];
if (before.active !== true) throw new Error(`${CONTRACT}_PRICING_ROW_NOT_ACTIVE`);
const beforeMetadata = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
if (text(beforeMetadata.pricing_contract) !== PRICING_CONTRACT) throw new Error(`${CONTRACT}_PRICING_CONTRACT_MISMATCH`);
if (beforeMetadata.human_quality_certified !== true) throw new Error(`${CONTRACT}_HUMAN_QUALITY_NOT_CERTIFIED`);
if (!Number.isFinite(Date.parse(text(beforeMetadata.human_quality_reviewed_at)))) {
  throw new Error(`${CONTRACT}_HUMAN_QUALITY_REVIEWED_AT_INVALID`);
}

const beforeReviewer = normalizedReviewer(beforeMetadata.human_quality_reviewer);
if (reviewerIdentityValid(beforeReviewer)) {
  if (beforeReviewer !== reviewer) {
    throw new Error(`${CONTRACT}_VALID_REVIEWER_ALREADY_BOUND_DIFFERENT:${beforeReviewer}`);
  }
  const certification = requireCertified(before, "IDEMPOTENT");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    idempotent: true,
    pricing_row_id: before.id,
    reviewer,
    reviewer_identity_valid: true,
    pricing_active: true,
    owned_execution_certification: certification,
    organization_service_count: 0,
    database_mutation_performed: false,
    organization_service_mutation_performed: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    production_deploy_performed: false,
    next_action: "PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT",
  }, null, 2));
  console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V3=PASS");
  console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_VALID=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_ACTIVE=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT");
  process.exit(0);
}

const stagedAt = new Date().toISOString();
const { data: staged, error: stageError } = await supabase
  .from("provider_pricing")
  .update({
    active: false,
    metadata: {
      ...beforeMetadata,
      production_routing_allowed: false,
      human_quality_reviewer_repair_v3_staged_at: stagedAt,
    },
    updated_at: stagedAt,
  })
  .eq("id", before.id)
  .eq("active", true)
  .select("*")
  .single();
if (stageError) throw new Error(`${CONTRACT}_INACTIVE_STAGE_FAILED:${stageError.message}`);
if (!staged?.id || staged.active !== false) throw new Error(`${CONTRACT}_INACTIVE_STAGE_READBACK_INVALID`);

const repairedAt = new Date().toISOString();
const repairedMetadata = {
  ...beforeMetadata,
  human_quality_reviewer: reviewer,
  human_quality_reviewer_identity_source: "EXPLICIT_OPERATOR_INPUT",
  human_quality_reviewer_repair_contract: CONTRACT,
  human_quality_reviewer_repaired_at: repairedAt,
  human_quality_reviewer_previous_value_rejected: beforeReviewer || null,
  production_routing_allowed: true,
};

requireCertified({ ...staged, metadata: repairedMetadata }, "REPAIRED_INACTIVE_CANDIDATE");

const { data: repairedInactive, error: repairError } = await supabase
  .from("provider_pricing")
  .update({ metadata: repairedMetadata, updated_at: repairedAt })
  .eq("id", before.id)
  .eq("active", false)
  .select("*")
  .single();
if (repairError) throw new Error(`${CONTRACT}_REPAIR_UPDATE_FAILED:${repairError.message}`);
if (normalizedReviewer(repairedInactive?.metadata?.human_quality_reviewer) !== reviewer) {
  throw new Error(`${CONTRACT}_REVIEWER_READBACK_MISMATCH`);
}
if (!reviewerIdentityValid(repairedInactive?.metadata?.human_quality_reviewer)) {
  throw new Error(`${CONTRACT}_REVIEWER_READBACK_INVALID`);
}
requireCertified(repairedInactive, "REPAIRED_INACTIVE_READBACK");

const servicesMid = await elasticServices();
if (servicesMid.length !== 0) {
  throw new Error(`${CONTRACT}_ORGANIZATION_SERVICE_APPEARED_DURING_REPAIR:count=${servicesMid.length}`);
}

const { data: activated, error: activateError } = await supabase
  .from("provider_pricing")
  .update({ active: true, metadata: repairedMetadata, updated_at: new Date().toISOString() })
  .eq("id", before.id)
  .eq("active", false)
  .select("*")
  .single();
if (activateError) throw new Error(`${CONTRACT}_REACTIVATION_FAILED:${activateError.message}`);
if (activated?.active !== true) throw new Error(`${CONTRACT}_REACTIVATION_READBACK_INVALID`);
if (normalizedReviewer(activated?.metadata?.human_quality_reviewer) !== reviewer) {
  throw new Error(`${CONTRACT}_REVIEWER_ACTIVE_READBACK_MISMATCH`);
}
const certification = requireCertified(activated, "ACTIVE_READBACK");

const afterRows = await exactPricingRows();
if (afterRows.length !== 1 || text(afterRows[0]?.id) !== text(before.id) || afterRows[0]?.active !== true) {
  throw new Error(`${CONTRACT}_POST_REPAIR_PRICING_INVARIANT_FAILED`);
}
const servicesAfter = await elasticServices();
if (servicesAfter.length !== 0) {
  throw new Error(`${CONTRACT}_POST_REPAIR_ORGANIZATION_SERVICE_INVARIANT_FAILED`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  idempotent: false,
  pricing_row_id: activated.id,
  previous_reviewer_value: beforeReviewer || null,
  reviewer,
  reviewer_identity_valid: true,
  staged_inactive_before_repair: true,
  repaired_at: repairedAt,
  pricing_active: true,
  owned_execution_certification: certification,
  organization_service_count: 0,
  database_mutation_performed: true,
  organization_service_mutation_performed: false,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  next_action: "PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT",
}, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V3=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_VALID=true");
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_ACTIVE=true");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT");
