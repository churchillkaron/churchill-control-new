import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { AvantiqoImageProvider } from "@/lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider";

export const runtime = "nodejs";
export const maxDuration = 120;
const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function contextFrom(body = {}, organizationId) {
  return {
    organization_id: organizationId,
    usage_id: text(body.usage_id || body.usageId, 240) || `code-image-${Date.now()}`,
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    const capability = text(body.capability, 120).toLowerCase() || "ai.image.generate";
    const prompt = text(body.prompt, 5000);
    if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!["ai.image.generate", "ai.image.upscale", "ai.image.analyze"].includes(capability)) return Response.json({ success: false, error: "unsupported image capability" }, { status: 400 });
    if (capability === "ai.image.generate" && !prompt) return Response.json({ success: false, error: "prompt required" }, { status: 400 });
    if (capability === "ai.image.upscale" && !text(body.source_image || body.sourceImage, 5000)) return Response.json({ success: false, error: "source_image required" }, { status: 400 });
    if (capability === "ai.image.analyze" && !text(body.image_url || body.imageUrl || body.source_image || body.sourceImage, 5000)) return Response.json({ success: false, error: "image_url required" }, { status: 400 });

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });

    const result = await AvantiqoImageProvider.execute({
      capability,
      ...(capability === "ai.image.generate" ? {
        prompt,
        width: Number(body.width) || 768,
        height: Number(body.height) || 768,
        steps: Number(body.steps) || 8,
        cfg_scale: Number(body.cfg_scale ?? 1.0),
        seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : -1,
      } : capability === "ai.image.analyze" ? {
        image_url: text(body.image_url || body.imageUrl || body.source_image || body.sourceImage, 5000),
        instructions: text(body.instructions || body.instructions_text, 5000),
      } : {
        source_image: text(body.source_image || body.sourceImage, 5000),
      }),
      context: contextFrom(body, organizationId),
      metadata: {
        module: "CODE_STUDIO",
        operation: capability === "ai.image.analyze" ? "REVIEW_DISCUSSION_VISUAL" : "GENERATE_DISCUSSION_VISUAL",
        repository_url: text(body.repository_url, 1000) || null,
        device_session_id: text(body.device_session_id, 240) || null,
        project_visual_only: true,
        mutation_authority: false,
      },
    });

    return Response.json({
      ...result,
      commit_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: text(error?.message || error, 1000) || "CODE_AI_IMAGE_GENERATE_FAILED",
      commit_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"), 200);
    const providerJobId = text(url.searchParams.get("jobId") || url.searchParams.get("provider_job_id"), 500);
    if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!providerJobId) return Response.json({ success: false, error: "job_id required" }, { status: 400 });

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });

    const result = await AvantiqoImageProvider.cancel({
      provider_job_id: providerJobId,
      context: { organization_id: organizationId },
    });
    return Response.json({
      success: true,
      ...result,
      commit_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: text(error?.message || error, 1000) || "CODE_AI_IMAGE_CANCEL_FAILED",
      commit_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"), 200);
    const providerJobId = text(url.searchParams.get("jobId") || url.searchParams.get("provider_job_id"), 500);
    if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!providerJobId) return Response.json({ success: false, error: "job_id required" }, { status: 400 });

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });

    const result = await AvantiqoImageProvider.getStatus({
      provider_job_id: providerJobId,
      context: { organization_id: organizationId },
    });
    return Response.json({
      success: true,
      ...result,
      commit_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: text(error?.message || error, 1000) || "CODE_AI_IMAGE_STATUS_FAILED",
      commit_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}
