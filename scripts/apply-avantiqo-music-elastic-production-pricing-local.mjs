#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_APPLY_V1";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_PLAN_V1";
const PRICING_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_V1";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const UNIT = "second";
const CURRENCY = "THB";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_APPLY_APPROVED";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
  }
  return value;
}

function equalJson(a, b) {
  return JSON.stringify(stableObject(a)) === JSON.stringify(stableObject(b));
}

function numberEqual(a, b, tolerance = 1e-12) {
  const left = finite(a, null);
  const right = finite(b, null);
  return left !== null && right !== null && Math.abs(left - right) <= tolerance;
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

function requireCertified(row, phase) {
  const result = certify(row);
  const failures = [];
  if (result?.model?.eligible !== true) failures.push(result?.model?.reason || "OWNED_MODEL_NOT_ELIGIBLE");
  if (result?.economics?.eligible !== true) failures.push(result?.economics?.reason || "OWNED_PRICING_NOT_ELIGIBLE");
  if (failures.length) throw new Error(`${CONTRACT}_${phase}_CERTIFICATION_FAILED:${failures.join("|")}`);
  return result;
}

function rowMatchesFinal(row, expected) {
  if (!row) return false;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const expectedMetadata = expected.metadata || {};
  return (
    text(row.provider) === PROVIDER &&
    text(row.model) === MODEL &&
    text(row.capability) === CAPABILITY &&
    text(row.unit) === UNIT &&
    text(row.currency) === CURRENCY &&
    numberEqual(row.input_cost_per_1m, expected.input_cost_per_1m) &&
    numberEqual(row.output_cost_per_1m, expected.output_cost_per_1m) &&
    numberEqual(row.cost_per_unit, expected.cost_per_unit) &&
    numberEqual(row.markup_percent, expected.markup_percent) &&
    row.active === true &&
    text(metadata.pricing_contract) === PRICING_CONTRACT &&
    metadata.pricing_promotion_performed === true &&
    metadata.production_routing_allowed === true &&
    text(metadata.pricing_promotion_plan_sha256) === text(expectedMetadata.pricing_promotion_plan_sha256) &&
    equalJson(
      Object.fromEntries(Object.keys(expectedMetadata).filter((key) => key !== "pricing_promotion_applied_at").map((key) => [key, metadata[key]])),
      Object.fromEntries(Object.keys(expectedMetadata).filter((key) => key !== "pricing_promotion_applied_at").map((key) => [key, expectedMetadata[key]])),
    )
  );
}

approved(APPROVAL_ENV);

const planPath = path.resolve(arg("--plan=") || required("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_PLAN_OUTPUT"));
if (!fs.existsSync(planPath)) throw new Error(`${CONTRACT}_PLAN_FILE_NOT_FOUND`);
const planBytes = fs.readFileSync(planPath);
const planSha = sha256(planBytes);
const plan = JSON.parse(planBytes.toString("utf8"));

const planFailures = [];
const check = (name, condition) => { if (!condition) planFailures.push(name); };
check("success", plan?.success === true);
check("contract", text(plan?.contract) === PLAN_CONTRACT);
check("mode", text(plan?.mode) === "PLAN");
check("capability", text(plan?.capability) === CAPABILITY);
check("provider", text(plan?.provider) === PROVIDER);
check("model", text(plan?.model) === MODEL);
check("promotion_ready", plan?.promotion_ready === true);
check("blockers_empty", Array.isArray(plan?.blockers) && plan.blockers.length === 0);
check("reviewer_bound", plan?.human_quality_reviewer_bound === true);
check("no_prior_activation", plan?.pricing_activation_performed === false);
check("no_prior_database_mutation", plan?.database_mutation_performed === false);
check("no_org_service_mutation", plan?.organization_service_mutation_performed === false);
check("no_provider_routing_mutation", plan?.provider_routing_mutation_performed === false);
check("no_provider_job", plan?.provider_job_submitted === false);
check("no_endpoint_mutation", plan?.endpoint_mutation_performed === false);
check("no_deploy", plan?.production_deploy_performed === false);
check("owned_model_eligible", plan?.owned_execution_certification?.model?.eligible === true);
check("owned_pricing_eligible", plan?.owned_execution_certification?.economics?.eligible === true);
if (planFailures.length) throw new Error(`${CONTRACT}_PLAN_INVALID:${planFailures.join(",")}`);

const proposed = plan.proposed_provider_pricing_row || {};
const proposedMetadata = proposed.metadata && typeof proposed.metadata === "object" ? proposed.metadata : {};
const proposedFailures = [];
const pcheck = (name, condition) => { if (!condition) proposedFailures.push(name); };
pcheck("provider", text(proposed.provider) === PROVIDER);
pcheck("model", text(proposed.model) === MODEL);
pcheck("capability", text(proposed.capability) === CAPABILITY);
pcheck("unit", text(proposed.unit) === UNIT);
pcheck("currency", text(proposed.currency) === CURRENCY);
pcheck("active", proposed.active === true);
pcheck("input_zero", finite(proposed.input_cost_per_1m, null) === 0);
pcheck("output_zero", finite(proposed.output_cost_per_1m, null) === 0);
pcheck("cost_positive", finite(proposed.cost_per_unit, 0) > 0);
pcheck("markup_nonnegative", finite(proposed.markup_percent, -1) >= 0);
pcheck("pricing_contract", text(proposedMetadata.pricing_contract) === PRICING_CONTRACT);
pcheck("production_certified", text(proposedMetadata.pricing_status) === "PRODUCTION_CERTIFIED");
pcheck("owned_inference", proposedMetadata.owned_inference === true);
pcheck("benchmark_certified", proposedMetadata.benchmark_certified === true);
pcheck("economics_certified", proposedMetadata.economics_certified === true);
pcheck("license_verified", proposedMetadata.model_license_verified === true);
pcheck("recalibration_clear", proposedMetadata.recalibration_required === false);
pcheck("human_quality_certified", proposedMetadata.human_quality_certified === true);
pcheck("human_reviewer", Boolean(text(proposedMetadata.human_quality_reviewer)));
pcheck("human_reviewed_at", Boolean(text(proposedMetadata.human_quality_reviewed_at)) && Number.isFinite(Date.parse(text(proposedMetadata.human_quality_reviewed_at))));
pcheck("certified_capability", text(proposedMetadata.certified_capability) === CAPABILITY);
pcheck("certified_model", text(proposedMetadata.certified_model) === MODEL);
pcheck("routing_allowed_plan", proposedMetadata.production_routing_allowed === true);
pcheck("promotion_not_performed_plan", proposedMetadata.pricing_promotion_performed === false);
if (proposedFailures.length) throw new Error(`${CONTRACT}_PROPOSED_ROW_INVALID:${proposedFailures.join(",")}`);
requireCertified(proposed, "PLAN_ROW");

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

async function exactRows() {
  const { data, error } = await supabase
    .from("provider_pricing")
    .select("*")
    .eq("provider", PROVIDER)
    .eq("capability", CAPABILITY)
    .eq("model", MODEL)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`${CONTRACT}_READ_EXACT_ROWS_FAILED:${error.message}`);
  return data || [];
}

