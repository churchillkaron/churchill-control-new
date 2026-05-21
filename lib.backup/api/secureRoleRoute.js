import {
  requireRole,
} from "@/lib/shared/auth";

export default function secureRoleRoute({

  role,

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

    return handler(
      request,
      context,
      user
    );

  };

}
