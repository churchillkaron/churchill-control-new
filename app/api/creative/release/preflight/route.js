export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import fs from "node:fs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function configured(value) {
  return Boolean(String(value || "").trim());
}

function executable(value) {
  if (!configured(value)) return false;
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const ffmpegPath = process.env.CREATIVE_MEDIA_FFMPEG_PATH;
    const ffprobePath = process.env.CREATIVE_MEDIA_FFPROBE_PATH;
    const checks = [
      {
        id: "supabase_url_configured",
        required: true,
        passed: configured(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
      {
        id: "supabase_service_role_configured",
        required: true,
        passed: configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      {
        id: "render_bucket_configured",
        required: true,
        passed: configured(process.env.CREATIVE_MEDIA_RENDER_BUCKET),
      },
      {
        id: "ffmpeg_path_configured",
        required: true,
        passed: configured(ffmpegPath),
      },
      {
        id: "ffmpeg_executable",
        required: true,
        passed: executable(ffmpegPath),
      },
      {
        id: "ffprobe_path_configured",
        required: true,
        passed: configured(ffprobePath),
      },
      {
        id: "ffprobe_executable",
        required: true,
        passed: executable(ffprobePath),
      },
      {
        id: "render_timeout_configured",
        required: false,
        passed: configured(process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS),
      },
      {
        id: "render_cache_control_configured",
        required: false,
        passed: configured(process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL),
      },
    ];
    const blocking = checks.filter((check) => check.required && !check.passed);

    return Response.json({
      success: true,
      organization_id: organizationId,
      ready: blocking.length === 0,
      checks,
      blocking_checks: blocking.map((check) => check.id),
      evaluated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
