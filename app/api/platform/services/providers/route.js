export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { resolveOrganizationProvider } from "@/lib/platform/service-runtime/services/resolver/OrganizationServiceResolver";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const result = await resolveOrganizationProvider({
      organization_id:
        searchParams.get("organization_id") ||
        searchParams.get("organizationId"),
      category_id: searchParams.get("category_id"),
      service_id: searchParams.get("service_id"),
      provider_id: searchParams.get("provider_id"),
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
