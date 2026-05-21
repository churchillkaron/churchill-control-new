import {
  requireAuth,
} from "@/lib/shared/auth";

export default async function secureRoute(
  handler
) {

  return async (
    request,
    context
  ) => {

    const user =
      await requireAuth(
        request
      );

    return handler(
      request,
      context,
      user
    );

  };

}
