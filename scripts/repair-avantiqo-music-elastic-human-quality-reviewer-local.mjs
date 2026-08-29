#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V1";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const PRICING_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_V1";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_APPROVED";
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
  if (reviewer.length < 3 || reviewer.length > 120) return false;
  if (!/[a-z\p{L}]/iu.test(reviewer)) return false;
  const exactPlaceholders = new Set([
    "your actual reviewer name",
    "actual reviewer name",
    "your reviewer name",
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
  ]);
  if (exactPlaceholders.has(lower)) return false;
  if (lower.includes("your actual reviewer")) return false;
  if (lower.includes("replace with")) return false;
  if (lower.includes("placeholder")) return false;
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

function certify(row) {
  return ownedExecutionCertification({
    provider: providerForCertification(),
    capability: CAPABILITY,
    pricing: row,
  });
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

const { data: serviceRows, error: serviceError } = await supabase
  .from("organization_services")
  .select("id,organization_id,service_id,status")
  .eq("service_id", CAPABILITY);
if (serviceError) throw new Error(`${CONTRACT}_ORGANIZATION_SERVICE_READ_FAILED:${serviceError.message}`);
if ((serviceRows || []).length !== 0) {
  throw new Error(`${CONTRACT}_ELASTIC_ORGANIZATION_SERVICE_MUST_REMAIN_UNENABLED:count=${serviceRows.length}`);
}

const { data: rows, error: readError } = await supabase
  .from("provider_pricing")
  .select("*")
  .eq("provider", PROVIDER)
  .eq("capability", CAPABILITY)
  .eq("model", MODEL)
  .order("created_at", { ascending: false });
if (readError) throw new Error(`${CONTRACT}_PRICING_READ_FAILED:${readError.message}`);
if ((rows || []).length !== 1) throw new Error(`${CONTRACT}_EXACT_PRICING_ROW_REQUIRED:count=${(rows || []).length}`);

const before = rows[0];
if (before.active !== true) throw new Error(`${CONTRACT}_PRICING_ROW_NOT_ACTIVE`);
const beforeMetadata = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
if (text(beforeMetadata.pricing_contract) !== PRICING_CONTRACT) {
  throw new Error(`${CONTRACT}_PRICING_CONTRACT_MISMATCH`);
}
if (beforeMetadata.human_quality_certified !== true) {
  throw new Error(`${CONTRACT}_HUMAN_QUALITY_NOT_CERTIFIED`);
}
if (!Number.isFinite(Date.parse(text(beforeMetadata.human_quality_reviewed_at)))) {
  throw new Error(`${CONTRACT}_HUMAN_QUALITY_REVIEWED_AT_INVALID`);
}

const beforeReviewer = normalizedReviewer(beforeMetadata.human_quality_reviewer);
if (reviewerIdentityValid(beforeReviewer)) {
  if (beforeReviewer !== reviewer) {
    throw new Error(`${CONTRACT}_VALID_REVIEWER_ALREADY_BOUND_DIFFERENT:${beforeReviewer}`);
  }
  const certification = certify(before);
  if (certification?.eligible !== true) {
    throw new Error(`${CONTRACT}_IDEMPOTENT_CERTIFICATION_FAILED:${certification?.reason || "UNKNOWN"}`);
  }
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
  console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR=PASS");
  console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_VALID=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_IDEMPOTENT=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT");
  process.exit(0);
}

const repairedAt = new Date().toISOString();
const metadata = {
  ...beforeMetadata,
  human_quality_reviewer: reviewer,
  human_quality_reviewer_identity_source: "EXPLICIT_OPERATOR_INPUT",
  human_quality_reviewer_repair_contract: CONTRACT,
  human_quality_reviewer_repaired_at: repairedAt,
  human_quality_reviewer_previous_value_rejected: beforeReviewer || null,
  production_routing_allowed: true,
};

const { data: updated, error: updateError } = await supabase
  .from("provider_pricing")
  .update({ metadata, updated_at: repairedAt })
  .eq("id", before.id)
  .eq("provider", PROVIDER)
  .eq("capability", CAPABILITY)
  .eq("model", MODEL)
  .select("*")
  .single();
if (updateError) throw new Error(`${CONTRACT}_UPDATE_FAILED:${updateError.message}`);
if (!updated?.id || text(updated.id) !== text(before.id) || updated.active !== true) {
  throw new Error(`${CONTRACT}_READBACK_INVALID`);
}
const afterMetadata = updated.metadata && typeof updated.metadata === "object" ? updated.metadata : {};
if (normalizedReviewer(afterMetadata.human_quality_reviewer) !== reviewer) {
  throw new Error(`${CONTRACT}_REVIEWER_READBACK_MISMATCH`);
}
if (!reviewerIdentityValid(afterMetadata.human_quality_reviewer)) {
  throw new Error(`${CONTRACT}_REVIEWER_READBACK_INVALID`);
}

const certification = certify(updated);
if (certification?.eligible !== true) {
  throw new Error(`${CONTRACT}_OWNED_EXECUTION_CERTIFICATION_FAILED:${certification?.reason || "UNKNOWN"}`);
}

const { data: afterServices, error: afterServiceError } = await supabase
  .from("organization_services")
  .select("id")
  .eq("service_id", CAPABILITY);
if (afterServiceError) throw new Error(`${CONTRACT}_POST_REPAIR_SERVICE_READ_FAILED:${afterServiceError.message}`);
if ((afterServices || []).length !== 0) {
  throw new Error(`${CONTRACT}_POST_REPAIR_ORGANIZATION_SERVICE_INVARIANT_FAILED`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  idempotent: false,
  pricing_row_id: updated.id,
  previous_reviewer_value: beforeReviewer || null,
  reviewer,
  reviewer_identity_valid: true,
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
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_VALID=true");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT");
