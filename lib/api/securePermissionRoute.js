import {
  requireRole,
} from "@/lib/shared/auth";

import checkPermission
from "@/lib/permissions/checkPermission";

export default function securePermissionRoute({

  role,

  permission,

  handler,

}) {

  return async (
    request,
    context
  ) => {

    const user =
      await requireRole({

        request,

        role,

      });

    if (permission) {

      const result =
        await checkPermission({

          tenant_id:
            user.tenant_id,

          user_id:
            user.id,

          permission_key:
            permission,

        });

      if (!result.allowed) {

        return Response.json(
          {
            success: false,
            error:
              "Permission denied",
          },
          {
            status: 403,
          }
        );

      }

    }

    return handler(
      request,
      context,
      user
    );

  };

}
