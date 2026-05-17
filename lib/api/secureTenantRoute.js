import { NextResponse } from "next/server";

import requireTenantAccess from "@/lib/auth/requireTenantAccess";

export default function secureTenantRoute(
  handler
) {

  return async function(req) {

    try {

      const tenantId =
        req.headers.get(
          "x-tenant-id"
        );

      const auth =
        await requireTenantAccess(
          tenantId
        );

      if (
        !auth.allowed
      ) {

        return NextResponse.json(
          {
            success: false,
            error:
              "TENANT_FORBIDDEN",
          },
          {
            status: 403,
          }
        );
      }

      req.auth = auth;

      return await handler(
        req
      );

    } catch (error) {

      return NextResponse.json(
        {
          success: false,
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }
  };
}
