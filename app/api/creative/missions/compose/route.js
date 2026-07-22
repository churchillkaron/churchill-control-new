import { NextResponse } from "next/server";

import {
  CreativeMissionComposerRuntime,
} from "@/lib/creative/intent/CreativeMissionComposerRuntime";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function projectPayload({
  organization_id,
  mission,
  deliverable,
  blueprint,
}) {
  return {
    organization_id,
    creative_mission_id: mission.id,
    name: deliverable.title,
    description: deliverable.description,
    objective: deliverable.description || blueprint.objective,
    production_type: "MULTIMEDIA",
    target_channels: deliverable.channels || [],
    target_languages: blueprint.languages || [],
    quality_profile: "WORLD_CLASS",
    budget_profile: "MISSION_CONTROLLED",
    metadata: {
      creative_medium: deliverable.medium,
      formats: deliverable.formats || [],
      capabilities: deliverable.capabilities || [],
      dependencies: deliverable.dependencies || [],
      success_criteria: deliverable.success_criteria || [],
      specifications: deliverable.specifications || {},
      deliverable_metadata: deliverable.metadata || {},
      mission_workflow: blueprint.workflow || [],
      mission_departments: blueprint.departments || [],
      creative_thesis: blueprint.creative_thesis,
      quality_policy: blueprint.quality_policy || {},
      source_request:
        mission.metadata?.source_request ||
        blueprint.objective,
    },
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organization_id = body.organization_id;
    const creativeRequest = String(
      body.request || body.prompt || body.objective || "",
    ).trim();

    if (!organization_id) {
      return NextResponse.json(
        { error: "organization_id required" },
        { status: 400 },
      );
    }

    if (!creativeRequest) {
      return NextResponse.json(
        { error: "creative request required" },
        { status: 400 },
      );
    }

    await requireOrganizationAccess({ organization_id });

    const blueprint = await CreativeMissionComposerRuntime.compose({
      organization_id,
      request: creativeRequest,
      context: body.context || {},
    });

    const mission = await CreativeMissionRuntime.create({
      organization_id,
      title: blueprint.title,
      business_goal: blueprint.business_goal,
      objective: blueprint.objective,
      audience: blueprint.audience || {},
      channels: blueprint.channels || [],
      metadata: {
        source_request: creativeRequest,
        creative_thesis: blueprint.creative_thesis,
        deliverables: blueprint.deliverables || [],
        workflow: blueprint.workflow || [],
        departments: blueprint.departments || [],
        production_principles:
          blueprint.production_principles || [],
        quality_policy: blueprint.quality_policy || {},
        assumptions: blueprint.assumptions || [],
        blocking_questions: blueprint.blocking_questions || [],
        composition_confidence: blueprint.confidence,
        composition_mode: "OPEN_CREATIVE_MISSION_V1",
      },
    });

    await CreativeMissionRuntime.start(mission.id);

    const projects = [];
    for (const deliverable of blueprint.deliverables || []) {
      const project = await CreativeProjectRuntime.create(
        projectPayload({
          organization_id,
          mission,
          deliverable,
          blueprint,
        }),
      );
      projects.push(project);
    }

    return NextResponse.json({
      success: true,
      mission: {
        ...mission,
        status: "active",
      },
      projects,
      blueprint,
    });
  } catch (error) {
    console.error("creative mission composition failed", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Creative mission composition failed",
      },
      { status: 500 },
    );
  }
}
