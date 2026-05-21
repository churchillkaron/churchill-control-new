import { NextResponse } from "next/server";

import secureRoute from "@/lib/api/secureRoute";

export const dynamic =
  "force-dynamic";

const handler =
  secureRoute(
    async (
      req,
      auth
    ) => {

      return NextResponse.json({
        success: true,
        authenticated: true,
        user:
          auth.user,
      });
    }
  );

export async function GET(req) {
  return handler(req);
}
