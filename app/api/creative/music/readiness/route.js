export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);

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
    entry.capability === capability && entry.provider === "avantiqo-audio"
  ));
  return {
    capability,
    ready: row?.active === true && row?.metadata?.production_routing_allowed !== false,
    provider: "avantiqo-audio",
    status: row?.active === true ? "ACTIVE" : "CERTIFICATION_GATED",
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
      entry.provider !== "avantiqo-audio" &&
      entry.active === true
    ));

    return NextResponse.json({
      success: true,
      owner: "AVANTIQO",
      policy: "OWNED_ONLY",
      capabilities: {
        compose: music,
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
