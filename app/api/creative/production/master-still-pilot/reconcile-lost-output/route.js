export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  NextResponse,
} from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  ServiceLostOutputCreditRuntime,
} from "@/lib/platform/service-runtime/reconciliation/ServiceLostOutputCreditRuntime";

export async function POST(req) {
  try {
    const body = await req.json();

    const organizationId =
      body.organization_id ||
      body.organizationId ||
      null;

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        access,
        {
          status: access.status,
        },
      );
    }

    const result =
      await ServiceLostOutputCreditRuntime.credit({
        organization_id:
          organizationId,
        creative_project_id:
          body.creative_project_id ||
          body.creativeProjectId ||
          null,
        production_task_id:
          body.production_task_id ||
          body.productionTaskId ||
          null,
        usage_id:
          body.usage_id ||
          body.usageId ||
          null,
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error:
        error?.message ||
        String(error),
      code: error?.code || null,
      details:
        error?.details || null,
    }, {
      status: 422,
    });
  }
}
