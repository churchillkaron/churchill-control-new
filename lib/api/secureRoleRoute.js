import { NextResponse } from "next/server";

import requireRole from "@/lib/auth/requireRole";

export default function secureRoleRoute(
  handler,
  roles = []
) {

  return async function(req) {

    try {

      const auth =
        await requireRole({
          roles,
        });

      if (
        !auth.allowed
      ) {

        return NextResponse.json(
          {
            success: false,
            error:
              "FORBIDDEN",
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
