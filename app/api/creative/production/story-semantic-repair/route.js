export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeDetailedStorySemanticRepairRuntime,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRepairRuntime";

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
    const completedResult =
      body.completed_result ||
      body.completedResult ||
      null;
    const semanticReviewResult =
      body.semantic_review_result ||
      body.semanticReviewResult ||
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

    if (!completedResult) {
      return NextResponse.json({
        success: false,
        error: "completed_result required",
      }, { status: 400 });
    }

    if (!semanticReviewResult) {
      return NextResponse.json({
        success: false,
        error: "semantic_review_result required",
      }, { status: 400 });
    }

    const result = await CreativeDetailedStorySemanticRepairRuntime.run({
      organization_id: organizationId,
      creative_project_id: projectId,
      completed_result: completedResult,
      semantic_review_result: semanticReviewResult,
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
      preview_only: true,
      repair_only: true,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
    }, { status: 500 });
  }
}
