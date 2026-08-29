import { writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERTIFICATION_V1";
const ECONOMICS_CONTRACT = "AVANTIQO_VOICE_COLD_START_ECONOMICS_V1";
const OWNED_PROVIDER = "avantiqo-voice";
const CAPABILITY = "ai.text.to.speech";
const FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const LANE = "voice-tts";
const TTS_ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const TTS_ENDPOINT_ID = "a5a2evletdphds";
const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";
const OUTPUT = resolve(
  process.env.AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERT_OUTPUT ||
    "/tmp/avantiqo-voice-production-service-runtime-certification.json",
);
const PHRASE = "Avantiqo Secretary voice service runtime certification.";
const QUANTITY_MINUTES = 0.05;
const POLL_MS = 3000;
const MAX_POLLS = 120;
const MAX_CONFIGURED_SERVERLESS_GPU_USD_PER_HOUR = 3.49;
const MAX_GPU_PRICE_SOURCE = "https://www.runpod.io/pricing";
const MAX_GPU_PRICE_OBSERVED_AT = "2026-08-29T13:03:00Z";
const USD_TO_THB = 33.15;
const FX_SOURCE = "OPENAI_CURRENCY_SOURCE";
const FX_OBSERVED_AT = "2026-08-29T13:03:00Z";
const CUSTOMER_MARKUP_PERCENT = 30;

function text(value) {
  return String(value ?? "").trim();
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function round(value, digits = 10) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}
function findAudioBase64(value, depth = 0) {
  if (depth > 12 || !value || typeof value !== "object") return null;
  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) {
    return value.audio_base64.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioBase64(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const child of Object.values(value)) {
    const found = findAudioBase64(child, depth + 1);
    if (found) return found;
  }
  return null;
}
function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function requireApproval() {
  if (text(process.env.AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERT_APPROVED).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERT_APPROVED=YES_REQUIRED");
  }
}
function providerForCertification() {
  return {
    id: OWNED_PROVIDER,
    metadata: {
      configured_foundation_model: FOUNDATION_MODEL,
      foundation_models: [FOUNDATION_MODEL],
    },
  };
}

requireApproval();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ServiceExecutionRuntime } = await import(
  "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
);
const {
  acquireVoiceRunpodWebLease,
  releaseVoiceRunpodWebLease,
} = await import(
  "@/lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceRunpodLeaseRuntime"
);
const { ownedExecutionCertification } = await import(
  "@/lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy"
);
const { WalletRepository } = await import(
  "@/lib/platform/service-runtime/wallet/repositories/WalletRepository"
);

const organizationId = text(
  process.env.AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERT_ORGANIZATION_ID,
);
if (!organizationId) throw new Error(`${CONTRACT}_ORGANIZATION_ID_REQUIRED`);

async function fetchHistoricalTtsJob(providerJobId) {
  const key = required("RUNPOD_API_KEY", process.env.RUNPOD_MANAGEMENT_API_KEY);
  const response = await fetch(
    `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(TTS_ENDPOINT_ID)}/status/${encodeURIComponent(providerJobId)}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HISTORICAL_TTS_STATUS_HTTP_${response.status}`);
  }
  return body || {};
}

