import { NextResponse } from "next/server";

import {
  createOrganization,
} from "@/lib/organizations/createOrganization";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const organization =
      await createOrganization({

        name:
          body.name,

        organizationType:
          body.organizationType,

        parentOrganizationId:
          body.parentOrganizationId,

        tenantId:
          body.tenantId,

        templateId:
          body.templateId,

      });

    return NextResponse.json({

      success: true,

      organization,

    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }

}
