export const dynamic =
  "force-dynamic";

import {
  NextResponse,
} from "next/server";


import {
  ROIIntelligenceRuntime,
} from "@/lib/platform/service-runtime/intelligence/runtime/ROIIntelligenceRuntime";


export async function GET(request) {

  try {

    const url =
      new URL(request.url);


    const organization_id =
      url.searchParams.get(
        "organization_id"
      );


    if (!organization_id) {

      return NextResponse.json(
        {
          success:false,
          error:
            "organization_id required",
        },
        {
          status:400,
        }
      );

    }


    const data =
      await ROIIntelligenceRuntime.organization(
        organization_id
      );


    return NextResponse.json({

      success:true,

      data,

    });


  } catch(error) {

    return NextResponse.json(

      {
        success:false,
        error:
          error.message,
      },

      {
        status:500,
      }

    );

  }

}
