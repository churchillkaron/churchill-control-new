export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeProofAuthorizationRuntime,
} from "@/lib/creative/production/approval/CreativeProofAuthorizationRuntime";

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
    const approvalCandidateHash =
      body.approval_candidate_hash ||
      body.approvalCandidateHash ||
      null;
    const proofShotKey =
      body.proof_shot_key ||
      body.proofShotKey ||
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

    if (!proofShotKey) {
      return NextResponse.json({
        success: false,
        error: "proof_shot_key required",
      }, { status: 400 });
    }

    const result = await CreativeProofAuthorizationRuntime.issue({
      organization_id: organizationId,
      creative_project_id: projectId,
      approval_candidate: approvalCandidate,
      approval_candidate_hash: approvalCandidateHash,
      proof_shot_key: proofShotKey,
      human_approved: body.human_approved === true,
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
      preview_only: true,
      authorization_only: true,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
    }, { status: 500 });
  }
}
