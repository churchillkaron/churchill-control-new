export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function projectBrief(project = {}, mission = {}, body = {}) {
  const specifications = project.metadata?.specifications || {};
  const scenePlan =
    project.metadata?.deliverable_metadata?.scene_plan ||
    specifications.structure ||
    specifications.scene_plan ||
    [];

  return {
    ...(body.brief || {}),
    objective:
      body.brief?.objective ||
      project.objective ||
      project.description ||
      mission.objective ||
      "",
    business_goal:
      body.brief?.business_goal ||
      mission.business_goal ||
      "",
    duration_seconds:
      Number(
        body.duration_seconds ||
        project.target_duration ||
        specifications.duration ||
        30,
      ),
    target_channels:
      project.target_channels ||
      mission.channels ||
      [],
    target_languages:
      project.target_languages ||
      mission.metadata?.languages ||
      [],
    required_story_beats: Array.isArray(scenePlan)
      ? scenePlan
      : [],
    specifications,
    quality_policy:
      project.metadata?.quality_policy ||
      mission.metadata?.quality_policy ||
      {},
    production_mode:
      project.metadata?.production_mode ||
      mission.metadata?.production_mode ||
      "AI_NATIVE",
  };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const projectId =
      body.creative_project_id ||
      body.project_id ||
      null;
    const missionId =
      body.creative_mission_id ||
      body.mission_id ||
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

    const project = await CreativeProjectRuntime.get(projectId);
    if (project.organization_id !== organizationId) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      }, { status: 404 });
    }

    const resolvedMissionId =
      missionId ||
      project.creative_mission_id ||
      null;
    if (!resolvedMissionId) {
      return NextResponse.json({
        success: false,
        error: "creative_mission_id required",
      }, { status: 400 });
    }

    const mission = await CreativeMissionRuntime.get(resolvedMissionId);
    if (mission.organization_id !== organizationId) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_MISSION_NOT_IN_ORGANIZATION",
      }, { status: 404 });
    }

    const assets = await CreativeAssetsRuntime.list({
      organization_id: organizationId,
      creative_mission_id: resolvedMissionId,
      limit: 200,
    });
    const brief = projectBrief(project, mission, body);

    const pipeline = await CreativeDirectorRuntime.build({
      ...body,
      organization_id: organizationId,
      creative_mission_id: resolvedMissionId,
      creative_project_id: projectId,
      project,
      mission,
      objective: brief.objective,
      business_goal: brief.business_goal,
      duration_seconds: brief.duration_seconds,
      brief,
      assets,
      requestedOutputs: [
        {
          id: project.id,
          title: project.name,
          medium: project.metadata?.creative_medium || project.production_type,
          formats: project.metadata?.formats || [],
          channels: project.target_channels || [],
        },
      ],
      platform: (project.target_channels || []).join(", ") || "multi-channel",
      budgetMode: project.budget_profile || "quality-first",
    });

    return NextResponse.json({
      success: true,
      plan_only: true,
      production_dispatched: false,
      mission: {
        id: mission.id,
        title: mission.title,
      },
      project: {
        id: project.id,
        name: project.name,
        production_type: project.production_type,
        target_duration: project.target_duration,
      },
      asset_count: assets.length,
      pipeline,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, {
      status:
        error.code === "CREATIVE_STORYBOARD_PLAN_REJECTED"
          ? 422
          : 500,
    });
  }
}
