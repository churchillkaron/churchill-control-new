export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration";
import { AvantiqoMusicLocalNodeProvider } from "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicLocalNodeProvider.js";
import { buildMusicPreUiAcceptance } from "@/lib/creative/music/runtime/CreativeMusicPreUiAcceptanceRuntime.js";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);

const MUSIC_RUNTIME_CONTRACT = Object.freeze({
  provider: "avantiqo-audio",
  foundation_model: "ACE-Step/Ace-Step1.5",
  model_variant: "acestep-v15-xl-turbo",
  quality_profile: "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1",
  ace_step_lm_model: "acestep-5Hz-lm-1.7B",
  ace_step_lm_backend: "vllm",
});

function text(value) {
  return String(value ?? "").trim();
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

  const checks = {
    engine_enabled: configuration.enabled === true,
    modal_configured: configuration.modal_configured === true,
    modal_token_id_configured: configuration.modal_token_id_configured === true,
    modal_token_secret_configured: configuration.modal_token_secret_configured === true,
    foundation_model_configured: configuration.foundation_model_configured === true,
    model_variant_configured: configuration.model_variant_configured === true,
    lm_enabled: configuration.lm_enabled === true,
    lm_model_configured: configuration.lm_model_configured === true,
    lm_backend_configured: configuration.lm_backend_configured === true,
    music_capability_configured: certifiedCapabilities.includes("ai.music.generate"),
  };

  const modalRuntimeReady = configuration.primary_audio_runtime_available === true && Object.values(checks).every(Boolean);
  const localNodeRuntimeReady = await AvantiqoMusicLocalNodeProvider.available("ai.music.generate");
  const primaryAudioRuntimeAvailable = modalRuntimeReady || localNodeRuntimeReady;

  return {
    ready: primaryAudioRuntimeAvailable,
    primary_audio_runtime_available: primaryAudioRuntimeAvailable,
    local_node_runtime_available: localNodeRuntimeReady,
    modal_runtime_available: modalRuntimeReady,
    preferred_execution_surface: localNodeRuntimeReady ? "AVANTIQO_LOCAL_NODE_V1" : (modalRuntimeReady ? "MODAL_DIRECT_A10G_ASYNC_V1" : null),
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
    const providerSeparatorRuntime = PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider]?.metadata?.separator_runtime || {};
    const separatorRuntimeReady = providerSeparatorRuntime.production_routing_allowed === true;
    const stemsReady = stems.ready === true && separatorRuntimeReady;
    const providerElasticRuntime = PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider]?.metadata?.elastic_audio_runtime || {};
    const elasticRuntimeReady = providerElasticRuntime.production_routing_allowed === true;
    const elasticReady = elastic.ready === true && elasticRuntimeReady;
    const providerVocalCorrectionRuntime = PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider]?.metadata?.vocal_correction_runtime || {};
    const vocalCorrectionRuntimeReady = providerVocalCorrectionRuntime.production_routing_allowed === true;
    const vocalCorrectionReady = vocalCorrection.ready === true && vocalCorrectionRuntimeReady;
    const providerSfxRuntime = PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider]?.metadata?.sfx_runtime || {};
    const sfxRuntimeReady = providerSfxRuntime.production_routing_allowed === true;
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
          runtime_ready: runtimeHealth.primary_audio_runtime_available === true,
          certification_ready: music.ready === true,
        },
        remix: { ...remix, status: remix.ready ? "CERTIFIED" : "BENCHMARK_REQUIRED" },
        edit: { ...edit, status: edit.ready ? "CERTIFIED" : "BENCHMARK_REQUIRED" },
        extend: { ...extend, status: extend.ready ? "CERTIFIED" : "BENCHMARK_REQUIRED" },
        stems: { ...stems, ready: stemsReady, status: stemsReady ? "CERTIFIED" : (separatorRuntimeReady ? "BENCHMARK_AND_HUMAN_REVIEW_REQUIRED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED"), runtime_ready: separatorRuntimeReady, certification_ready: stems.ready === true, runtime_status: text(providerSeparatorRuntime.runtime_status) || null, model: text(providerSeparatorRuntime.model) || null, quality_profile: text(providerSeparatorRuntime.quality_profile) || null },
        elastic: {
          ...elastic,
          ready: elasticReady,
          status: elasticReady ? "CERTIFIED" : (elasticRuntimeReady ? "COMMERCIAL_ACTIVATION_REQUIRED" : "CURRENT_RUNTIME_CERTIFICATION_REQUIRED"),
          runtime_ready: elasticRuntimeReady,
          database_certification_ready: elastic.ready === true,
          stale_database_certification_ignored: elastic.ready === true && !elasticRuntimeReady,
          runtime_status: text(providerElasticRuntime.runtime_status) || null,
          model: text(providerElasticRuntime.model) || null,
          quality_profile: text(providerElasticRuntime.quality_profile) || null,
        },
        vocal_correction: {
          ...vocalCorrection,
          ready: vocalCorrectionReady,
          status: vocalCorrectionReady ? "CERTIFIED" : (vocalCorrectionRuntimeReady ? "COMMERCIAL_ACTIVATION_REQUIRED" : "CURRENT_RUNTIME_CERTIFICATION_REQUIRED"),
          runtime_ready: vocalCorrectionRuntimeReady,
          database_certification_ready: vocalCorrection.ready === true,
          stale_database_certification_ignored: vocalCorrection.ready === true && !vocalCorrectionRuntimeReady,
          runtime_status: text(providerVocalCorrectionRuntime.runtime_status) || null,
          model: text(providerVocalCorrectionRuntime.model) || null,
          quality_profile: text(providerVocalCorrectionRuntime.quality_profile) || null,
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
          runtime_status: text(providerSfxRuntime.runtime_status) || null,
          foundation_model: text(providerSfxRuntime.foundation_model) || null,
          quality_profile: text(providerSfxRuntime.quality_profile) || null,
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
