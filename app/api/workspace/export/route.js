export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(request){

  const { searchParams } =
    new URL(request.url);

  const moduleKey =
    searchParams.get("module");

  const organizationId =
    searchParams.get("organizationId");

  const format =
    searchParams.get("format") || "xlsx";

  const registry = {

    customers:
      "/api/customers/export",

    vendors:
      "/api/finance/vendors/export",

    "legal-entities":
      "/api/finance/legal-entities/export",

    "cost-centers":
      "/api/finance/cost-centers/export",

    "bank-accounts":
      "/api/finance/bank-accounts/export",

  };

  const endpoint =
    registry[moduleKey];

  if(!endpoint){

    return NextResponse.json({

      success:false,
      error:`Export not configured for ${moduleKey}`,

    },{status:400});

  }

  return Response.redirect(

    `${process.env.NEXT_PUBLIC_APP_URL}${endpoint}?organizationId=${organizationId}&format=${format}`

  );

}
