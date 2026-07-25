export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeTimelineRuntime,
} from "@/lib/creative/timeline/runtime/CreativeTimelineRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId = body.creative_project_id || body.creativeProjectId;

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        { success: false, error: "organization_id and creative_project_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) return Response.json(access, { status: access.status });

    const result = await CreativeTimelineRuntime.compose({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      requirements: Array.isArray(body.requirements) ? body.requirements : [],
      options: {
        name: body.options?.name || null,
        description: body.options?.description || null,
        minimum_score: body.options?.minimum_score ?? body.options?.minimumScore ?? null,
        maximum_duration_seconds:
          body.options?.maximum_duration_seconds ??
          body.options?.maximumDurationSeconds ??
          null,
        maximum_clips:
          body.options?.maximum_clips ??
          body.options?.maximumClips ??
          null,
        allow_fallback:
          body.options?.allow_fallback ??
          body.options?.allowFallback ??
          true,
        tags: Array.isArray(body.options?.tags) ? body.options.tags : [],
        version: body.options?.version || null,
      },
      force: body.force === true,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
