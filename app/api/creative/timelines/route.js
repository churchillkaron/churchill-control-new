export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeTimelineEditorRuntime,
} from "@/lib/creative/timeline/runtime/CreativeTimelineEditorRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {

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
      },
    );

  return NextResponse.json({

    success: true,

    timelines:
      await CreativeTimelineEditorRuntime.list({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

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

  if (!access.success)
    return NextResponse.json(
      access,
      {
        status:
          access.status,
      },
    );

  return NextResponse.json({

    success: true,

    timeline:
      await CreativeTimelineEditorRuntime.create(body),

  });

}
