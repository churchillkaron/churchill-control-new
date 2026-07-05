export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeTimelineRuntime,
} from "@/lib/creative/timeline/runtime/CreativeTimelineRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req){

  try{

    const {searchParams}=
      new URL(req.url);

    const organizationId=
      searchParams.get("organizationId");

    const creativeProjectId=
      searchParams.get("creativeProjectId");

    const access=
      await requireOrganizationAccess({
        organizationId,
      });

    if(!access.success)
      return NextResponse.json(
        access,
        {status:access.status},
      );

    const result=
      await CreativeTimelineRuntime.build({

        organization_id:
          organizationId,

        creative_project_id:
          creativeProjectId,

      });

    return NextResponse.json({

      success:true,

      ...result,

    });

  }

  catch(error){

    return NextResponse.json({

      success:false,

      error:error.message,

    },{

      status:500,

    });

  }

}
