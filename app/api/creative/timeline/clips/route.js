export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeTimelineClipRuntime,
} from "@/lib/creative/timeline/clips/runtime/CreativeTimelineClipRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

  const { searchParams } =
    new URL(req.url);

  const organizationId =
    searchParams.get("organizationId");

  const timelineId =
    searchParams.get("timelineId");

  const access =
    await requireOrganizationAccess({
      organizationId,
    });

  if (!access.success) {
    return NextResponse.json(
      access,
      { status: access.status }
    );
  }

  return NextResponse.json({

    success: true,

    clips:
      await CreativeTimelineClipRuntime.list({

        timeline_id:
          timelineId,

      }),

  });

}

export async function POST(req) {

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
      { status: access.status }
    );
  }

  return NextResponse.json({

    success: true,

    clip:
      await CreativeTimelineClipRuntime.create(body),

  });

}
