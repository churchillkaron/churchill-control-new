export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

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

    const result =
      await CreativeDirectorRuntime.execute(body);

    return NextResponse.json({

      success: true,

      ...result,

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
