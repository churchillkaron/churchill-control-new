export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { bootstrapOrganizationServices } from "@/lib/platform/service-runtime/services/bootstrap/bootstrapOrganizationServices";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await bootstrapOrganizationServices({
      organization_id: body.organization_id || body.organizationId,
      industry_id: body.industry_id || body.industryId || "default",
      managed_by: body.managed_by || "avantiqo",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
