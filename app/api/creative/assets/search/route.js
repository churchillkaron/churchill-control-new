export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeAssetSearchRuntime,
} from "@/lib/creative/assets/search/runtime/CreativeAssetSearchRuntime";

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

    const query =
      searchParams.get("query") || "";

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

    const assets =
      await CreativeAssetSearchRuntime.search({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

        query,

      });

    return NextResponse.json({

      success: true,

      assets,

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
