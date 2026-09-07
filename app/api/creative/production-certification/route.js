export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CreativeEndToEndFilmCertificationRuntime } from "@/lib/creative/certification/runtime/CreativeEndToEndFilmCertificationRuntime";
import { CreativeWorldClassBenchmarkRuntime } from "@/lib/creative/certification/runtime/CreativeWorldClassBenchmarkRuntime";
import { CreativeStudioProductionReadinessRuntime } from "@/lib/creative/certification/runtime/CreativeStudioProductionReadinessRuntime";

function text(value) {
  return String(value ?? "").trim();
}

async function scope(request, body = null) {
  const url = new URL(request.url);
  const organizationId = text(
    body?.organization_id ||
    body?.organizationId ||
    url.searchParams.get("organization_id") ||
    url.searchParams.get("organizationId"),
  );
  const creativeProjectId = text(
    body?.creative_project_id ||
    body?.creativeProjectId ||
    body?.project_id ||
    url.searchParams.get("creative_project_id") ||
    url.searchParams.get("creativeProjectId") ||
    url.searchParams.get("project_id"),
  );
  const profile = text(
    body?.profile || url.searchParams.get("profile"),
  ) || null;
  if (!organizationId || !creativeProjectId) {
    return { error: "organization_id and creative_project_id required", status: 400 };
  }
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: [
      "creative.*",
      "creative.execute",
      "creative.production.run",
      "creative.release.approve",
    ],
  });
  if (!access.success) return { error: access, status: access.status || 403 };
  return {
    organization_id: access.organizationId,
    creative_project_id: creativeProjectId,
    profile,
  };
}

export async function GET(request) {
  try {
    const resolved = await scope(request);
    if (resolved.error) {
      return Response.json(
        typeof resolved.error === "string" ? { success: false, error: resolved.error } : resolved.error,
        { status: resolved.status },
      );
    }
    const [film, benchmark, readiness] = await Promise.all([
      CreativeEndToEndFilmCertificationRuntime.inspect({
        organization_id: resolved.organization_id,
        creative_project_id: resolved.creative_project_id,
        profile: resolved.profile,
      }),
      CreativeWorldClassBenchmarkRuntime.inspect({
        organization_id: resolved.organization_id,
        creative_project_id: resolved.creative_project_id,
      }),
      CreativeStudioProductionReadinessRuntime.inspect({
        organization_id: resolved.organization_id,
        creative_project_id: resolved.creative_project_id,
        certification_profile: resolved.profile,
      }),
    ]);
    return Response.json({
      success: true,
      film_certification: film,
      world_class_benchmark: benchmark,
      production_readiness: readiness,
      production_deployment_authorized: false,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await scope(request, body);
    if (resolved.error) {
      return Response.json(
        typeof resolved.error === "string" ? { success: false, error: resolved.error } : resolved.error,
        { status: resolved.status },
      );
    }
    const film = await CreativeEndToEndFilmCertificationRuntime.certify({
      organization_id: resolved.organization_id,
      creative_project_id: resolved.creative_project_id,
      profile: resolved.profile,
    });
    const readiness = await CreativeStudioProductionReadinessRuntime.inspect({
      organization_id: resolved.organization_id,
      creative_project_id: resolved.creative_project_id,
      certification_profile: resolved.profile,
    });
    return Response.json({
      success: true,
      film_certification: film,
      production_readiness: readiness,
      production_deployment_authorized: false,
      explicit_deployment_approval_still_required: true,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