async function ensureProductionPricingCertified() {
  const pricingResult = await supabaseAdmin
    .from("provider_pricing")
    .select("*")
    .eq("provider", OWNED_PROVIDER)
    .eq("capability", CAPABILITY)
    .eq("model", FOUNDATION_MODEL)
    .order("created_at", { ascending: false });
  if (pricingResult.error) throw pricingResult.error;
  const rows = list(pricingResult.data);
  if (rows.length !== 1) {
    throw new Error(`${CONTRACT}_EXACT_TTS_PRICING_ROW_REQUIRED:${rows.length}`);
  }
  const before = rows[0];
  const currentCertification = ownedExecutionCertification({
    provider: providerForCertification(),
    capability: CAPABILITY,
    pricing: before,
  });
  if (currentCertification?.eligible === true) {
    return {
      pricing: before,
      certification: currentCertification,
      promotion_performed: false,
      economics: object(before?.metadata?.voice_cold_start_economics),
    };
  }

  const certResult = await supabaseAdmin
    .from("avantiqo_voice_owned_certification_runs")
    .select("id,contract,success,tts_endpoint_id,tts_endpoint_name,tts_lease_id,tts_provider_job_id,tts_status,tts_audio_bytes,tts_sample_rate,tts_language,workers_restored_0_0,external_provider_used,raw_audio_persisted,completed_at")
    .eq("success", true)
    .eq("tts_endpoint_id", TTS_ENDPOINT_ID)
    .eq("tts_endpoint_name", TTS_ENDPOINT_NAME)
    .eq("tts_status", "COMPLETED")
    .eq("workers_restored_0_0", true)
    .eq("external_provider_used", false)
    .eq("raw_audio_persisted", false)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (certResult.error) throw certResult.error;
  const proof = certResult.data;
  if (!proof?.id || !proof?.tts_lease_id || !text(proof?.tts_provider_job_id)) {
    throw new Error(`${CONTRACT}_OWNED_TTS_RUNTIME_PROOF_REQUIRED`);
  }

  const leaseResult = await supabaseAdmin
    .from("avantiqo_voice_runpod_leases")
    .select("id,contract,lane,endpoint_id,endpoint_name,state,acquired_at,released_at")
    .eq("id", proof.tts_lease_id)
    .maybeSingle();
  if (leaseResult.error) throw leaseResult.error;
  const proofLease = leaseResult.data;
  if (
    !proofLease ||
    text(proofLease.lane) !== LANE ||
    text(proofLease.endpoint_id) !== TTS_ENDPOINT_ID ||
    text(proofLease.endpoint_name) !== TTS_ENDPOINT_NAME ||
    text(proofLease.state).toUpperCase() !== "RELEASED" ||
    !proofLease.acquired_at ||
    !proofLease.released_at
  ) {
    throw new Error(`${CONTRACT}_OWNED_TTS_RELEASED_LEASE_PROOF_REQUIRED`);
  }

  const leaseSeconds = (Date.parse(proofLease.released_at) - Date.parse(proofLease.acquired_at)) / 1000;
  if (!(leaseSeconds > 0 && leaseSeconds <= 1800)) {
    throw new Error(`${CONTRACT}_OWNED_TTS_LEASE_DURATION_INVALID`);
  }

  const historical = await fetchHistoricalTtsJob(text(proof.tts_provider_job_id));
  if (text(historical?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`${CONTRACT}_HISTORICAL_TTS_JOB_NOT_COMPLETED`);
  }
  const historicalOutput = object(historical?.output);
  if (
    text(historicalOutput.provider) !== OWNED_PROVIDER ||
    text(historicalOutput.capability) !== CAPABILITY ||
    text(historicalOutput.foundation_model) !== FOUNDATION_MODEL
  ) {
    throw new Error(`${CONTRACT}_HISTORICAL_TTS_OUTPUT_IDENTITY_INVALID`);
  }
  const audioDurationSeconds = finite(historicalOutput?.audio_health?.duration_seconds, 0);
  const generationSeconds = finite(historicalOutput?.generation_seconds, 0);
  if (!(audioDurationSeconds > 0) || !(generationSeconds > 0)) {
    throw new Error(`${CONTRACT}_HISTORICAL_TTS_TIMING_EVIDENCE_REQUIRED`);
  }
  if (!text(historicalOutput.audio_base64)) {
    throw new Error(`${CONTRACT}_HISTORICAL_TTS_AUDIO_EVIDENCE_REQUIRED`);
  }

  const leaseCostUsd = (MAX_CONFIGURED_SERVERLESS_GPU_USD_PER_HOUR / 3600) * leaseSeconds;
  const audioMinutes = audioDurationSeconds / 60;
  const supplierCostUsdPerAudioMinute = leaseCostUsd / audioMinutes;
  const supplierCostThbPerAudioMinute = supplierCostUsdPerAudioMinute * USD_TO_THB;
  const customerPriceThbPerAudioMinute = supplierCostThbPerAudioMinute * (1 + CUSTOMER_MARKUP_PERCENT / 100);
  if (!(supplierCostThbPerAudioMinute > 0) || !(customerPriceThbPerAudioMinute > supplierCostThbPerAudioMinute)) {
    throw new Error(`${CONTRACT}_VOICE_ECONOMICS_INVALID`);
  }

  const calibratedAt = new Date().toISOString();
  const economics = {
    contract: ECONOMICS_CONTRACT,
    runtime_certification_run_id: proof.id,
    runtime_certification_contract: proof.contract,
    lease_id: proofLease.id,
    provider_job_id: proof.tts_provider_job_id,
    lease_seconds: round(leaseSeconds, 6),
    generation_seconds: round(generationSeconds, 6),
    audio_duration_seconds: round(audioDurationSeconds, 6),
    max_configured_serverless_gpu_usd_per_hour: MAX_CONFIGURED_SERVERLESS_GPU_USD_PER_HOUR,
    max_gpu_price_source: MAX_GPU_PRICE_SOURCE,
    max_gpu_price_observed_at: MAX_GPU_PRICE_OBSERVED_AT,
    usd_to_thb: USD_TO_THB,
    fx_source: FX_SOURCE,
    fx_observed_at: FX_OBSERVED_AT,
    supplier_cost_usd_per_audio_minute: round(supplierCostUsdPerAudioMinute, 10),
    supplier_cost_thb_per_audio_minute: round(supplierCostThbPerAudioMinute, 10),
    customer_price_thb_per_audio_minute: round(customerPriceThbPerAudioMinute, 10),
    markup_percent: CUSTOMER_MARKUP_PERCENT,
    cold_start_included: true,
    worst_configured_gpu_rate_used: true,
    external_provider_used: false,
    raw_audio_persisted: false,
    calibrated_at: calibratedAt,
  };

  const currentMetadata = object(before.metadata);
  const finalMetadata = {
    ...currentMetadata,
    pricing_status: "PRODUCTION_CERTIFIED",
    owned_inference: true,
    runtime_compatible: true,
    runtime_certified: true,
    benchmark_certified: true,
    economics_certified: true,
    model_license_verified: true,
    recalibration_required: false,
    production_routing_allowed: true,
    external_voice_fallback_allowed: false,
    owned_only_required: true,
    certified_capability: CAPABILITY,
    certified_model: FOUNDATION_MODEL,
    benchmark_contract: ECONOMICS_CONTRACT,
    benchmark_certification_run_id: proof.id,
    economics_contract: ECONOMICS_CONTRACT,
    economics_certified_at: calibratedAt,
    pricing_promotion_performed: true,
    pricing_promotion_applied_at: calibratedAt,
    customer_price_policy: "OWNED_COLD_START_WORST_CONFIGURED_GPU_PLUS_MARKUP",
    voice_cold_start_economics: economics,
  };

  const candidate = {
    ...before,
    active: true,
    unit: "minute",
    cost_per_unit: round(supplierCostThbPerAudioMinute, 10),
    markup_percent: CUSTOMER_MARKUP_PERCENT,
    metadata: finalMetadata,
  };
  const candidateCertification = ownedExecutionCertification({
    provider: providerForCertification(),
    capability: CAPABILITY,
    pricing: candidate,
  });
  if (candidateCertification?.eligible !== true) {
    throw new Error(`${CONTRACT}_VOICE_PRICING_CANDIDATE_NOT_CERTIFIED:${candidateCertification?.reason || "UNKNOWN"}`);
  }

  const updateResult = await supabaseAdmin
    .from("provider_pricing")
    .update({
      active: true,
      unit: "minute",
      cost_per_unit: round(supplierCostThbPerAudioMinute, 10),
      markup_percent: CUSTOMER_MARKUP_PERCENT,
      metadata: finalMetadata,
      updated_at: calibratedAt,
    })
    .eq("id", before.id)
    .select("*")
    .single();
  if (updateResult.error) throw updateResult.error;
  const updated = updateResult.data;
  const readbackCertification = ownedExecutionCertification({
    provider: providerForCertification(),
    capability: CAPABILITY,
    pricing: updated,
  });
  if (readbackCertification?.eligible !== true) {
    throw new Error(`${CONTRACT}_VOICE_PRICING_READBACK_NOT_CERTIFIED:${readbackCertification?.reason || "UNKNOWN"}`);
  }
  if (
    text(updated?.metadata?.economics_contract) !== ECONOMICS_CONTRACT ||
    updated?.metadata?.external_voice_fallback_allowed !== false ||
    updated?.metadata?.production_routing_allowed !== true
  ) {
    throw new Error(`${CONTRACT}_VOICE_PRICING_READBACK_INVALID`);
  }

  return {
    pricing: updated,
    certification: readbackCertification,
    promotion_performed: true,
    economics,
  };
}

