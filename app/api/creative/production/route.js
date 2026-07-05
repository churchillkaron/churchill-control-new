export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

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

    const productions =
      await ProductionRuntime.list({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

      });

    return NextResponse.json({

      success: true,

      productions,

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

    const production =
      await ProductionRuntime.create(
        body,
      );

    return NextResponse.json({

      success: true,

      production,

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

    const production =
      await ProductionRuntime.update(

        body.id,

        body,

      );

    return NextResponse.json({

      success: true,

      production,

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
