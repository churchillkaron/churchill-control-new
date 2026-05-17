import requireAuth from "./requireAuth";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function requireRole({
  roles = [],
}) {
  const session =
    await requireAuth();

  if (
    !session?.authenticated
  ) {
    return {
      allowed: false,
      reason: "UNAUTHENTICATED",
    };
  }

  const userId =
    session.user.id;

  const {
    data: user,
  } = await supabaseAdmin
    .from("staff_accounts")
    .select("role, tenant_id")
    .eq("id", userId)
    .single();

  if (!user) {
    return {
      allowed: false,
      reason: "USER_NOT_FOUND",
    };
  }

  const allowed =
    roles.includes(
      user.role
    );

  return {
    allowed,
    role: user.role,
    tenant_id:
      user.tenant_id,
    user:
      session.user,
  };
}
