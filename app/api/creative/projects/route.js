export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { CreativeProjectsRuntime }
from "@/lib/creative/projects/runtime/CreativeProjectsRuntime";

import { requireOrganizationAccess }
from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);

    const organizationId =
      searchParams.get(
        "organizationId"
      );

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {

      return NextResponse.json(
        access,
        {
          status: access.status,
        }
      );

    }

    const data =
      await CreativeProjectsRuntime.list(
        organizationId,
      );

    return NextResponse.json({

      success: true,

      data,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error: error.message,

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
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        access,
        {
          status: access.status,
        }
      );

    }

    const project =
      await CreativeProjectsRuntime.create(
        body,
      );

    return NextResponse.json({

      success: true,

      data: project,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error: error.message,

    }, {

      status: 500,

    });

  }

}
