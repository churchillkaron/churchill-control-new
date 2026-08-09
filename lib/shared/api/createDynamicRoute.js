import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function validateOrganization(req) {
  const organizationId = req.nextUrl.searchParams.get(
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
