export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import * as Repository
from "@/lib/creative/research/repositories/ResearchRepository";

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

    const reports =
      await Repository.list({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

      });

    return NextResponse.json({

      success: true,

      reports,

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

    const report =
      await Repository.create(
        body,
      );

    return NextResponse.json({

      success: true,

      report,

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

    const report =
      await Repository.update(

        body.id,

        body,

      );

    return NextResponse.json({

      success: true,

      report,

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
