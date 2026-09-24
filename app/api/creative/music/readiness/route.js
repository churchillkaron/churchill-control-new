export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration";
import { AvantiqoMusicGenerationLocalQueueProvider } from "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicGenerationLocalQueueProvider.js";
import { AvantiqoSfxLocalQueueProvider } from "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js";
import { AvantiqoMusicSeparatorLocalQueueProvider } from "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js";
import { AvantiqoMusicElasticLocalQueueProvider } from "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticLocalQueueProvider.js";
import { AvantiqoMusicVocalCorrectionLocalQueueProvider } from "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js";
import { buildMusicPreUiAcceptance } from "@/lib/creative/music/runtime/CreativeMusicPreUiAcceptanceRuntime.js";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);

const MUSIC_RUNTIME_CONTRACT = Object.freeze({
  provider: "avantiqo-audio",
  foundation_model: "ACE-Step/Ace-Step1.5",
  generation_runtime: "ACE_STEP_1_5_CPU_FLOAT32_LOCAL_V1",
  generation_resource: "LOCAL_CPU_FLOAT32",
});

function text(value) {
  return String(value ?? "").trim();
}
function flagEnabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
  return access;
}

function ownedCapability(rows, capability) {
  const row = rows.find((entry) => (
    entry.capability === capability && entry.provider === MUSIC_RUNTIME_CONTRACT.provider
  ));
  return {
    capability,
    ready: row?.active === true && row?.metadata?.production_routing_allowed === true,
    provider: MUSIC_RUNTIME_CONTRACT.provider,
    status: row?.active === true ? "ACTIVE" : "CERTIFICATION_GATED",
    pricing_status: text(row?.metadata?.pricing_status) || null,
    benchmark_certified: row?.metadata?.benchmark_certified === true,
    economics_certified: row?.metadata?.economics_certified === true,
    human_quality_certified: row?.metadata?.human_quality_certified === true,
    production_routing_allowed: row?.metadata?.production_routing_allowed === true,
  };
}

