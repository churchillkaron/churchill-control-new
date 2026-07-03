import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  listFinancePermissions,
  listFinanceRoles,
  listUserFinanceRoles,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

export async function getFinanceSecurityOverview() {
  const [
    audits,
    approvals,
    shifts,
    roles,
    permissions,
    userRoles,
  ] = await Promise.all([
    supabaseAdmin
      .from("audit_logs")
      .select("*"),

    supabaseAdmin
      .from("management_approvals")
      .select("*"),

    supabaseAdmin
      .from("pos_shifts")
      .select("*"),

    listFinanceRoles(),
    listFinancePermissions(),
    listUserFinanceRoles(),
  ]);

  const pendingApprovals =
    (approvals.data || []).filter(
      (approval) => approval.status !== "APPROVED"
    ).length;

  const activeShifts =
    (shifts.data || []).filter(
      (shift) => shift.status === "OPEN"
    ).length;

  return {
    audit_events: (audits.data || []).length,
    roles: roles.length,
    permissions: permissions.length,
    user_role_assignments: userRoles.length,
    pending_approvals: pendingApprovals,
    active_sessions: activeShifts,
    security_status: "SECURE",
  };
}
