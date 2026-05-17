import { NextResponse } from "next/server";

import secureRoleRoute from "@/lib/api/secureRoleRoute";

async function handler(req) {

  return NextResponse.json({
    success: true,
    role:
      req.auth.role,
    tenant_id:
      req.auth.tenant_id,
  });
}

const securedHandler =
  secureRoleRoute(
    handler,
    [
      "owner",
      "admin",
      "manager",
    ]
  );

export async function GET(req) {
  return securedHandler(req);
}
