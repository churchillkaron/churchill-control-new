export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeOutcomeLearningRuntime,
} from "@/lib/creative/learning/runtime/CreativeOutcomeLearningRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
    );
    const creativeProjectId = text(
      url.searchParams.get("creative_project_id") ||
      url.searchParams.get("creativeProjectId") ||
      url.searchParams.get("project_id"),
    );
    const brandId = text(
      url.searchParams.get("brand_id") ||
      url.searchParams.get("brandId"),
    );
    const campaignId = text(
      url.searchParams.get("campaign_id") ||
      url.searchParams.get("campaignId"),
    );

    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
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
    if (!access.success) {
      return Response.json(access, { status: access.status || 403 });
    }

    const learning = await CreativeOutcomeLearningRuntime.resolve({
      organization_id: access.organizationId,
      creative_project_id: creativeProjectId || null,
      brand_id: brandId || null,
      campaign_id: campaignId || null,
      limit: 100,
    });

    return Response.json({
      success: true,
      ...learning,
      observation_ingestion: "SERVER_RUNTIME_ONLY",
      quality_floor_immutable: true,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