const serviceResult = await supabaseAdmin
  .from("organization_services")
  .select("id,status,usage_enabled,default_provider_id,fallback_enabled")
  .eq("organization_id", organizationId)
  .eq("service_id", CAPABILITY)
  .maybeSingle();
if (serviceResult.error) throw serviceResult.error;
if (!serviceResult.data?.id) throw new Error(`${CONTRACT}_SERVICE_NOT_ENABLED`);
if (text(serviceResult.data.status).toUpperCase() !== "ACTIVE") {
  throw new Error(`${CONTRACT}_SERVICE_NOT_ACTIVE`);
}
if (serviceResult.data.usage_enabled === false) {
  throw new Error(`${CONTRACT}_SERVICE_USAGE_DISABLED`);
}
if (text(serviceResult.data.default_provider_id) !== OWNED_PROVIDER) {
  throw new Error(`${CONTRACT}_OWNED_DEFAULT_PROVIDER_REQUIRED`);
}
if (serviceResult.data.fallback_enabled !== false) {
  throw new Error(`${CONTRACT}_FALLBACK_MUST_BE_DISABLED`);
}

const walletBefore = await WalletRepository.getByOrganization(organizationId);
if (!walletBefore?.id) throw new Error(`${CONTRACT}_WALLET_REQUIRED`);
if (text(walletBefore.status).toUpperCase() !== "ACTIVE") {
  throw new Error(`${CONTRACT}_ACTIVE_WALLET_REQUIRED`);
}
if (finite(walletBefore.available_balance) <= 0) {
  throw new Error(`${CONTRACT}_FUNDED_WALLET_REQUIRED`);
}

