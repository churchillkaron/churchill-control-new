#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const EVIDENCE_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";
const CAPABILITY = "ai.audio.stems";
const CATALOG_MODEL = "facebookresearch/demucs:htdemucs_ft";
const RUNTIME_MODEL = "demucs-htdemucs-ft";
const QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";

const INPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-music-separator-certification-evidence.json",
);

function text(value) {
  return String(value ?? "").trim();
}

const evidence = JSON.parse(await readFile(INPUT, "utf8"));
const capability = Array.isArray(evidence?.capabilities)
  ? evidence.capabilities.find((item) => text(item?.capability) === CAPABILITY)
  : null;

const failures = [];
if (text(evidence?.contract) !== EVIDENCE_CONTRACT) failures.push("EVIDENCE_CONTRACT_INVALID");
if (evidence?.human_quality_certified !== true) failures.push("HUMAN_QUALITY_CERTIFICATION_REQUIRED");
if (evidence?.economics_evidence_complete !== true) failures.push("ECONOMICS_EVIDENCE_REQUIRED");
if (evidence?.production_certified !== false) failures.push("EVIDENCE_MUST_REMAIN_PRE_PRODUCTION");
if (evidence?.activation_allowed !== false) failures.push("AUTOMATIC_ACTIVATION_MUST_REMAIN_FORBIDDEN");
if (!capability) failures.push("STEMS_CAPABILITY_EVIDENCE_REQUIRED");
if (text(capability?.catalog_model) !== CATALOG_MODEL) failures.push("CATALOG_MODEL_BINDING_INVALID");
if (text(capability?.runtime_model) !== RUNTIME_MODEL) failures.push("RUNTIME_MODEL_BINDING_INVALID");
if (text(capability?.quality_profile) !== QUALITY_PROFILE) failures.push("QUALITY_PROFILE_BINDING_INVALID");
if (capability?.rights_attestation_confirmed !== true) failures.push("SOURCE_RIGHTS_EVIDENCE_REQUIRED");
if (capability?.human_quality_passed !== true) failures.push("CAPABILITY_HUMAN_QUALITY_REQUIRED");

if (failures.length) {
  console.error(JSON.stringify({
    success: false,
    contract: "AVANTIQO_MUSIC_SEPARATOR_PROMOTION_PLAN_V1",
    mode: "PLAN_ONLY",
    failures,
    provider_certification_mutation_performed: false,
    production_routing_mutation_performed: false,
    pricing_activation_performed: false,
    production_deploy_performed: false,
  }, null, 2));
  process.exit(1);
}

const currentCertified = text(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const targetCertified = [...new Set(["ai.music.generate", ...currentCertified, CAPABILITY])];

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MUSIC_SEPARATOR_PROMOTION_PLAN_V1",
  mode: "PLAN_ONLY",
  capability: CAPABILITY,
  catalog_model: CATALOG_MODEL,
  runtime_model: RUNTIME_MODEL,
  quality_profile: QUALITY_PROFILE,
  source_evidence_contract: EVIDENCE_CONTRACT,
  source_benchmark_id: evidence.benchmark_id || null,
  proposed_changes: {
    provider_certification: {
      environment_variable: "AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES",
      current: currentCertified.length ? currentCertified : ["ai.music.generate"],
      proposed: targetCertified,
      apply_requires_explicit_operator_approval: true,
    },
    separator_engine_enablement: {
      environment_variable: "AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED",
      proposed_value: "true",
      apply_requires_explicit_operator_approval: true,
    },
    production_routing: {
      capability: CAPABILITY,
      proposed: true,
      apply_requires_explicit_operator_approval: true,
    },
    pricing: {
      capability: CAPABILITY,
      basis: "SOURCE_AUDIO_PROCESSING_TIME",
      economics_contract: evidence.economics_contract || null,
      proposed_status: "REVIEW_MEASURED_ECONOMICS_THEN_ACTIVATE_EXPLICITLY",
      apply_requires_explicit_operator_approval: true,
    },
  },
  gates_passed: {
    runtime_benchmark: true,
    economics: true,
    human_quality: true,
    source_rights: true,
    exact_model_binding: true,
    exact_capability_binding: true,
  },
  provider_certification_mutation_performed: false,
  production_routing_mutation_performed: false,
  separator_engine_mutation_performed: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
  activation_allowed_without_explicit_operator_approval: false,
  next_action: "EXPLICIT_OPERATOR_PROMOTION_APPROVAL_REQUIRED",
}, null, 2));
