import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();

const paths = Object.freeze({
  transcriptSafety: "lib/operator/voice/OperatorVoiceTranscriptSafety.js",
  transcribeRoute: "app/api/operator/transcribe/route.js",
  homeDock: "components/operator/HomeAvantiqoIntelligenceDock.jsx",
  publicErrorPolicy: "lib/operator/runtime/OperatorPublicErrorPolicy.js",
  operatorTurn: "lib/operator/runtime/OperatorTurnRuntime.js",
  asyncTranscription:
    "lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime.js",
  certificationPolicy:
    "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  voiceRegistration:
    "lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js",
  voiceMigration:
    "supabase/migrations/20260829100000_voice_owned_only_provider_guard.sql",
  intelligenceMigration:
    "supabase/migrations/20260829095500_intelligence_owned_only_provider_guard.sql",
});

const voiceProofPath =
  process.env.AVANTIQO_VOICE_FINAL_PROOF_FILE ||
  "audits/results/avantiqo-voice-owned-final-certification.json";
const intelligenceProofPath =
  process.env.AVANTIQO_INTELLIGENCE_FINAL_PROOF_FILE ||
  "audits/results/avantiqo-intelligence-owned-final-certification.json";

function fail(code, details = null) {
  const error = new Error(code);
  if (details) error.details = details;
  throw error;
}

async function source(relative) {
  try {
    return await readFile(resolve(ROOT, relative), "utf8");
  } catch (error) {
    fail(`FINAL_RELEASE_SOURCE_REQUIRED:${relative}`, error?.code || null);
  }
}

function requireText(contents, expected, code) {
  if (!contents.includes(expected)) fail(code);
}

function forbidText(contents, forbidden, code) {
  if (contents.includes(forbidden)) fail(code);
}

