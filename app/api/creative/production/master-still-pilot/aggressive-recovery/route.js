export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  NextResponse,
} from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  CreativeMasterStillPilotAssetHydrationRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotAssetHydrationRuntime";

import {
  CreativeMasterStillPilotAggressiveRecoveryRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotAggressiveRecoveryRuntime";

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
    const masterTaskId =
      body.master_task_id ||
      body.masterTaskId ||
      null;
    const qaTaskId =
      body.qa_task_id ||
      body.qaTaskId ||
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
      }, {
        status: 400,
      });
    }

    const project = await CreativeProjectRuntime.get(projectId);

    if (
      !project ||
      project.organization_id !== organizationId
    ) {
      return NextResponse.json({
        success: false,
        error: "CREATIVE_PROJECT_NOT_IN_ORGANIZATION",
      }, {
        status: 404,
      });
    }

    const hydration =
      await CreativeMasterStillPilotAssetHydrationRuntime.hydrate({
        organization_id: organizationId,
        creative_project_id: projectId,
        master_task_id: masterTaskId,
      });

    const result =
      await CreativeMasterStillPilotAggressiveRecoveryRuntime.run({
        organization_id: organizationId,
        creative_project_id: projectId,
        master_task_id: masterTaskId,
        qa_task_id: qaTaskId,
        scene_number: Number(body.scene_number || 1),
        shot_number: Number(body.shot_number || 1),
        currency: body.currency || null,
        test_wallet_balance: Number(
          body.test_wallet_balance,
        ),
      });

    return NextResponse.json({
      success: result.success,
      result: {
        ...result,
        dynamic_reference_hydration:
          hydration.references,
      },
    }, {
      status: result.success ? 200 : 422,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error:
        error?.message ||
        String(error),
      code: error?.code || null,
      details: error?.details || null,
    }, {
      status: 500,
    });
  }
}
