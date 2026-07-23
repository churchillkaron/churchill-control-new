export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeAuthorizedMasterStillPromptBudgetRecoveryRuntime,
} from "@/lib/creative/production/approval/CreativeAuthorizedMasterStillPromptBudgetRecoveryRuntime";

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
      await CreativeAuthorizedMasterStillPromptBudgetRecoveryRuntime.recover({
        organization_id: organizationId,
        creative_project_id: projectId,
        failed_generation_result:
          body.failed_generation_result ||
          body.failedGenerationResult ||
          null,
        explicit_confirmation:
          body.explicit_confirmation ||
          body.explicitConfirmation ||
          null,
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
      recovery_only: true,
      provider_dispatched: false,
      wallet_reserved: false,
      wallet_charged: false,
      usage_created: false,
      image_generated: false,
      video_generated: false,
      automatic_repair_dispatched: false,
    }, { status: 500 });
  }
}
