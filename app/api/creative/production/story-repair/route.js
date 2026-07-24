export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeDetailedStorySnapshotRepairRuntime,
} from "@/lib/creative/production/story/CreativeDetailedStorySnapshotRepairRuntime";

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
    const sourceResult =
      body.source_result ||
      body.sourceResult ||
      body.preview_result ||
      body.previewResult ||
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

    if (!sourceResult) {
      return NextResponse.json({
        success: false,
        error: "source_result required",
        code: "CREATIVE_STORY_PREVIEW_SNAPSHOT_REQUIRED",
        preview_only: true,
        media_generation_dispatched: false,
        image_generation_dispatched: false,
        video_generation_dispatched: false,
        production_tasks_created: 0,
        assets_created: 0,
      }, { status: 400 });
    }

    const result =
      await CreativeDetailedStorySnapshotRepairRuntime.run({
        organization_id: organizationId,
        creative_project_id: projectId,
        source_result: sourceResult,
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
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
    }, { status: 500 });
  }
}
