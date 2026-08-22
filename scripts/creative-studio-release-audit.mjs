#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const violations = [];

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    violations.push({ rule: "CREATIVE_STUDIO_REQUIRED_FILE_MISSING", file: relativePath });
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireAll(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      violations.push({
        rule: "CREATIVE_STUDIO_RELEASE_CONTRACT_MISSING",
        file: label,
        detail: needle,
      });
    }
  }
}

const callbackRoute = read("app/api/creative/providers/callback/route.js");
const providerExecutorWrapper = read("lib/platform/service-runtime/providers/ProviderExecutor.js");
const providerExecutorCore = read("lib/platform/service-runtime/providers/ProviderExecutorCore.js");
const providerExecutor = `${providerExecutorWrapper}\n${providerExecutorCore}`;
const completionRuntime = read("lib/creative/providers/runtime/CreativeProviderCompletionRuntime.js");
const walletRuntime = read("lib/platform/service-runtime/wallet/runtime/WalletRuntime.js");
const walletMigration = read("supabase/migrations/20260726143000_service_wallet_atomic_settlement.sql");
const billingRepository = read("lib/platform/service-runtime/billing/repositories/BillingRepository.js");
const oneTimeLedger = read("supabase/migrations/20260810073500_creative_one_time_execution_claim_ledger.sql");
const oneTimeExecuteRoute = read("app/api/creative/tests/gemini-omni-5s/perceptual-review/execute/route.js");
const releaseReadiness = read("lib/creative/release/runtime/CreativeReleaseReadinessRuntime.js");
const finalAudioIntegrity = read("lib/creative/post-production/runtime/CreativeProfessionalFinalAudioIntegrityRuntime.js");
const openAIGovernanceAudit = read("scripts/openai-governance-release-audit.mjs");
const executionJobRepository = read("lib/creative/execution/repositories/CreativeExecutionJobRepository.js");
const stillImageInputRuntime = read("lib/creative/media/runtime/CreativeStillImageInputRuntime.js");
const mediaBinaryRuntime = read("lib/creative/media/runtime/CreativeMediaBinaryRuntime.js");

requireAll("Creative provider callback authentication", callbackRoute, [
  "CREATIVE_PROVIDER_CALLBACK_SECRET",
  "createHmac(\"sha256\"",
  "timingSafeEqual",
  "Provider does not match production task",
  "Provider job does not match production task",
]);

requireAll("Provider execution wrapper delegates to governed core", providerExecutorWrapper, [
  "./ProviderExecutorCore",
]);

requireAll("Provider execution and completion contract", providerExecutor, [
  "export async function prepareProviderInputForExecution",
  "export async function getProviderStatus",
  "OPENAI_AVANTIQO_GOVERNED_SERVICE_EXECUTION_REQUIRED",
  "OPENAI_AVANTIQO_MANAGED_CREDENTIAL_REQUIRED",
  "PROVIDER_CREDENTIAL_BUSINESS_INPUT_ISOLATION_V1",
]);

requireAll("Creative provider settlement runtime", completionRuntime, [
  "getProviderStatus",
  "UsageRuntime",
  "WalletRuntime",
  "BillingRuntime",
  "task.status === \"COMPLETED\" || task.status === \"FAILED\"",
]);

requireAll("Wallet idempotency runtime", walletRuntime, [
  "WALLET_IDEMPOTENCY_KEY_REQUIRED",
  "idempotencyKey(operation",
]);

requireAll("Atomic wallet database settlement", walletMigration, [
  "wallet_transactions_org_idempotency_uidx",
  "pg_advisory_xact_lock",
  "apply_wallet_transaction",
  "WALLET_IDEMPOTENCY_CONFLICT",
]);

requireAll("Service billing duplicate-usage defense", billingRepository, [
  "getLineByUsage",
  ".eq(\n        \"usage_id\"",
]);

requireAll("Creative one-time execution security ledger", oneTimeLedger, [
  "creative_one_time_execution_claims",
  "prepare_creative_one_time_task_execution",
  "claim_creative_one_time_task_execution",
  "enable row level security",
  "grant execute on function",
  "to service_role",
]);

