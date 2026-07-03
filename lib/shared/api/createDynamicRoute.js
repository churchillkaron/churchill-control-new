import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function validateOrganization(req) {
  const organizationId =
    req.nextUrl.searchParams.get(
      "organizationId"
    );

  if (!organizationId) {
    return {
      error: NextResponse.json(
        {
          error:
            "organizationId required",
        },
        {
          status: 400,
        }
      ),
    };
  }

  return {
    organizationId,
  };
}

export function validateTenant(req) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');

  if (!tenantId) {
    return {
      error: {
        status: 400,
        message: "tenantId required"
      }
    };
  }

  return { tenantId };
}
