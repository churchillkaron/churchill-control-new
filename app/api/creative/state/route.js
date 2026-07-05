export const dynamic =
  "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  CreativeStateEngine,
} from "@/lib/creative/state/CreativeStateEngine";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);

    const organization_id =
      searchParams.get(
        "organization_id",
      );

    const creative_project_id =
      searchParams.get(
        "creative_project_id",
      );

    const access =
      await requireOrganizationAccess({

        organizationId:
          organization_id,

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

    const state =
      await CreativeStateEngine.get(
        creative_project_id,
      );

    return NextResponse.json({

      success: true,

      state,

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
