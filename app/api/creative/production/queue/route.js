export const dynamic = "force-dynamic";

import "@/lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap";
import "@/lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap";

import { NextResponse } from "next/server";

import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);

    const organizationId =
      searchParams.get("organizationId");

    const creativeProjectId =
      searchParams.get("creativeProjectId");

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success)
      return NextResponse.json(
        access,
        {
          status:
            access.status,
        }
      );

    const queue =
      await ProductionQueueRuntime.build({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

      });

    return NextResponse.json({

      success: true,

      queue,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

}

export async function POST(req) {

  try {

    const body =
      await req.json();

    const organizationId =
      body.organization_id ||
      body.organizationId;

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success)
      return NextResponse.json(
        access,
        {
          status:
            access.status,
        }
      );

    const result =
      await ProductionQueueRuntime.dispatchAll({

        organization_id:
          organizationId,

        creative_project_id:
          body.creative_project_id,

      });

    return NextResponse.json({

      success: true,

      result,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

}
