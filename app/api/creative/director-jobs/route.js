export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeDirectorJobRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorJobRuntime";

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
    duration_seconds: Number(
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

function usableReferenceAsset(asset = {}) {
  if (!asset?.id || asset.archived) return false;

  const description = [
    asset.asset_type,
    asset.mime_type,
    asset.metadata?.mime_type,
    asset.file_name,
    asset.file_url,
    asset.image_url,
    asset.url,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/audio\//.test(description)) return false;
  if (/\.(mp3|wav|aac|m4a|flac)(?:\?|$)/.test(description)) {
    return false;
  }

  return Boolean(
    asset.file_url ||
    asset.image_url ||
    asset.thumbnail_url ||
    asset.url,
  );
}

function assetRank(asset = {}) {
  let score = 0;
  if (!asset.ai_generated) score += 100;
  if (asset.favorite) score += 30;
  if (asset.analysis && Object.keys(asset.analysis).length) score += 20;
  if (Array.isArray(asset.tags) && asset.tags.length) score += 10;
  if (asset.name || asset.title || asset.file_name) score += 5;
  score += Math.min(
    25,
    Number(asset.performance_score || asset.score || 0),
  );
  return score;
}

function mergeAssets(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const asset of group || []) {
      if (!usableReferenceAsset(asset)) continue;
      const existing = byId.get(String(asset.id));
      if (!existing || assetRank(asset) > assetRank(existing)) {
        byId.set(String(asset.id), asset);
      }
    }
  }

  return [...byId.values()]
    .sort((left, right) => assetRank(right) - assetRank(left))
    .slice(0, 200);
}

async function resolvePlanningAssets({
  organizationId,
  missionId,
  projectId,
}) {
  const [projectAssets, missionAssets] = await Promise.all([
    CreativeAssetsRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      limit: 200,
    }),
    CreativeAssetsRuntime.list({
      organization_id: organizationId,
      creative_mission_id: missionId,
      limit: 200,
    }),
  ]);

  let organizationAssets = [];
  if (!projectAssets.length || !missionAssets.length) {
    organizationAssets = await CreativeAssetsRuntime.list({
      organization_id: organizationId,
      limit: 200,
    });
  }

  return {
    assets: mergeAssets(
      projectAssets,
      missionAssets,
      organizationAssets,
    ),
    source: projectAssets.length
      ? "PROJECT"
      : missionAssets.length
        ? "MISSION"
        : organizationAssets.length
          ? "ORGANIZATION_REFERENCE_POOL"
          : "NONE",
    project_asset_count: projectAssets.length,
    mission_asset_count: missionAssets.length,
    organization_asset_count: organizationAssets.length,
  };
}

function errorStatus(error = {}) {
  const code = String(
    error.code ||
    error.message ||
    "",
  ).toUpperCase();

  if (
    code.includes("REQUIRED") ||
    code.includes("INVALID")
  ) {
    return 400;
  }
  if (code.includes("NOT_IN_ORGANIZATION")) return 404;
  if (code.includes("ALREADY_RUNNING")) return 409;
  if (
    code.includes("REJECTED") ||
    code.includes("DID_NOT_IMPROVE")
  ) {
    return 422;
  }
  return 500;
}

async function accessFor(organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(access, {
        status: access.status,
      }),
    };
  }

  return { access };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const organizationId =
      url.searchParams.get("organization_id") ||
      null;
    const jobId = url.searchParams.get("job_id") || null;
    const includePlan =
      url.searchParams.get("include_plan") === "true";

    const checked = await accessFor(organizationId);
    if (checked.response) return checked.response;
    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: "job_id required",
      }, { status: 400 });
    }

    const job = await CreativeDirectorJobRuntime.get({
      job_id: jobId,
      organization_id: organizationId,
      include_plan: includePlan,
    });

    return NextResponse.json({
      success: true,
      plan_only: true,
      production_dispatched: false,
      image_generation_started: false,
      video_generation_started: false,
      job,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, { status: errorStatus(error) });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;
    const action = String(body.action || "create").toLowerCase();

    const checked = await accessFor(organizationId);
    if (checked.response) return checked.response;

    if (action === "advance") {
      if (!body.job_id) {
        return NextResponse.json({
          success: false,
          error: "job_id required",
        }, { status: 400 });
      }

      const job = await CreativeDirectorJobRuntime.advance({
        job_id: body.job_id,
        organization_id: organizationId,
        retry_failed: body.retry_failed === true,
      });

      return NextResponse.json({
        success: true,
        plan_only: true,
        production_dispatched: false,
        image_generation_started: false,
        video_generation_started: false,
        job,
      });
    }

    if (action !== "create") {
      return NextResponse.json({
        success: false,
        error: "Unsupported action",
        supported_actions: ["create", "advance"],
      }, { status: 400 });
    }

    const projectId =
      body.creative_project_id ||
      body.project_id ||
      null;
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

    const missionId =
      body.creative_mission_id ||
      body.mission_id ||
      project.creative_mission_id ||
      null;
    if (!missionId) {
      return NextResponse.json({
        success: false,
        error: "creative_mission_id required",
      }, { status: 400 });
    }

    const mission = await CreativeMissionRuntime.get(missionId);
    if (mission.organization_id !== organizationId) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_MISSION_NOT_IN_ORGANIZATION",
      }, { status: 404 });
    }

    const assetResolution = await resolvePlanningAssets({
      organizationId,
      missionId,
      projectId,
    });
    const brief = projectBrief(project, mission, body);
    const requestedOutputs = [
      {
        id: project.id,
        title: project.name,
        medium:
          project.metadata?.creative_medium ||
          project.production_type,
        formats: project.metadata?.formats || [],
        channels: project.target_channels || [],
      },
    ];

    const job = await CreativeDirectorJobRuntime.create({
      organization_id: organizationId,
      creative_mission_id: missionId,
      creative_project_id: projectId,
      assets: assetResolution.assets,
      input_snapshot: {
        organization: body.organization || {},
        brand: body.brand || {},
        industry: body.industry || null,
        objective: brief.objective,
        business_goal: brief.business_goal,
        brief,
        target_duration_seconds: brief.duration_seconds,
        fps: Number(body.fps || project.metadata?.fps || 30),
        requested_outputs: requestedOutputs,
        platform:
          (project.target_channels || []).join(", ") ||
          "multi-channel",
        budget_mode:
          project.budget_profile ||
          "quality-first",
      },
    });

    return NextResponse.json({
      success: true,
      plan_only: true,
      production_dispatched: false,
      image_generation_started: false,
      video_generation_started: false,
      asset_count: assetResolution.assets.length,
      asset_resolution: assetResolution,
      job,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, { status: errorStatus(error) });
  }
}
