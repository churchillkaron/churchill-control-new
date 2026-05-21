import {
  requireTenantAccess,
} from "@/lib/shared/auth";

export default async function secureTenantRoute(
  handler
) {

  return async (
    request,
    context
  ) => {

    const tenant =
      await requireTenantAccess(
        request
      );

    return handler(
      request,
      context,
      tenant
    );

  };

}
