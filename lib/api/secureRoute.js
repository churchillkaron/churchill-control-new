import { NextResponse } from "next/server";

import requireAuth from "@/lib/auth/requireAuth";

export default function secureRoute(handler) {

  return async (req) => {

    try {

      const auth =
        await requireAuth();

      if (
        !auth?.authenticated
      ) {

        return NextResponse.json(
          {
            success: false,
            error:
              "UNAUTHORIZED",
          },
          {
            status: 401,
          }
        );
      }

      return await handler(
        req,
        auth
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
