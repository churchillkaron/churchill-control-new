export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeAuthorizedProofEvidenceBindingRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedProofEvidenceBindingRuntime";

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
      await CreativeAuthorizedProofEvidenceBindingRuntime.bind({
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
        evidence_audit:
          body.evidence_audit ||
          body.evidenceAudit ||
          null,
        role_bindings:
          body.role_bindings ||
          body.roleBindings ||
          [],
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
      binding_only: true,
      production_task_modified: false,
      provider_dispatched: false,
      wallet_reserved: false,
      usage_created: false,
      image_generated: false,
      video_generated: false,
    }, { status: 422 });
  }
}
