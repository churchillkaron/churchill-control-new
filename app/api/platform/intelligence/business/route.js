export const dynamic =
  "force-dynamic";

import {
  NextResponse,
} from "next/server";


import {
  BusinessIntelligenceRuntime,
} from "@/lib/platform/service-runtime/intelligence/runtime/BusinessIntelligenceRuntime";


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


    const result =
      await BusinessIntelligenceRuntime.analyzeOrganization(
        organization_id
      );


    return NextResponse.json({

      success:true,

      data:
        result,

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
