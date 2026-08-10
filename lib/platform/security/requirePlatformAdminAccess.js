import { requireAuth } from "@/lib/shared/auth/requireAuth";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ADMIN_ROLES = new Set([
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function denied(status, error) {
  return {
    success: false,
    status,
    error,
  };
}

export async function requirePlatformAdminAccess() {
  let user;

  try {
    user = await requireAuth();
  } catch {
    return denied(401, "Authentication required");
  }

  const { data: staffRows, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,email,role,active,auth_user_id")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .limit(1000);

  if (error) {
    return denied(500, "Platform administrator lookup failed");
  }

  const staff = (staffRows || []).find((row) =>
    PLATFORM_ADMIN_ROLES.has(normalizeRole(row.role)),
  );

  if (!staff) {
    return denied(403, "Platform administrator access required");
  }

  return {
    success: true,
    status: 200,
    user,
    staff,
    role: normalizeRole(staff.role),
  };
}