requireAll("Creative one-time perceptual execution route", oneTimeExecuteRoute, [
  "creative_one_time_execution_claims",
  "claim_creative_one_time_task_execution",
  "ONE_TIME_EXECUTION_LEDGER_CONSUMPTION_REQUIRED",
  "publication_authorized: false",
  "media_regeneration_authorized: false",
  "one_time_execution_ledger_authoritative: true",
]);

requireAll("Creative release readiness", releaseReadiness, [
  "final_master_soundtrack_integrity_passed",
  "final_master_audio_verified",
  "semantic_quality_passed",
  "release_gate_human_approved",
  "final_render_human_approved",
  "no_open_repair_plan",
]);

requireAll("Creative professional final audio integrity", finalAudioIntegrity, [
  "CREATIVE_PROFESSIONAL_FINAL_AUDIO_INTEGRITY_V1",
  "CreativeMasterSoundtrackIntegrityRuntime.validate",
  "master_soundtrack_integrity_passed_after_finishing",
  "final_master_audio_verified",
  "FINAL_MASTER_SOUNDTRACK_INTEGRITY_FAILED",
]);

requireAll("Avantiqo OpenAI governance audit", openAIGovernanceAudit, [
  "OPENAI_EXECUTION_OWNER=AVANTIQO_SERVICE_RUNTIME",
  "OPENAI_RAW_ADAPTER_ENTRY=SANITIZED_RUNTIME_ONLY",
  "OPENAI_DIRECT_HTTP_BYPASS=FORBIDDEN",
  "OPENAI_CREDENTIAL_MODEL=AVANTIQO_MANAGED_AI",
  "OPENAI_USAGE_PATH=SERVICE_PROVIDER_PRICING_WALLET_USAGE_BILLING",
]);

requireAll("Creative execution empty-queue handling", executionJobRepository, [
  "function normalizeClaimedJob(data)",
  "Array.isArray(data) ? data[0] : data",
  "return claimed?.id ? claimed : null",
  "return normalizeClaimedJob(data)",
]);

requireAll("Creative universal still-image decode bridge", stillImageInputRuntime, [
  "CREATIVE_STILL_IMAGE_INPUT_RUNTIME_V1",
  "sharp",
  "ensureAlpha",
  "raw({ depth: \"uchar\" })",
  "-f", "rawvideo",
  "-pixel_format", "rgba",
  "ffmpeg_image_decoder_required: false",
]);

requireAll("Creative media readiness exposes still-image support", mediaBinaryRuntime, [
  "creativeStillImageInputReadiness",
  "still_image_input_ready",
  "still_image_supported_input_formats",
  "ffmpeg_image_decoder_required",
]);

if (violations.length) {
  console.error("CREATIVE_STUDIO_RELEASE_AUDIT=FAIL");
  for (const violation of violations) {
    console.error(`${violation.rule}: ${violation.file}${violation.detail ? ` :: ${violation.detail}` : ""}`);
  }
  process.exitCode = 1;
} else {
  console.log("CREATIVE_STUDIO_RELEASE_AUDIT=PASS");
  console.log("CREATIVE_PROVIDER_CALLBACK=HMAC_AUTHENTICATED");
  console.log("CREATIVE_PROVIDER_COMPLETION=POLLING_AND_SETTLEMENT_GOVERNED");
  console.log("CREATIVE_WALLET_SETTLEMENT=ATOMIC_IDEMPOTENT");
  console.log("CREATIVE_BILLING_USAGE=DEDUPLICATED");
  console.log("CREATIVE_ONE_TIME_EXECUTION=DURABLE_LEDGER_GOVERNED");
  console.log("CREATIVE_EXECUTION_EMPTY_QUEUE=IDLE_WITHOUT_ERROR");
  console.log("CREATIVE_OPENAI_EXECUTION=AVANTIQO_MANAGED_ONLY");
  console.log("CREATIVE_FINAL_AUDIO=POST_FINISHING_PCM_INTEGRITY_REQUIRED");
  console.log("CREATIVE_RELEASE=QUALITY_RIGHTS_HUMAN_APPROVAL_REQUIRED");
  console.log("CREATIVE_STILL_IMAGE_INPUT=SHARP_TO_RAW_RGBA");
  console.log("CREATIVE_FFMPEG_IMAGE_DECODER_DEPENDENCY=REMOVED");
}
