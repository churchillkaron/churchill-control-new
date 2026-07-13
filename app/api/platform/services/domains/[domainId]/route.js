export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  resolveOrganizationServiceDomainDetails,
} from "@/lib/platform/service-runtime/services/resolver/ServiceDomainDetailResolver";


export async function GET(
  req,
  {
    params,
  }
) {

  try {

    const { searchParams } =
      new URL(req.url);


    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");


    const rows =
      await resolveOrganizationServiceDomainDetails({

        organization_id,

        domain_id:
          params.domainId,

      });


    return NextResponse.json({

      success:true,

      rows,

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
