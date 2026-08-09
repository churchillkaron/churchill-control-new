export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePipelinePreviewRuntime,
} from "@/lib/creative/director/runtime/CreativePipelinePreviewRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function preview(request, input = {}) {
  const organizationId = text(input.organization_id);
  const missionId = text(input.creative_mission_id || input.mission_id);
  const projectId = text(input.creative_project_id || input.project_id);

  if (!organizationId || !missionId || !projectId) {
    return json({
      success: false,
      error: "organization_id, creative_mission_id, and creative_project_id are required",
      provider_calls_executed: false,
      paid_reasoning_executed: false,
      perceptual_review_executed: false,
      publication_authorized: false,
    }, 400);
  }

  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: [
      "creative.execute",
      "creative.production.run",
      "creative.*",
    ],
  });
  if (!access.success) return json(access, access.status);

  const result = await CreativePipelinePreviewRuntime.build({
    organization_id: organizationId,
    creative_mission_id: missionId,
    creative_project_id: projectId,
  });

  return json({
    success: true,
    preview: result,
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    return await preview(request, {
      organization_id: url.searchParams.get("organization_id"),
      creative_mission_id:
        url.searchParams.get("creative_mission_id") ||
        url.searchParams.get("mission_id"),
      creative_project_id:
        url.searchParams.get("creative_project_id") ||
        url.searchParams.get("project_id"),
    });
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
      provider_calls_executed: false,
      paid_reasoning_executed: false,
      perceptual_review_executed: false,
      publication_authorized: false,
    }, 409);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    return await preview(request, body);
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
      provider_calls_executed: false,
      paid_reasoning_executed: false,
      perceptual_review_executed: false,
      publication_authorized: false,
    }, 409);
  }
}
