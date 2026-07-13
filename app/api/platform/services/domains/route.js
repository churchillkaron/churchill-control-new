export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  resolveOrganizationServiceDomains,
} from "@/lib/platform/service-runtime/services/resolver/ServiceDomainResolver";


export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);


    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");


    const rows =
      await resolveOrganizationServiceDomains({

        organization_id,

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
