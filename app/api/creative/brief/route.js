export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeBriefRuntime,
} from "@/lib/creative/brief/runtime/CreativeBriefRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

export async function GET(req) {

  try {

    const {
      searchParams,
    } = new URL(req.url);

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
        },
      );

    const briefs =
      await CreativeBriefRuntime.list({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

      });

    return NextResponse.json({

      success: true,

      briefs,

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

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organization_id,

      });

    if (!access.success)
      return NextResponse.json(
        access,
        {
          status:
            access.status,
        },
      );

    const brief =
      await CreativeBriefRuntime.create(
        body,
      );

    return NextResponse.json({

      success: true,

      brief,

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

export async function PATCH(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organization_id,

      });

    if (!access.success)
      return NextResponse.json(
        access,
        {
          status:
            access.status,
        },
      );

    if (body.action === "approve") {

      const brief =
        await CreativeBriefRuntime.update(
          body.id,
          {
            status:
              "APPROVED",
          },
        );

      await CreativeStateEngine.advance(
        {
          organization_id:
            body.organization_id,

          creative_mission_id:
            body.creative_mission_id,

          mission_id:
            body.creative_mission_id,
        },
        PIPELINE_STAGES.BUILDING_STRATEGY,
      );

      return NextResponse.json({
        success: true,
        brief,
      });

    }

    const brief =
      await CreativeBriefRuntime.update(

        body.id,

        body,

      );

    return NextResponse.json({

      success: true,

      brief,

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
