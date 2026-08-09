import { NextResponse } from "next/server";

import {
  createOrganization,
} from "@/lib/platform/administration/runtime/AdministrationRuntime";

export async function POST(request) {
  try {
    const body = await request.json();

    const organization = await createOrganization({
      name: body.name,
      organizationType:
        body.organizationType ||
        body.organization_type,
      parentOrganizationId:
        body.parentOrganizationId ||
        body.parent_organization_id ||
        null,
      legalName:
        body.legalName ||
        body.legal_name ||
        null,
      industry: body.industry || null,
      address: body.address || null,
      country: body.country || null,
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
