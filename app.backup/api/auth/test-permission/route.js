export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import securePermissionRoute from "@/lib/api/securePermissionRoute";

const handler =
  securePermissionRoute(
    async (
      req,
      auth
    ) => {

      return NextResponse.json({
        success: true,
        role:
          auth.role,
        tenant_id:
          auth.tenant_id,
      });
    },
    "manage_finance"
  );

export async function GET(req) {
  return handler(req);
}