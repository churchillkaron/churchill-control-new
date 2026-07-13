export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  resolveServiceEconomics,
} from "@/lib/platform/service-runtime/services/resolver/ServiceEconomicsResolver";


export async function GET(req) {

  try {

    const {
      searchParams,
    } =
      new URL(req.url);


    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");


    const domain =
      searchParams.get("domain") ||
      null;


    const capability =
      searchParams.get("capability") ||
      null;


    const economics =
      await resolveServiceEconomics({

        organization_id,

        domain,
        capability,

      });


    return NextResponse.json({

      success:true,

      economics,

    });


  } catch(error) {

    return NextResponse.json(

      {
        success:false,
        error:error.message,
      },

      {
        status:500,
      }

    );

  }

}
