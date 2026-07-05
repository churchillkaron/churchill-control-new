export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeTimelineClipRuntime,
} from "@/lib/creative/timeline/clips/runtime/CreativeTimelineClipRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function PATCH(req, { params }) {

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
        status: access.status,
      },
    );
  }

  const clip =
    await CreativeTimelineClipRuntime.update(
      params.clipId,
      body,
    );

  return NextResponse.json({
    success: true,
    clip,
  });

}
