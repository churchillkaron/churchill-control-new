export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeDetailedStorySemanticRevalidationRuntimeV3,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV3";

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const projectId =
      body.creative_project_id ||
      body.creativeProjectId ||
      body.project_id ||
      null;
    const repairedResult =
      body.repaired_result ||
      body.repairedResult ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    if (!projectId) {
      return NextResponse.json({
        success: false,
        error: "creative_project_id required",
      }, { status: 400 });
    }

    if (!repairedResult) {
      return NextResponse.json({
        success: false,
        error: "repaired_result required",
      }, { status: 400 });
    }

    const result =
      await CreativeDetailedStorySemanticRevalidationRuntimeV3.run({
        organization_id: organizationId,
        creative_project_id: projectId,
        repaired_result: repairedResult,
      });

    return NextResponse.json({
      success: result.success,
      result,
    }, {
      status: result.success ? 200 : 422,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
      review_only: true,
      preview_only: true,
      dynamic_contract: true,
      contextual_validation: true,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
    }, { status: 500 });
  }
}