const beforeRows = await exactRows();
if (beforeRows.length > 1) throw new Error(`${CONTRACT}_DUPLICATE_EXACT_ROWS_BEFORE:${beforeRows.length}`);
const plannedCount = finite(plan?.live_database_read?.existing_exact_row_count, -1);
const plannedId = text(plan?.live_database_read?.existing_row_id);
if (beforeRows.length !== plannedCount) {
  throw new Error(`${CONTRACT}_LIVE_STATE_CHANGED_SINCE_PLAN:count=${beforeRows.length}:planned=${plannedCount}`);
}
if (beforeRows.length === 1 && plannedId && text(beforeRows[0]?.id) !== plannedId) {
  throw new Error(`${CONTRACT}_LIVE_ROW_CHANGED_SINCE_PLAN`);
}

const appliedAt = new Date().toISOString();
const finalMetadata = {
  ...proposedMetadata,
  pricing_promotion_performed: true,
  production_routing_allowed: true,
  pricing_promotion_plan_contract: PLAN_CONTRACT,
  pricing_promotion_plan_sha256: planSha,
  pricing_promotion_applied_at: appliedAt,
};
const finalRow = {
  provider: PROVIDER,
  model: MODEL,
  input_cost_per_1m: finite(proposed.input_cost_per_1m, 0),
  output_cost_per_1m: finite(proposed.output_cost_per_1m, 0),
  markup_percent: finite(proposed.markup_percent, 0),
  capability: CAPABILITY,
  unit: UNIT,
  cost_per_unit: finite(proposed.cost_per_unit, null),
  currency: CURRENCY,
  metadata: finalMetadata,
  active: true,
};
const inactiveStage = { ...finalRow, active: false };
requireCertified(inactiveStage, "INACTIVE_STAGE_CANDIDATE");

