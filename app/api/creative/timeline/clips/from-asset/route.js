export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeTimelineClipRuntime,
} from "@/lib/creative/timeline/clips/runtime/CreativeTimelineClipRuntime";

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

    const clip =
      await CreativeTimelineClipRuntime.create({

        organization_id:
          body.organization_id,

        creative_project_id:
          body.creative_project_id,

        timeline_id:
          body.timeline_id,

        track_id:
          body.track_id,

        asset_id:
          body.asset_id,

        start_seconds:
          body.start_seconds ?? 0,

        end_seconds:
          body.end_seconds ?? 5,

      });

    return NextResponse.json({

      success: true,

      clip,

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
