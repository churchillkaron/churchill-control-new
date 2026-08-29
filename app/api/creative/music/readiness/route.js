export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration";

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

function musicRuntimeHealth() {
  const provider = PROVIDER_REGISTRY[MUSIC_RUNTIME_CONTRACT.provider] || {};
  const configuration = provider?.metadata?.runtime_configuration || {};
  const certifiedCapabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];

  const checks = {
    engine_enabled: configuration.enabled === true,
    endpoint_configured: configuration.runpod_endpoint_configured === true,
    api_key_configured: configuration.runpod_api_key_configured === true,
    management_api_key_configured: Boolean(text(process.env.RUNPOD_MANAGEMENT_API_KEY)),
    foundation_model_configured: configuration.foundation_model_configured === true,
    model_variant_configured: configuration.model_variant_configured === true,
    lm_enabled: configuration.lm_enabled === true,
    lm_model_configured: configuration.lm_model_configured === true,
    lm_backend_configured: configuration.lm_backend_configured === true,
    music_capability_configured: certifiedCapabilities.includes("ai.music.generate"),
  };

  return {
    ready: configuration.primary_audio_runtime_available === true &&
      checks.management_api_key_configured === true &&
      Object.values(checks).every(Boolean),
    primary_audio_runtime_available: configuration.primary_audio_runtime_available === true,
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
        .in("capability", ["ai.music.generate", "ai.sfx.generate"]),
      supabase
        .from("organization_services")
        .select("service_id,status,fallback_enabled,configuration")
        .eq("organization_id", organizationId)
        .in("service_id", ["ai.music.generate", "ai.sfx.generate"]),
    ]);

    if (pricingError) throw pricingError;
    if (serviceError) throw serviceError;

    const rows = Array.isArray(pricing) ? pricing : [];
    const organizationServices = Array.isArray(services) ? services : [];
    const music = ownedCapability(rows, "ai.music.generate");
    const sfx = ownedCapability(rows, "ai.sfx.generate");
    const sfxService = organizationServices.find((entry) => entry.service_id === "ai.sfx.generate") || null;
    const externalSfxActive = rows.some((entry) => (
      entry.capability === "ai.sfx.generate" &&
      entry.provider !== MUSIC_RUNTIME_CONTRACT.provider &&
      entry.active === true
    ));
    const runtimeHealth = musicRuntimeHealth();

    return NextResponse.json({
      success: true,
      owner: "AVANTIQO",
      policy: "OWNED_ONLY",
      runtime: runtimeHealth,
      capabilities: {
        compose: {
          ...music,
          ready: music.ready === true && runtimeHealth.primary_audio_runtime_available === true,
          runtime_ready: runtimeHealth.primary_audio_runtime_available === true,
          certification_ready: music.ready === true,
        },
        remix: { capability: "ai.audio.remix", ready: false, status: "PLANNING_ONLY" },
        edit: { capability: "ai.audio.edit", ready: false, status: "PLANNING_ONLY" },
        extend: { capability: "ai.audio.extend", ready: false, status: "PLANNING_ONLY" },
        sfx: {
          ...sfx,
          ready: false,
          status: "OWNED_RUNTIME_NOT_IMPLEMENTED",
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
