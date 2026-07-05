export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  buildCreativePipeline,
} from "@/lib/creative/director/orchestrator/CreativePipelineOrchestrator";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organization_id,

      });

    if (!access.success) {

      return NextResponse.json(
        access,
        {
          status:
            access.status,
        },
      );

    }

    const pipeline =
      await buildCreativePipeline({

        organization_id:
          body.organization_id,

        creative_project_id:
          body.creative_project_id,

        brief:
          body.brief,

      });

    return NextResponse.json({

      success: true,

      pipeline,

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
