import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  createCreativeVideoQualityPreference,
  normalizeCreativeVideoQuality,
} from "@/lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function activeGenerationAuthorization(project = {}) {
  const metadata = object(project.metadata);
  const approval = object(
    metadata.paid_generation_approval ||
    metadata.generation_approval ||
    metadata.media_generation_authorization,
  );
  return approval.approved === true ||
    approval.media_generation_authorized === true ||
    metadata.production_authorized === true ||
    metadata.media_generation_authorized === true;
}

async function rebindExistingShots({ organizationId, projectId }) {
  const shots = await ShotRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
  });

  let rebound = 0;
  for (const shot of shots) {
    const capability = text(
      shot.generation?.capability ||
      shot.generation?.service ||
      shot.capability ||
      shot.service_id,
    ).toLowerCase();
    if (!capability.includes("video")) continue;
    await ShotRuntime.update(shot.id, {});
    rebound += 1;
  }
  return rebound;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);

    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id required" },
        { status: 400 },
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "creative_project_id required" },
        { status: 400 },
      );
    }

    await requireOrganizationAccess({ organization_id: organizationId });

    const project = await CreativeProjectRuntime.get(projectId);
    if (!project || text(project.organization_id) !== organizationId) {
      return NextResponse.json(
        { error: "Creative project not found" },
        { status: 404 },
      );
    }

    if (activeGenerationAuthorization(project)) {
      return NextResponse.json(
        {
          error: "VIDEO_QUALITY_LOCKED_BY_GENERATION_AUTHORIZATION",
          detail:
            "Video quality cannot change after generation has been authorized. Create a fresh generation preflight and approval instead.",
        },
        { status: 409 },
      );
    }

    const previous =
      project.metadata?.release_quality?.preference ||
      project.metadata?.video_quality_preference ||
      "AUTO";
    const quality = normalizeCreativeVideoQuality(body.quality);
    const preference = createCreativeVideoQualityPreference({
      quality,
      previous,
      source: "STUDIO_MANUAL_CONTROL",
    });

    const updated = await CreativeProjectRuntime.update(project.id, {
      metadata: {
        ...object(project.metadata),
        release_quality: preference,
        video_quality_preference: preference.preference,
        video_quality_resolution: preference.resolution,
        video_quality_selection_contract: preference.contract,
        video_quality_requires_fresh_preflight: true,
      },
    });

    const reboundVideoShots = await rebindExistingShots({
      organizationId,
      projectId,
    });

    return NextResponse.json({
      project: updated,
      quality: preference,
      rebound_video_shots: reboundVideoShots,
      generation_authorized: false,
      publication_authorized: false,
    });
  } catch (error) {
    console.error("creative project video quality POST", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update video quality" },
      { status: 500 },
    );
  }
}
