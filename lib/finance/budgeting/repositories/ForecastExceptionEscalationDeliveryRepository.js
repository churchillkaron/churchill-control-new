import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_CASE_COLUMNS = [
  "id",
  "organization_id",
  "entity_id",
  "exception_type",
  "occurrence_key",
  "exception_title",
  "status",
  "assigned_to",
  "assigned_to_name",
  "due_date",
  "escalation_level",
  "escalation_reason",
  "escalation_changed_at",
  "escalation_revision",
].join(", ");

const INACTIVE_STATUSES = new Set([
  "INACTIVE",
  "DISABLED",
  "SUSPENDED",
  "TERMINATED",
  "ARCHIVED",
  "REVOKED",
]);

const OWNER_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER"]);

function activeStatus(value) {
  return !INACTIVE_STATUSES.has(String(value || "ACTIVE").trim().toUpperCase());
}

function userId(row = {}) {
  return row.auth_user_id || row.user_id || null;
}

export async function listForecastExceptionDeliveryOrganizations() {
  const { data, error } = await supabaseAdmin
    .from("finance_forecast_exception_cases")
    .select("organization_id")
    .neq("status", "RESOLVED")
    .limit(10000);

  if (error) throw error;
  return [...new Set((data || []).map(row => row.organization_id).filter(Boolean))];
}

export async function syncForecastExceptionEscalationsForDelivery({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_sync_forecast_exception_escalations",
    { p_organization_id: organizationId }
  );

  if (error) throw error;
  return data || null;
}

export async function listActiveForecastExceptionEscalations({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("finance_forecast_exception_cases")
    .select(ACTIVE_CASE_COLUMNS)
    .eq("organization_id", organizationId)
    .neq("status", "RESOLVED")
    .neq("escalation_level", "NONE")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listForecastEscalationManagers({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const [{ data: permissionRows, error: permissionError }, { data: membershipRows, error: membershipError }] = await Promise.all([
    supabaseAdmin
      .from("finance_permissions")
      .select("role_id")
      .eq("organization_id", organizationId)
      .eq("permission_key", "finance.accounting.manage"),
    supabaseAdmin
      .from("organization_users")
      .select("staff_account_id, role, status")
      .eq("organization_id", organizationId),
  ]);

  if (permissionError) throw permissionError;
  if (membershipError) throw membershipError;

  const activeMemberships = (membershipRows || []).filter(row => activeStatus(row.status));
  const staffIds = [...new Set(activeMemberships.map(row => row.staff_account_id).filter(Boolean))];
  if (!staffIds.length) return [];

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, user_id, name, email, active")
    .in("id", staffIds);

  if (staffError) throw staffError;

  const activeStaff = new Map(
    (staffRows || [])
      .filter(row => row.active !== false && userId(row))
      .map(row => [row.id, row])
  );

  const managerIds = new Set();
  const roleIds = [...new Set((permissionRows || []).map(row => row.role_id).filter(Boolean))];

  if (roleIds.length) {
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_finance_roles")
      .select("user_id")
      .eq("organization_id", organizationId)
      .in("role_id", roleIds);

    if (roleError) throw roleError;
    for (const row of roleRows || []) {
      const value = String(row.user_id || "").trim();
      if (value) managerIds.add(value);
    }
  }

  for (const membership of activeMemberships) {
    if (!OWNER_ROLES.has(String(membership.role || "").trim().toUpperCase())) continue;
    const staff = activeStaff.get(membership.staff_account_id);
    const value = userId(staff);
    if (value) managerIds.add(String(value));
  }

  const activeUsers = new Map();
  for (const staff of activeStaff.values()) {
    const value = userId(staff);
    if (!value) continue;
    activeUsers.set(String(value), {
      id: String(value),
      name: staff.name || staff.email || "Finance Manager",
    });
  }

  return [...managerIds]
    .map(id => activeUsers.get(id))
    .filter(Boolean)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

export async function deliverForecastExceptionEscalation({
  organizationId,
  caseId,
  escalationRevision,
  recipientUserId,
  recipientKind,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!caseId) throw new Error("caseId required");
  if (!Number.isFinite(Number(escalationRevision))) throw new Error("escalationRevision required");
  if (!recipientUserId) throw new Error("recipientUserId required");
  if (!recipientKind) throw new Error("recipientKind required");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_deliver_forecast_exception_escalation",
    {
      p_organization_id: organizationId,
      p_case_id: caseId,
      p_escalation_revision: Number(escalationRevision),
      p_recipient_user_id: recipientUserId,
      p_recipient_kind: recipientKind,
    }
  );

  if (error) throw error;
  return data || null;
}

export async function listForecastExceptionEscalationDeliveries({
  organizationId,
  caseIds = [],
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!caseIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("finance_forecast_exception_escalation_deliveries")
    .select("case_id, escalation_revision, escalation_level, recipient_user_id, recipient_kind, notification_id, delivered_at")
    .eq("organization_id", organizationId)
    .in("case_id", caseIds)
    .order("delivered_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}