async function json(relative, missingCode) {
  let raw;
  try {
    raw = await readFile(resolve(ROOT, relative), "utf8");
  } catch (error) {
    fail(missingCode, error?.code || null);
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${missingCode}:INVALID_JSON`);
  }
}

function requireOwnedProof(proof, {
  provider,
  capabilityFamily,
  contractCode,
}) {
  if (proof?.success !== true) fail(`${contractCode}:SUCCESS_REQUIRED`);
  if (String(proof?.provider || "").trim() !== provider) {
    fail(`${contractCode}:OWNED_PROVIDER_REQUIRED`);
  }
  if (proof?.external_fallback_allowed !== false) {
    fail(`${contractCode}:EXTERNAL_FALLBACK_MUST_BE_FALSE`);
  }
  if (proof?.external_provider_used === true) {
    fail(`${contractCode}:EXTERNAL_PROVIDER_USED`);
  }
  if (proof?.production_service_runtime_proven !== true) {
    fail(`${contractCode}:PRODUCTION_SERVICE_RUNTIME_PROOF_REQUIRED`);
  }
  if (proof?.workers_restored_0_0 !== true) {
    fail(`${contractCode}:WORKERS_0_0_REQUIRED`);
  }
  if (proof?.wallet_settlement_verified !== true) {
    fail(`${contractCode}:WALLET_SETTLEMENT_REQUIRED`);
  }
  const capabilities = Array.isArray(proof?.capabilities)
    ? proof.capabilities.map((value) => String(value))
    : [];
  if (!capabilities.some((value) => value.startsWith(capabilityFamily))) {
    fail(`${contractCode}:CAPABILITY_PROOF_REQUIRED`);
  }
}

const [
  transcriptSafety,
  transcribeRoute,
  homeDock,
  publicErrorPolicy,
  operatorTurn,
  asyncTranscription,
  certificationPolicy,
  voiceRegistration,
  voiceMigration,
  intelligenceMigration,
] = await Promise.all([
  source(paths.transcriptSafety),
  source(paths.transcribeRoute),
  source(paths.homeDock),
  source(paths.publicErrorPolicy),
  source(paths.operatorTurn),
  source(paths.asyncTranscription),
  source(paths.certificationPolicy),
  source(paths.voiceRegistration),
  source(paths.voiceMigration),
  source(paths.intelligenceMigration),
]);

requireText(
  transcriptSafety,
  "AVANTIQO_VOICE_INTERNAL_PROMPT_ECHO_REJECTED",
  "FINAL_RELEASE_VOICE_PROMPT_ECHO_GUARD_REQUIRED",
);
requireText(
  transcribeRoute,
  "inspectOperatorVoiceTranscript",
  "FINAL_RELEASE_TRANSCRIBE_BOUNDARY_GUARD_REQUIRED",
);
requireText(
  transcribeRoute,
  "raw_transcript_returned: false",
  "FINAL_RELEASE_RAW_TRANSCRIPT_REJECTION_REQUIRED",
);
requireText(
  homeDock,
  'detail.source = source === "voice" ? "voice" : "text"',
  "FINAL_RELEASE_HOME_TEXT_DEFAULT_REQUIRED",
);
requireText(
  homeDock,
  "stopImmediatePropagation",
  "FINAL_RELEASE_VOICE_SELF_ECHO_GUARD_REQUIRED",
);
requireText(
  publicErrorPolicy,
  "raw_provider_errors_exposed: false",
  "FINAL_RELEASE_PUBLIC_ERROR_POLICY_REQUIRED",
);
requireText(
  operatorTurn,
  "shouldSanitizeOperatorRuntimeError",
  "FINAL_RELEASE_OPERATOR_ERROR_BOUNDARY_REQUIRED",
);
requireText(
  asyncTranscription,
  'const OWNED_PROVIDER = "avantiqo-voice"',
  "FINAL_RELEASE_ASYNC_STT_OWNED_PROVIDER_REQUIRED",
);
requireText(
  asyncTranscription,
  "await assertOwnedSttProviderReady(organization)",
  "FINAL_RELEASE_ASYNC_STT_PROVIDER_PREFLIGHT_REQUIRED",
);
requireText(
  asyncTranscription,
  "provider_id: OWNED_PROVIDER",
  "FINAL_RELEASE_ASYNC_STT_PROVIDER_PIN_REQUIRED",
);
requireText(
  asyncTranscription,
  "external_fallback_allowed: false",
  "FINAL_RELEASE_ASYNC_STT_EXTERNAL_FALLBACK_FALSE_REQUIRED",
);
requireText(
  certificationPolicy,
  '"Qwen/Qwen3-30B-A3B-Instruct-2507"',
  "FINAL_RELEASE_INTELLIGENCE_INSTRUCT_CATALOG_REQUIRED",
);
requireText(
  certificationPolicy,
  "intelligence_pricing_model_bound",
  "FINAL_RELEASE_INTELLIGENCE_EXACT_MODEL_CERTIFICATION_REQUIRED",
);
requireText(
  voiceRegistration,
  "external_provider_fallback_allowed: false",
  "FINAL_RELEASE_VOICE_REGISTRY_OWNED_ONLY_REQUIRED",
);
forbidText(
  voiceRegistration,
  "external_provider_fallback_allowed: true",
  "FINAL_RELEASE_VOICE_REGISTRY_EXTERNAL_FALLBACK_FORBIDDEN",
);
requireText(
  voiceMigration,
  "provider <> 'avantiqo-voice'",
  "FINAL_RELEASE_VOICE_DB_EXTERNAL_GUARD_REQUIRED",
);
requireText(
  voiceMigration,
  "fallback_enabled = false",
  "FINAL_RELEASE_VOICE_DB_FALLBACK_FALSE_REQUIRED",
);
requireText(
  intelligenceMigration,
  "provider <> 'avantiqo-intelligence'",
  "FINAL_RELEASE_INTELLIGENCE_DB_EXTERNAL_GUARD_REQUIRED",
);
requireText(
  intelligenceMigration,
  "Qwen/Qwen3-30B-A3B-Instruct-2507",
  "FINAL_RELEASE_INTELLIGENCE_FAST_MODEL_REQUIRED",
);
requireText(
  intelligenceMigration,
  "fallback_enabled = false",
  "FINAL_RELEASE_INTELLIGENCE_DB_FALLBACK_FALSE_REQUIRED",
);

const [voiceProof, intelligenceProof] = await Promise.all([
  json(
    voiceProofPath,
    `FINAL_RELEASE_VOICE_PROOF_MISSING:${voiceProofPath}`,
  ),
  json(
    intelligenceProofPath,
    `FINAL_RELEASE_INTELLIGENCE_PROOF_MISSING:${intelligenceProofPath}`,
  ),
]);

requireOwnedProof(voiceProof, {
  provider: "avantiqo-voice",
  capabilityFamily: "ai.",
  contractCode: "FINAL_RELEASE_VOICE_PROOF",
});
requireOwnedProof(intelligenceProof, {
  provider: "avantiqo-intelligence",
  capabilityFamily: "ai.",
  contractCode: "FINAL_RELEASE_INTELLIGENCE_PROOF",
});

console.log("AVANTIQO_HOME_VOICE_OWNED_FINAL_RELEASE_PREFLIGHT=GREEN");
console.log(`VOICE_PROOF=${voiceProofPath}`);
console.log(`INTELLIGENCE_PROOF=${intelligenceProofPath}`);
console.log("EXTERNAL_AI_FALLBACK_ALLOWED=false");
console.log("PRODUCTION_DEPLOY_PERFORMED=false");
