import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import checkPermission from "@/lib/permissions/checkPermission";

export default function securePermissionRoute({
  role,
  permission,
  handler,
}) {
  return async (request, context) => {
    const staffContext = await resolveAuthenticatedStaffContext({
      request,
    });

    if (!staffContext.success) {
      return Response.json(
        {
          success: false,
          error: staffContext.error,
          code: staffContext.code,
          availableOrganizationIds:
            staffContext.availableOrganizationIds || [],
        },
        {
          status: staffContext.status || 403,
        }
      );
    }

    const resolvedRole = String(
      staffContext.role || staffContext.staff?.role || ""
    ).toUpperCase();

    if (
      role &&
      !["OWNER", "SUPER_ADMIN"].includes(resolvedRole) &&
      resolvedRole !== String(role).toUpperCase()
    ) {
      return Response.json(
        {
          success: false,
          error: "Forbidden",
        },
        {
          status: 403,
        }
      );
    }

    if (permission) {
      const result = await checkPermission({
        organizationId: staffContext.organizationId,
        user_id: staffContext.staff?.id,
        role: resolvedRole,
        permission_key: permission,
      });

      if (!result.allowed) {
        return Response.json(
          {
            success: false,
            error: "Permission denied",
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
      {
        ...staffContext.user,
        staff: staffContext.staff,
        organizationId: staffContext.organizationId,
        organization_id: staffContext.organizationId,
        role: resolvedRole,
      }
    );
  };
}
