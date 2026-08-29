import { writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERTIFICATION_V1";
const OWNED_PROVIDER = "avantiqo-voice";
const CAPABILITY = "ai.text.to.speech";
const LANE = "voice-tts";
const OUTPUT = resolve(
  process.env.AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERT_OUTPUT ||
    "/tmp/avantiqo-voice-production-service-runtime-certification.json",
);
const PHRASE = "Avantiqo Secretary voice service runtime certification.";
const QUANTITY_MINUTES = 0.05;
const POLL_MS = 3000;
const MAX_POLLS = 120;

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
const { WalletRepository } = await import(
  "@/lib/platform/service-runtime/wallet/repositories/WalletRepository"
);

const organizationId = text(
  process.env.AVANTIQO_VOICE_PRODUCTION_SERVICE_RUNTIME_CERT_ORGANIZATION_ID,
);
if (!organizationId) throw new Error(`${CONTRACT}_ORGANIZATION_ID_REQUIRED`);

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
    }).catch(() => null);
  }
  const report = {
    success: false,
    contract: CONTRACT,
    provider: OWNED_PROVIDER,
    capability: CAPABILITY,
    production_service_runtime_proven: false,
    wallet_settlement_verified: false,
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
