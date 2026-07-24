export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

import { NextResponse } from "next/server";

import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import {
  CreativeUniversalProductionRuntime,
} from "@/lib/creative/production/runtime/CreativeUniversalProductionRuntime";
import {
  CreativeProductionHandoffRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionHandoffRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function normalizeReleaseMode(value) {
  const mode = String(value || "MANUAL").trim().toUpperCase();
  return ["AUTOMATIC", "AUTO_AFTER_AI_QA", "AUTO"].includes(mode)
    ? "AUTOMATIC"
    : "MANUAL";
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organization_id = body.organization_id || body.organizationId || null;
    const creative_project_id =
      body.creative_project_id || body.creativeProjectId || null;

    if (!organization_id) {
      return NextResponse.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }
    if (!creative_project_id) {
      return NextResponse.json(
        { success: false, error: "creative_project_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: organization_id,
    });
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    const project = await CreativeProjectRuntime.get(creative_project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "CREATIVE_PROJECT_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (project.organization_id !== organization_id) {
      return NextResponse.json(
        { success: false, error: "CREATIVE_PROJECT_ORGANIZATION_MISMATCH" },
        { status: 403 },
      );
    }

    const release_mode = normalizeReleaseMode(
      body.release_mode || body.releaseMode,
    );
    const executionInput = {
      ...body,
      organization_id,
      creative_project_id,
      creative_mission_id:
        body.creative_mission_id ||
        body.mission_id ||
        project.creative_mission_id ||
        project.id,
      project,
      release_mode,
    };

    const universal = CreativeUniversalProductionRuntime.isUniversalProject(project);
    const result = universal
      ? await CreativeUniversalProductionRuntime.execute({
          organization_id,
          creative_project_id,
          max_cycles: body.max_cycles || 1,
        })
      : await CreativeDirectorRuntime.execute(executionInput);

    let autonomous_handoff = null;
    if (
      result?.success !== false &&
      result?.production &&
      creative_project_id
    ) {
      autonomous_handoff = await CreativeProductionHandoffRuntime.activate({
        organization_id,
        creative_project_id,
        approved_by:
          body.approved_by ||
          body.approvedBy ||
          access.user?.id ||
          access.user_id ||
          null,
        approval_source:
          body.approval_source ||
          "AUTHENTICATED_CREATIVE_PRODUCTION_START",
        release_mode,
        production: result.production,
      });
    }

    const success = result?.success !== false;
    return NextResponse.json(
      {
        success,
        ...result,
        universal,
        release_mode,
        autonomous_handoff,
      },
      { status: success ? 200 : 422 },
    );
  } catch (error) {
    console.error("creative director execution failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Creative production failed",
        code: error?.code || null,
        details: error?.details || null,
      },
      { status: 500 },
    );
  }
}
