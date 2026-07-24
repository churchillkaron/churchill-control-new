export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeAuthorizedMasterStillPreparationRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedMasterStillPreparationRuntime";

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
    const approvalCandidate =
      body.approval_candidate ||
      body.approvalCandidate ||
      null;
    const proofAuthorization =
      body.proof_authorization ||
      body.proofAuthorization ||
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

    if (!approvalCandidate) {
      return NextResponse.json({
        success: false,
        error: "approval_candidate required",
      }, { status: 400 });
    }

    if (!proofAuthorization) {
      return NextResponse.json({
        success: false,
        error: "proof_authorization required",
      }, { status: 400 });
    }

    const result =
      await CreativeAuthorizedMasterStillPreparationRuntime.prepare({
        organization_id: organizationId,
        creative_project_id: projectId,
        approval_candidate: approvalCandidate,
        proof_authorization: proofAuthorization,
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
      preparation_only: true,
      production_dispatched: false,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
    }, { status: 500 });
  }
}
