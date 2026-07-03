import { NextResponse } from "next/server";

import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";

export async function GET(request) {
  const { searchParams } =
    new URL(request.url);

  const organizationId =
    searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId required" },
      { status: 400 }
    );
  }

  const categories =
    await OrganizationServiceRuntime.list(
      organizationId
    );

  return NextResponse.json({
    categories,
  });
}
