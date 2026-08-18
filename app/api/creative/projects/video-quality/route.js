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
  creativeVideoQualityFromProject,
  normalizeCreativeVideoQuality,
} from "@/lib/creative/video/runtime/CreativeVideoQualityPreferenceRuntime";
import {
  resolveCreativeVideoProviderConfiguration,
} from "@/lib/creative/video/runtime/CreativeVideoProviderConfigurationRuntime";

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

async function projectAndConfiguration({ organizationId, projectId }) {
  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || text(project.organization_id) !== organizationId) {
    return { project: null, configuration: null };
  }

  const configuration = await resolveCreativeVideoProviderConfiguration({
    organization_id: organizationId,
    currency:
      project.metadata?.currency ||
      project.metadata?.budget_profile?.currency ||
      project.budget_profile?.currency ||
      null,
    preferred_provider:
      project.metadata?.video_provider_preference ||
      project.metadata?.generation_provider_preference ||
      null,
  });

  return { project, configuration };
}

function publicConfiguration(configuration = {}) {
  const profile = object(configuration.video_capabilities);
  return {
    contract: profile.contract || null,
    provider: configuration.provider || null,
    model: configuration.model || null,
    pricing_id: configuration.pricing_id || null,
    currency: configuration.currency || null,
    service_id: configuration.service_id || null,
    capability: configuration.capability || null,
    auto_option: object(profile.auto_option),
    resolution_options: Array.isArray(profile.resolution_options)
      ? profile.resolution_options
      : [],
    supported_resolutions: Array.isArray(profile.supported_resolutions)
      ? profile.supported_resolutions
      : [],
    auto_resolution_priority: Array.isArray(profile.auto_resolution_priority)
      ? profile.auto_resolution_priority
      : [],
    supported_aspect_ratios: Array.isArray(profile.supported_aspect_ratios)
      ? profile.supported_aspect_ratios
      : [],
    native_frame_rate: profile.native_frame_rate ?? null,
    native_audio: profile.native_audio ?? null,
  };
}

async function rebindExistingShots({ organizationId, projectId }) {
  const shots = await ShotRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
  });

  let rebound = 0;
  for (const shot of shots) {
    await ShotRuntime.update(shot.id, {});
    rebound += 1;
  }
  return rebound;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organization_id"));
    const projectId = text(url.searchParams.get("creative_project_id"));

    if (!organizationId || !projectId) {
      return NextResponse.json(
        { error: "organization_id and creative_project_id required" },
        { status: 400 },
      );
    }

    await requireOrganizationAccess({ organization_id: organizationId });
    const { project, configuration } = await projectAndConfiguration({
      organizationId,
      projectId,
    });
    if (!project) {
      return NextResponse.json(
        { error: "Creative project not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      selection: creativeVideoQualityFromProject(project),
      locked: activeGenerationAuthorization(project),
      configuration: publicConfiguration(configuration),
    });
  } catch (error) {
    console.error("creative project video quality GET", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve video quality configuration" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);

    if (!organizationId || !projectId) {
      return NextResponse.json(
        { error: "organization_id and creative_project_id required" },
        { status: 400 },
      );
    }

    await requireOrganizationAccess({ organization_id: organizationId });
    const { project, configuration } = await projectAndConfiguration({
      organizationId,
      projectId,
    });
    if (!project) {
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

    const previous = creativeVideoQualityFromProject(project);
    const quality = normalizeCreativeVideoQuality(body.quality);
    const preference = createCreativeVideoQualityPreference({
      quality,
      provider_capabilities: configuration.video_capabilities,
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
        video_quality_provider_configuration: {
          contract: configuration.video_capabilities?.contract || null,
          provider: configuration.provider || null,
          model: configuration.model || null,
          pricing_id: configuration.pricing_id || null,
          service_id: configuration.service_id || null,
          capability: configuration.capability || null,
          selected_at: new Date().toISOString(),
        },
      },
    });

    const reboundShots = await rebindExistingShots({
      organizationId,
      projectId,
    });

    return NextResponse.json({
      project: updated,
      quality: preference,
      configuration: publicConfiguration(configuration),
      rebound_shots: reboundShots,
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
