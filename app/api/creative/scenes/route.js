export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  SceneRuntime,
} from "@/lib/creative/scenes/runtime/SceneRuntime";

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

    const scenes =
      await SceneRuntime.list({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

      });

    return NextResponse.json({

      success: true,

      scenes,

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

    const scene =
      await SceneRuntime.create({

        ...body,

        organization_id:
          organizationId,

      });

    return NextResponse.json({

      success: true,

      scene,

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

    const scene =
      await SceneRuntime.update(
        body.id,
        body,
      );

    return NextResponse.json({

      success:true,

      scene,

    });

  }

  catch(error) {

    return NextResponse.json({

      success:false,

      error:error.message,

    },{status:500});

  }

}