async function musicRuntimeHealth() {
  const provider = PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider] || {};
  const configuration = provider?.metadata?.runtime_configuration || {};
  const certifiedCapabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];

  const [music, sfx, stems, elastic, vocalCorrection] = await Promise.all([
    AvantiqoMusicGenerationLocalQueueProvider.available(),
    AvantiqoSfxLocalQueueProvider.available(),
    AvantiqoMusicSeparatorLocalQueueProvider.available(),
    AvantiqoMusicElasticLocalQueueProvider.available(),
    AvantiqoMusicVocalCorrectionLocalQueueProvider.available(),
  ]);

  const checks = {
    engine_enabled: configuration.enabled === true,
    local_compute_configured: configuration.local_compute_configured === true,
    local_only: configuration.local_only === true,
    music_capability_configured: certifiedCapabilities.includes("ai.music.generate"),
  };
  const capabilityRuntimeAvailable = {
    music,
    sfx,
    stems,
    elastic,
    vocal_correction: vocalCorrection,
  };
  const primaryAudioRuntimeAvailable = music === true && Object.values(checks).every(Boolean);

  return {
    ready: primaryAudioRuntimeAvailable,
    primary_audio_runtime_available: primaryAudioRuntimeAvailable,
    local_node_runtime_available: music === true,
    capability_runtime_available: capabilityRuntimeAvailable,
    preferred_execution_surface: music === true ? "AVANTIQO_LOCAL_NODE_V1" : null,
    checks,
    contract: MUSIC_RUNTIME_CONTRACT,
    secrets_exposed: false,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }

    await requireAccess(request, organizationId);

    const supabase = getServiceSupabase();
    const [{ data: pricing, error: pricingError }, { data: services, error: serviceError }] = await Promise.all([
      supabase
        .from("provider_pricing")
        .select("provider,capability,active,metadata")
        .in("capability", ["ai.music.generate", "ai.audio.remix", "ai.audio.edit", "ai.audio.extend", "ai.audio.stems", "ai.audio.elastic-warp", "ai.audio.vocal-correct", "ai.sfx.generate"]),
      supabase
        .from("organization_services")
        .select("service_id,status,fallback_enabled,configuration")
        .eq("organization_id", organizationId)
        .in("service_id", ["ai.music.generate", "ai.audio.remix", "ai.audio.edit", "ai.audio.extend", "ai.audio.stems", "ai.audio.elastic-warp", "ai.audio.vocal-correct", "ai.sfx.generate"]),
    ]);

    if (pricingError) throw pricingError;
    if (serviceError) throw serviceError;

    const rows = Array.isArray(pricing) ? pricing : [];
    const organizationServices = Array.isArray(services) ? services : [];
    const music = ownedCapability(rows, "ai.music.generate");
    const localMusicBenchmark = rows.find((entry) => (
      entry.capability === "ai.music.generate" &&
      entry.provider === MUSIC_RUNTIME_CONTRACT.provider &&
      entry.active !== true &&
      entry.metadata?.local_node_live_acceptance === true &&
      entry.metadata?.benchmark_review_preview_allowed === true &&
      entry.metadata?.production_routing_allowed !== true
    )) || null;
    const remix = ownedCapability(rows, "ai.audio.remix");
    const edit = ownedCapability(rows, "ai.audio.edit");
    const extend = ownedCapability(rows, "ai.audio.extend");
    const stems = ownedCapability(rows, "ai.audio.stems");
    const elastic = ownedCapability(rows, "ai.audio.elastic-warp");
    const vocalCorrection = ownedCapability(rows, "ai.audio.vocal-correct");
    const sfx = ownedCapability(rows, "ai.sfx.generate");
    const sfxService = organizationServices.find((entry) => entry.service_id === "ai.sfx.generate") || null;
    const externalSfxActive = rows.some((entry) => (
      entry.capability === "ai.sfx.generate" &&
      entry.provider !== MUSIC_RUNTIME_CONTRACT.provider &&
      entry.active === true
    ));
    const runtimeHealth = await musicRuntimeHealth();
    const separatorRuntimeReady = runtimeHealth.capability_runtime_available?.stems === true
      && flagEnabled(process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED);
    const stemsReady = stems.ready === true && separatorRuntimeReady;
    const elasticRuntimeReady = runtimeHealth.capability_runtime_available?.elastic === true;
    const elasticReady = elastic.ready === true && elasticRuntimeReady;
    const vocalCorrectionRuntimeReady = runtimeHealth.capability_runtime_available?.vocal_correction === true
      && flagEnabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED);
    const vocalCorrectionReady = vocalCorrection.ready === true && vocalCorrectionRuntimeReady;
    const sfxRuntimeReady = runtimeHealth.capability_runtime_available?.sfx === true;
    const sfxReady = sfx.ready === true && sfxRuntimeReady;
    const preUiAcceptance = buildMusicPreUiAcceptance({
      provider: PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider] || {},
      capabilities: { music, remix, edit, extend, stems, elastic, vocalCorrection, sfx },
      defer_singing_identity: true,
    });

    return NextResponse.json({
      success: true,
      owner: "AVANTIQO",
      policy: "OWNED_ONLY",
      runtime: runtimeHealth,
      pre_ui_acceptance: preUiAcceptance,
      capabilities: {
        compose: {
          ...music,
          ready: music.ready === true && runtimeHealth.primary_audio_runtime_available === true,
          live_acceptance_ready: process.env.NODE_ENV !== "production" && runtimeHealth.local_node_runtime_available === true && Boolean(localMusicBenchmark),
          live_acceptance_only: process.env.NODE_ENV !== "production" && runtimeHealth.local_node_runtime_available === true && Boolean(localMusicBenchmark) && music.ready !== true,
          runtime_ready: runtimeHealth.primary_audio_runtime_available === true,
          certification_ready: music.ready === true,
          status: music.ready === true ? "ACTIVE" : (process.env.NODE_ENV !== "production" && runtimeHealth.local_node_runtime_available === true && Boolean(localMusicBenchmark) ? "LOCAL_ACCEPTANCE_READY" : music.status),
        },
        remix: { ...remix, status: remix.ready ? "CERTIFIED" : "BENCHMARK_REQUIRED" },
        edit: { ...edit, status: edit.ready ? "CERTIFIED" : "BENCHMARK_REQUIRED" },
        extend: { ...extend, status: extend.ready ? "CERTIFIED" : "BENCHMARK_REQUIRED" },
        stems: { ...stems, ready: stemsReady, status: stemsReady ? "CERTIFIED" : (separatorRuntimeReady ? "BENCHMARK_AND_HUMAN_REVIEW_REQUIRED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED"), runtime_ready: separatorRuntimeReady, certification_ready: stems.ready === true, runtime_status: separatorRuntimeReady ? "LOCAL_CERTIFIED_RUNTIME_AVAILABLE" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED", model: "demucs-htdemucs-ft", quality_profile: "DEMUCS_HTDEMUCS_FT_4STEM_V1" },
        elastic: {
          ...elastic,
          ready: elasticReady,
          status: elasticReady ? "CERTIFIED" : (elasticRuntimeReady ? "COMMERCIAL_ACTIVATION_REQUIRED" : "CURRENT_RUNTIME_CERTIFICATION_REQUIRED"),
          runtime_ready: elasticRuntimeReady,
          database_certification_ready: elastic.ready === true,
          stale_database_certification_ignored: elastic.ready === true && !elasticRuntimeReady,
          runtime_status: elasticRuntimeReady ? "LOCAL_RUNTIME_AVAILABLE" : "LOCAL_RUNTIME_UNAVAILABLE",
          model: "signalsmith-stretch",
          quality_profile: "SIGNALSMITH_STRETCH_APPROVED_WARP_V1",
        },
        vocal_correction: {
          ...vocalCorrection,
          ready: vocalCorrectionReady,
          status: vocalCorrectionReady ? "CERTIFIED" : (vocalCorrectionRuntimeReady ? "COMMERCIAL_ACTIVATION_REQUIRED" : "CURRENT_RUNTIME_CERTIFICATION_REQUIRED"),
          runtime_ready: vocalCorrectionRuntimeReady,
          database_certification_ready: vocalCorrection.ready === true,
          stale_database_certification_ignored: vocalCorrection.ready === true && !vocalCorrectionRuntimeReady,
          runtime_status: vocalCorrectionRuntimeReady ? "LOCAL_CERTIFIED_RUNTIME_AVAILABLE" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED",
          model: "torchcrepe-full",
          quality_profile: "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2",
        },
        sfx: {
          ...sfx,
          ready: sfxReady,
          status: sfxReady
            ? "CERTIFIED"
            : (sfxRuntimeReady
              ? (sfx.benchmark_certified === true ? "COMMERCIAL_ACTIVATION_REQUIRED" : "BENCHMARK_REQUIRED")
              : "CERTIFICATION_OR_CONFIGURATION_REQUIRED"),
          runtime_ready: sfxRuntimeReady,
          certification_ready: sfx.ready === true,
          runtime_status: sfxRuntimeReady ? "LOCAL_RUNTIME_AVAILABLE" : "LOCAL_RUNTIME_UNAVAILABLE",
          foundation_model: "OpenMOSS-Team/MOSS-SoundEffect-v2.0",
          quality_profile: "OPENMOSS_SFX_LOCAL_CPU_V1",
          external_fallback_enabled: sfxService?.fallback_enabled === true,
          external_provider_active: externalSfxActive,
        },
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Creative Music readiness check failed",
    }, { status: error?.status || 500 });
  }
}
