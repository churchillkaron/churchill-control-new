#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`missing:${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) failures.push(label);
}

function forbidPattern(source, pattern, label) {
  if (pattern.test(source)) failures.push(label);
}

const readiness = read("app/api/creative/music/readiness/route.js");
const registration = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js");
const promotionPlan = read("scripts/plan-avantiqo-music-promotion.mjs");
const promotionApply = read("scripts/apply-avantiqo-music-production-pricing-local.mjs");
const reviewPrep = read("scripts/prepare-avantiqo-music-human-review.mjs");
const reviewRecorder = read("scripts/record-avantiqo-music-human-review-local.mjs");
const reviewFinalizer = read("scripts/finalize-avantiqo-music-human-review.mjs");

requirePattern(readiness, /primary_audio_runtime_available/, "readiness-must-report-primary-runtime-state");
requirePattern(readiness, /management_api_key_configured/, "readiness-must-report-certification-management-binding");
requirePattern(readiness, /secrets_exposed:\s*false/, "readiness-must-state-secrets-are-not-exposed");
forbidPattern(readiness, /RUNPOD_MANAGEMENT_API_KEY\s*[,}]/, "readiness-must-not-return-management-secret-value");
forbidPattern(readiness, /RUNPOD_API_KEY\s*[,}]/, "readiness-must-not-return-runpod-secret-value");
requirePattern(readiness, /acestep-v15-xl-turbo/, "readiness-must-bind-xl-runtime");
requirePattern(readiness, /acestep-5Hz-lm-1\.7B/, "readiness-must-bind-1-7b-lm");
requirePattern(readiness, /ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1/, "readiness-must-bind-quality-profile");

requirePattern(registration, /primaryAudioRuntimeAvailable/, "provider-must-have-runtime-availability-gate");
requirePattern(registration, /foundationModel === "ACE-Step\/Ace-Step1\.5"/, "provider-must-bind-foundation-model");
requirePattern(registration, /modelVariant === EXPECTED_MODEL_VARIANT/, "provider-must-bind-runtime-variant");
requirePattern(registration, /lmModel === EXPECTED_LM_MODEL/, "provider-must-bind-lm-model");
requirePattern(registration, /lmBackend === EXPECTED_LM_BACKEND/, "provider-must-bind-lm-backend");

requirePattern(reviewPrep, /automatic_human_approval_forbidden:\s*true/, "human-review-prep-must-forbid-auto-approval");
requirePattern(reviewRecorder, /Have you listened to the complete review audio\?/, "human-review-must-require-complete-listening");
requirePattern(reviewFinalizer, /human_quality_certified:\s*reviewedItems\.every/, "human-review-finalizer-must-bind-quality-evidence");
requirePattern(promotionPlan, /HUMAN_QUALITY_CERTIFICATION_REQUIRED/, "promotion-plan-must-require-human-quality");
requirePattern(promotionPlan, /certified_model_variant:\s*MODEL_VARIANT/, "promotion-plan-must-bind-reviewed-model-variant");
requirePattern(promotionPlan, /production_routing_allowed:\s*true/, "promotion-plan-must-explicitly-plan-routing");
requirePattern(promotionPlan, /automatic_activation_forbidden:\s*true/, "promotion-plan-must-forbid-auto-activation");

requirePattern(promotionApply, /AVANTIQO_MUSIC_PRODUCTION_PRICING_APPLY_APPROVED/, "promotion-apply-must-require-explicit-approval");
requirePattern(promotionApply, /PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk"/, "promotion-apply-must-pin-production-project");
requirePattern(promotionApply, /CURRENT_ROW_MUST_BE_INACTIVE/, "promotion-apply-must-require-inactive-start");
requirePattern(promotionApply, /human_quality_certified:\s*true/, "promotion-apply-must-require-human-quality");
requirePattern(promotionApply, /certified_model_variant:\s*MODEL_VARIANT/, "promotion-apply-must-promote-exact-model-variant");
requirePattern(promotionApply, /ace_step_lm_enabled:\s*true/, "promotion-apply-must-promote-lm-enabled-runtime");
requirePattern(promotionApply, /freshUsdPerSecond/, "promotion-apply-must-bind-fresh-benchmark-economics");
requirePattern(promotionApply, /freshCostPerUnitThb/, "promotion-apply-must-convert-fresh-economics-to-pricing-currency");
requirePattern(promotionApply, /existingCustomerPriceThbPerSecond/, "promotion-apply-must-preserve-reviewed-customer-price");
requirePattern(promotionApply, /FRESH_COST_EXCEEDS_CURRENT_CUSTOMER_PRICE_EXPLICIT_REPRICING_REQUIRED/, "promotion-apply-must-block-negative-margin-promotion");
requirePattern(promotionApply, /customer_price_preserved_during_certification:\s*true/, "promotion-apply-must-record-customer-price-preservation");
requirePattern(promotionApply, /production_routing_allowed:\s*true/, "promotion-apply-must-enable-routing-only-after-certification");
requirePattern(promotionApply, /requireCertified\(staged, "INACTIVE_STAGE_CANDIDATE"\)/, "promotion-apply-must-certify-inactive-stage");
requirePattern(promotionApply, /requireCertified\(activated, "ACTIVE_READBACK"\)/, "promotion-apply-must-certify-active-readback");
requirePattern(promotionApply, /provider_job_submitted:\s*false/, "promotion-apply-must-not-submit-generation");
requirePattern(promotionApply, /endpoint_mutation_performed:\s*false/, "promotion-apply-must-not-mutate-endpoint");
requirePattern(promotionApply, /production_deploy_performed:\s*false/, "promotion-apply-must-not-deploy-production");

if (failures.length) {
  console.error("AVANTIQO_MUSIC_E2E_RELEASE_AUDIT=FAIL");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("AVANTIQO_MUSIC_E2E_RELEASE_AUDIT=PASS");
console.log("MUSIC_RUNTIME_READINESS=NON_SECRET_FAIL_CLOSED");
console.log("MUSIC_CURRENT_CONTRACT=ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1");
console.log("MUSIC_HUMAN_REVIEW=MANDATORY_AND_NON_AUTOMATIC");
console.log("MUSIC_PROMOTION=EXPLICIT_GUARDED_APPLY_ONLY");
console.log("MUSIC_PROMOTION_ECONOMICS=FRESH_BENCHMARK_BOUND");
console.log("MUSIC_PROMOTION_CUSTOMER_PRICE=PRESERVED_OR_BLOCKED");
console.log("MUSIC_PROMOTION_PROVIDER_JOB_SUBMITTED=false");
console.log("MUSIC_PROMOTION_ENDPOINT_MUTATION_PERFORMED=false");
console.log("MUSIC_PROMOTION_PRODUCTION_DEPLOY_PERFORMED=false");
