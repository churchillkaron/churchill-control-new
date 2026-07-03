export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { resolveOrganizationServices } from "@/lib/platform/service-runtime/services/resolver/OrganizationServiceResolver";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");

    const services = await resolveOrganizationServices({
      organization_id,
    });

    return NextResponse.json({
      services,
    });
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