if (beforeRows.length === 1 && rowMatchesFinal(beforeRows[0], finalRow)) {
  const alreadyCertification = requireCertified(beforeRows[0], "ALREADY_APPLIED_ROW");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    idempotent: true,
    pricing_row_id: beforeRows[0].id,
    pricing_activation_performed: false,
    database_mutation_performed: false,
    active: true,
    owned_execution_certification: alreadyCertification,
    organization_service_mutation_performed: false,
    provider_routing_mutation_performed: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    production_deploy_performed: false,
    next_action: "PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT",
  }, null, 2));
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_APPLY=PASS");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_ACTIVE=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_IDEMPOTENT=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT");
  process.exitCode = 0;
} else {
  let staged = null;
  let mutationKind = "";
  if (beforeRows.length === 0) {
    const { data, error } = await supabase
      .from("provider_pricing")
      .insert(inactiveStage)
      .select("*")
      .single();
    if (error) throw new Error(`${CONTRACT}_INACTIVE_INSERT_FAILED:${error.message}`);
    staged = data;
    mutationKind = "INSERT";
  } else {
    const rowId = text(beforeRows[0]?.id);
    if (!rowId) throw new Error(`${CONTRACT}_EXISTING_ROW_ID_REQUIRED`);
    const { data, error } = await supabase
      .from("provider_pricing")
      .update(inactiveStage)
      .eq("id", rowId)
      .select("*")
      .single();
    if (error) throw new Error(`${CONTRACT}_INACTIVE_UPDATE_FAILED:${error.message}`);
    staged = data;
    mutationKind = "UPDATE";
  }

  if (!staged?.id || staged.active !== false) {
    throw new Error(`${CONTRACT}_INACTIVE_STAGE_READBACK_INVALID`);
  }
  const stagedCertification = requireCertified(staged, "INACTIVE_STAGE_READBACK");

  const { data: activated, error: activateError } = await supabase
    .from("provider_pricing")
    .update({ active: true, metadata: finalMetadata, updated_at: new Date().toISOString() })
    .eq("id", staged.id)
    .eq("active", false)
    .select("*")
    .single();
  if (activateError) throw new Error(`${CONTRACT}_ACTIVATION_FAILED:${activateError.message}`);
  if (!rowMatchesFinal(activated, finalRow)) {
    throw new Error(`${CONTRACT}_ACTIVE_READBACK_MISMATCH`);
  }
  const finalCertification = requireCertified(activated, "ACTIVE_READBACK");

  const afterRows = await exactRows();
  if (afterRows.length !== 1 || text(afterRows[0]?.id) !== text(activated.id) || afterRows[0]?.active !== true) {
    throw new Error(`${CONTRACT}_POST_APPLY_EXACT_ROW_INVARIANT_FAILED`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    pricing_plan_path: planPath,
    pricing_plan_sha256: planSha,
    mutation_kind: mutationKind,
    pricing_row_id: activated.id,
    provider: activated.provider,
    capability: activated.capability,
    model: activated.model,
    unit: activated.unit,
    currency: activated.currency,
    cost_per_unit: activated.cost_per_unit,
    markup_percent: activated.markup_percent,
    active: activated.active,
    staged_inactive_before_activation: true,
    staged_owned_execution_certification: stagedCertification,
    owned_execution_certification: finalCertification,
    exact_row_count_after: afterRows.length,
    pricing_activation_performed: true,
    database_mutation_performed: true,
    organization_service_mutation_performed: false,
    provider_routing_mutation_performed: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    production_deploy_performed: false,
    next_action: "PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT",
  }, null, 2));
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_APPLY=PASS");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_ACTIVE=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_CERTIFIED=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=PLAN_CHURCHILL_ELASTIC_ORGANIZATION_SERVICE_ENABLEMENT");
}
