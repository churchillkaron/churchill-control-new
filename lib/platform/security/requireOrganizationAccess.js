import { buildAccessRuntime } from "@/lib/platform/runtime/buildAccessRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";

export async function requireOrganizationAccess({
  organizationId,
  userEmail,
}) {

  const user =
    await getServerCurrentUser();

  const email =
    userEmail ||
    user?.email ||
    null;

  if (!email) {
    return {
      success: false,
      error: "Unauthorized",
    };
  }

  if (!organizationId) {
    return {
      success: false,
      error: "Missing organizationId",
    };
  }

  const access =
    await buildAccessRuntime({
      userEmail: email,
    });

  if (!access.success) {
    return access;
  }

  const allowed =
    access.isSuperAdmin ||
    access.memberships.some(
      membership =>
        membership.organization_id ===
        organizationId
    );

  if (!allowed) {
    return {
      success: false,
      error: "Organization access denied",
    };
  }

  const { data: organization } =
    await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .maybeSingle();

  return {
    success: true,
    access,
    staff: access.staff || null,
    organization,
    organizationId,
    role: access.role || null,
    permissions: access.permissions || [],
  };
}
