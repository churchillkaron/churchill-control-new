export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeAuthorizedFullSceneMasterStillRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedFullSceneMasterStillRuntime";

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

    const result =
      await CreativeAuthorizedFullSceneMasterStillRuntime.run({
        organization_id: organizationId,
        creative_project_id: projectId,
        approval_candidate:
          body.approval_candidate ||
          body.approvalCandidate ||
          null,
        proof_authorization:
          body.proof_authorization ||
          body.proofAuthorization ||
          null,
        authorized_preparation:
          body.authorized_preparation ||
          body.authorizedPreparation ||
          null,
        explicit_confirmation:
          body.explicit_confirmation ||
          body.explicitConfirmation ||
          null,
        accept_paid_execution:
          body.accept_paid_execution === true ||
          body.acceptPaidExecution === true,
      });

    return NextResponse.json({
      success: result.success === true,
      result,
    }, {
      status: result.success === true ? 200 : 422,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
      full_scene_only: true,
      masked_composition_allowed: false,
      paid_execution_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
    }, { status: 500 });
  }
}