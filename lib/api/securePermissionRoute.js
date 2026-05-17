import { NextResponse } from "next/server";

import requireRole from "@/lib/auth/requireRole";

import checkPermission from "@/lib/auth/rbac/checkPermission";

export default function securePermissionRoute(
  handler,
  permission_key
) {

  return async function(req) {

    try {

      const auth =
        await requireRole({
          roles: [
            "owner",
            "admin",
            "manager",
            "accounting",
            "staff",
          ],
        });

      if (
        !auth.allowed
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

      const permission =
        await checkPermission({
          tenant_id:
            auth.tenant_id,
          role:
            auth.role,
          permission_key,
        });

      if (
        !permission.allowed
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
