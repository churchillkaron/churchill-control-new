#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_SFX_PROMOTION_PLAN_V1";
const CAPABILITY = "ai.sfx.generate";
const PROVIDER = "avantiqo-audio";
const PRODUCT_MODEL = "avantiqo-sfx-v1";
const FOUNDATION_MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0";
const INPUT = resolve(process.env.AVANTIQO_MUSIC_SFX_CERTIFICATION_EVIDENCE || "/tmp/avantiqo-music-sfx-certification-evidence.json");
const OUTPUT = resolve(process.env.AVANTIQO_MUSIC_SFX_PROMOTION_PLAN_OUTPUT || "/tmp/avantiqo-music-sfx-promotion-plan.json");
const text = (value) => String(value ?? "").trim();

let evidence;
try { evidence = JSON.parse(await readFile(INPUT, "utf8")); }
catch { evidence = null; }
const failures = [];
if (!evidence) failures.push("SFX_CERTIFICATION_EVIDENCE_REQUIRED");
if (evidence && text(evidence.capability) !== CAPABILITY) failures.push("SFX_CAPABILITY_BINDING_INVALID");
if (evidence && text(evidence.provider) !== PROVIDER) failures.push("SFX_PROVIDER_BINDING_INVALID");
if (evidence && text(evidence.product_model) !== PRODUCT_MODEL) failures.push("SFX_PRODUCT_MODEL_BINDING_INVALID");
if (evidence && text(evidence.foundation_model) !== FOUNDATION_MODEL) failures.push("SFX_FOUNDATION_MODEL_BINDING_INVALID");
if (evidence && evidence.benchmark_certified !== true) failures.push("SFX_BENCHMARK_CERTIFICATION_REQUIRED");
if (evidence && evidence.economics_certified !== true) failures.push("SFX_ECONOMICS_CERTIFICATION_REQUIRED");
if (evidence && evidence.human_quality_certified !== true) failures.push("SFX_HUMAN_QUALITY_CERTIFICATION_REQUIRED");
if (evidence && text(evidence.human_review_status) !== "APPROVED") failures.push("SFX_HUMAN_REVIEW_APPROVAL_REQUIRED");
if (evidence && !text(evidence.human_reviewer)) failures.push("SFX_HUMAN_REVIEWER_REQUIRED");
if (evidence && Number(evidence.human_review_minimum_score) < 92) failures.push("SFX_HUMAN_REVIEW_MINIMUM_92_REQUIRED");
if (evidence && Number(evidence.human_review_average_score) < 92) failures.push("SFX_HUMAN_REVIEW_AVERAGE_92_REQUIRED");
if (evidence && !text(evidence.source_certification_path)) failures.push("SFX_SOURCE_CERTIFICATION_BINDING_REQUIRED");
if (evidence && !text(evidence.human_review_result_path)) failures.push("SFX_HUMAN_REVIEW_RESULT_BINDING_REQUIRED");
if (evidence && evidence.model_license_verified !== true) failures.push("SFX_MODEL_LICENSE_VERIFICATION_REQUIRED");
if (evidence && evidence.production_routing_allowed !== false) failures.push("SFX_EVIDENCE_MUST_REMAIN_PRE_PROMOTION");
if (evidence && evidence.activation_allowed !== false) failures.push("SFX_AUTOMATIC_ACTIVATION_FORBIDDEN");

if (failures.length) {
  console.error(JSON.stringify({ success:false, contract:CONTRACT, mode:"PLAN_ONLY", failures,
    pricing_mutation_performed:false, provider_configuration_mutation_performed:false,
    production_routing_mutation_performed:false, production_deployment_performed:false }, null, 2));
  process.exit(1);
}

const plan = {
  success:true, contract:CONTRACT, mode:"PLAN_ONLY", generated_at:new Date().toISOString(),
  capability:CAPABILITY, provider:PROVIDER, product_model:PRODUCT_MODEL, foundation_model:FOUNDATION_MODEL,
  source_evidence_path:INPUT,
  proposed_pricing_metadata:{ pricing_status:"PRODUCTION_CERTIFIED", benchmark_certified:true,
    economics_certified:true, human_quality_certified:true, production_routing_allowed:true,
    model_license_verified:true, recalibration_required:false, commercial_pricing_certified:true },
  proposed_provider_configuration:{ AVANTIQO_SFX_ENGINE_ENABLED:"true", AVANTIQO_SFX_ENGINE_CERTIFIED:"true" },
  foley_dependency:{ capability:"creative.audio.foley", execution_capability:CAPABILITY, ready_after_sfx_promotion:true },
  pricing_mutation_performed:false, provider_configuration_mutation_performed:false,
  production_routing_mutation_performed:false, production_deployment_performed:false,
  activation_performed:false, automatic_activation_forbidden:true, explicit_operator_promotion_required:true,
};
await writeFile(OUTPUT, `${JSON.stringify(plan,null,2)}\n`);
console.log(JSON.stringify(plan,null,2));
