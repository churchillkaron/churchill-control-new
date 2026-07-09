import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json();

  const production = {
    organizationId: body.organizationId,
    pageId: body.pageId,
    business: body.business || body.selectedBusiness || {},
    brand: body.brand || {},
    objective: body.objective || body.prompt || "",
    platform: body.platform || "facebook"
  };

  return NextResponse.json({
    success: true,
    production
  });
}
