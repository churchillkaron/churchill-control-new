export const dynamic =
  "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

  try {

    const {
      searchParams,
    } =
      new URL(req.url);

    const organizationId =
      searchParams.get(
        "organizationId"
      );

    const creativeProjectId =
      searchParams.get(
        "creativeProjectId"
      );

    const sceneId =
      searchParams.get(
        "sceneId"
      );

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

    const shots =
      await ShotRuntime.list({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

        scene_id:
          sceneId,

      });

    return NextResponse.json({

      success: true,

      shots,

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

    const shot =
      await ShotRuntime.create({

        ...body,

        organization_id:
          organizationId,

      });

    return NextResponse.json({

      success: true,

      shot,

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

    const shot =
      await ShotRuntime.update(
        body.id,
        body,
      );

    return NextResponse.json({

      success:true,

      shot,

    });

  }

  catch(error) {

    return NextResponse.json({

      success:false,

      error:error.message,

    },{status:500});

  }

}