const pricingCertification = await ensureProductionPricingCertified();

const providerPolicy = {
  allowed_providers: [OWNED_PROVIDER],
  preferred_providers: [OWNED_PROVIDER],
  owned_only_required: true,
  external_fallback_allowed: false,
};

let lease = null;
let execution = null;
let finalResult = null;
let cleanupComplete = false;
let providerJobId = null;
let usageId = null;

try {
  lease = await acquireVoiceRunpodWebLease({
    organizationId,
    lane: LANE,
    ttlSeconds: 900,
  });

  execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    service_id: CAPABILITY,
    provider_id: OWNED_PROVIDER,
    provider_policy: providerPolicy,
    category: "AI",
    input: {
      input: PHRASE,
      response_format: "wav",
      quantity: QUANTITY_MINUTES,
      language: "en",
      locale: "en",
      voice_profile: "avantiqo-secretary-v1",
      runpod_safe_lease: lease,
    },
    metadata: {
      certification_contract: CONTRACT,
      certification_scope: "PRODUCTION_SERVICE_RUNTIME_AND_WALLET",
      owned_provider_required: true,
      external_fallback_allowed: false,
      raw_audio_persisted: false,
      pricing_economics_contract: ECONOMICS_CONTRACT,
    },
  });

  if (text(execution?.provider) !== OWNED_PROVIDER) {
    throw new Error(`${CONTRACT}_EXTERNAL_PROVIDER_FORBIDDEN`);
  }
  usageId = text(execution?.usage?.id);
  providerJobId = text(execution?.provider_job_id);
  if (!usageId) throw new Error(`${CONTRACT}_USAGE_ID_REQUIRED`);

  finalResult = execution;
  for (let poll = 0; finalResult?.pending === true && poll < MAX_POLLS; poll += 1) {
    await sleep(POLL_MS);
    finalResult = await ServiceExecutionRuntime.settle({
      organization_id: organizationId,
      provider: OWNED_PROVIDER,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: execution?.pricing || {},
      quantity: QUANTITY_MINUTES,
      unit: execution?.pricing?.unit || "minute",
      metadata: {
        certification_contract: CONTRACT,
        certification_scope: "PRODUCTION_SERVICE_RUNTIME_AND_WALLET",
        owned_provider_required: true,
        external_fallback_allowed: false,
        raw_audio_persisted: false,
        pricing_economics_contract: ECONOMICS_CONTRACT,
      },
      provider_status_input: { capability: CAPABILITY },
      credential_id: execution?.credential_id || null,
      started_at: execution?.started_at || null,
    });
  }

  if (finalResult?.pending === true) {
    throw new Error(`${CONTRACT}_PROVIDER_SETTLEMENT_TIMEOUT`);
  }
  if (finalResult?.success !== true || finalResult?.failed === true) {
    throw new Error(`${CONTRACT}_SERVICE_EXECUTION_FAILED`);
  }
  if (text(finalResult?.provider || execution?.provider) !== OWNED_PROVIDER) {
    throw new Error(`${CONTRACT}_SETTLED_PROVIDER_INVALID`);
  }
  const audioBase64 = findAudioBase64(finalResult);
  if (!audioBase64 || Buffer.from(audioBase64, "base64").length <= 1000) {
    throw new Error(`${CONTRACT}_AUDIO_PROOF_REQUIRED`);
  }

  await releaseVoiceRunpodWebLease({
    leaseId: lease.lease_id,
    ownerRequestId: lease.owner_request_id,
    lane: lease.lane,
    endpointId: lease.endpoint_id,
    providerJobId,
    finalState: "RELEASED",
    reason: "VOICE_SERVICE_RUNTIME_CERTIFICATION_COMPLETED",
  });
  cleanupComplete = true;

  const usageResult = await supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .eq("id", usageId)
    .maybeSingle();
  if (usageResult.error) throw usageResult.error;
  const usage = usageResult.data;
  if (!usage) throw new Error(`${CONTRACT}_USAGE_ROW_REQUIRED`);
  if (text(usage.provider) !== OWNED_PROVIDER) {
    throw new Error(`${CONTRACT}_USAGE_PROVIDER_INVALID`);
  }
  if (text(usage.capability) !== CAPABILITY) {
    throw new Error(`${CONTRACT}_USAGE_CAPABILITY_INVALID`);
  }
  if (text(usage.status).toUpperCase() !== "SUCCESS") {
    throw new Error(`${CONTRACT}_USAGE_SUCCESS_REQUIRED:${text(usage.status)}`);
  }
  const chargedAmount = finite(usage.customer_price);
  if (chargedAmount <= 0) {
    throw new Error(`${CONTRACT}_POSITIVE_CUSTOMER_PRICE_REQUIRED`);
  }

  const txResult = await supabaseAdmin
    .from("wallet_transactions")
    .select("id,type,amount,currency,provider,usage_id,created_at")
    .eq("organization_id", organizationId)
    .eq("provider", OWNED_PROVIDER)
    .eq("usage_id", usageId)
    .eq("type", "CHARGE");
  if (txResult.error) throw txResult.error;
  const charges = list(txResult.data);
  if (charges.length !== 1) {
    throw new Error(`${CONTRACT}_EXACTLY_ONE_WALLET_CHARGE_REQUIRED:${charges.length}`);
  }
  if (Math.abs(finite(charges[0].amount) - chargedAmount) > 0.000001) {
    throw new Error(`${CONTRACT}_WALLET_CHARGE_MISMATCH`);
  }

  const walletAfter = await WalletRepository.getByOrganization(organizationId);
  if (!walletAfter?.id) throw new Error(`${CONTRACT}_WALLET_AFTER_REQUIRED`);

  const report = {
    success: true,
    contract: CONTRACT,
    provider: OWNED_PROVIDER,
    capability: CAPABILITY,
    production_service_runtime_proven: true,
    wallet_settlement_verified: true,
    pricing_production_certified: true,
    pricing_promotion_performed: pricingCertification.promotion_performed,
    pricing_economics_contract: ECONOMICS_CONTRACT,
    pricing_economics: pricingCertification.economics,
    external_fallback_allowed: false,
    external_provider_used: false,
    workers_restored_0_0: true,
    raw_audio_persisted: false,
    usage_id: usageId,
    provider_job_id: providerJobId || null,
    usage_status: usage.status,
    usage_unit: usage.unit,
    usage_quantity: usage.quantity,
    customer_price: chargedAmount,
    wallet_charge_count: charges.length,
    wallet_balance_delta: Number(
      (finite(walletBefore.available_balance) - finite(walletAfter.available_balance)).toFixed(6),
    ),
    audio_bytes: Buffer.from(audioBase64, "base64").length,
    production_deploy_performed: false,
    secrets_printed: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=GREEN`);
} catch (error) {
  if (lease && !cleanupComplete) {
    await releaseVoiceRunpodWebLease({
      leaseId: lease.lease_id,
      ownerRequestId: lease.owner_request_id,
      lane: lease.lane,
      endpointId: lease.endpoint_id,
      providerJobId,
      finalState: "FAILED",
      reason: text(error?.message) || "VOICE_SERVICE_RUNTIME_CERTIFICATION_FAILED",
      cancelExactJob: Boolean(providerJobId),
    }).then(() => {
      cleanupComplete = true;
    }).catch(() => null);
  }
  const report = {
    success: false,
    contract: CONTRACT,
    provider: OWNED_PROVIDER,
    capability: CAPABILITY,
    production_service_runtime_proven: false,
    wallet_settlement_verified: false,
    pricing_production_certified: pricingCertification?.certification?.eligible === true,
    pricing_promotion_performed: pricingCertification?.promotion_performed === true,
    pricing_economics_contract: ECONOMICS_CONTRACT,
    external_fallback_allowed: false,
    external_provider_used: false,
    workers_restored_0_0: cleanupComplete,
    raw_audio_persisted: false,
    usage_id: usageId || null,
    provider_job_id: providerJobId || null,
    error_code: text(error?.message).slice(0, 300) || "UNKNOWN",
    production_deploy_performed: false,
    secrets_printed: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(JSON.stringify(report, null, 2));
  throw error;
}
