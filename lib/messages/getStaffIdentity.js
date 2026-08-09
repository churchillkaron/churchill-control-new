import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

export async function getStaffIdentity(request = null) {
  try {
    const context = await resolveAuthenticatedStaffContext({
      request,
    });

    if (!context.success) {
      return null;
    }

    return {
      ...context.staff,
      organization_id: context.organizationId,
      organizationId: context.organizationId,
      party_id: context.staff?.party_id || null,
      role: context.role || context.staff?.role || null,
      permissions: context.permissions || [],
    };
  } catch (error) {
    console.error("MESSAGE_IDENTITY_ERROR", error);
    return null;
  }
}
