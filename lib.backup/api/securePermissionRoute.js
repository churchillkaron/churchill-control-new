import {
  requireRole,
} from "@/lib/shared/auth";

import {
  checkPermission,
} from "@/lib/shared/auth/checkPermission";

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

    if (
      permission &&
      !checkPermission(
        user,
        permission
      )
    ) {

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

    return handler(
      request,
      context,
      user
    );

  };

}
