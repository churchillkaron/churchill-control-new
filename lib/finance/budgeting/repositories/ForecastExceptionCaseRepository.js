import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CASE_COLUMNS = [
  "id",
  "organization_id",
  "entity_id",
  "exception_type",
  "occurrence_key",
  "exception_severity",
  "exception_title",
  "exception_detail",
  "status",
  "assigned_to",
  "assigned_to_name",
  "due_date",
  "acknowledged_by",
  "acknowledged_by_name",
  "acknowledged_at",
  "resolved_by",
  "resolved_by_name",
  "resolved_at",
  "resolution_note",
  "escalation_level",
  "escalation_reason",
  "escalation_changed_at",
  "escalation_revision",
  "revision",
  "created_at",
  "updated_at",
].join(", ");

export async function listForecastExceptionCases({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("finance_forecast_exception_cases")
    .select(CASE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function syncForecastExceptionEscalations({ organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_sync_forecast_exception_escalations",
    { p_organization_id: organizationId }
  );

  if (error) throw error;
  return data || null;
}

export async function resolveForecastExceptionAssignee({ organizationId, userId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!userId) throw new Error("assignedTo required");

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id, status")
    .eq("organization_id", organizationId);

  if (membershipError) throw membershipError;

  const activeMembershipIds = (memberships || [])
    .filter(row => !["INACTIVE", "DISABLED", "SUSPENDED", "ARCHIVED", "REVOKED"].includes(String(row.status || "ACTIVE").trim().toUpperCase()))
    .map(row => row.staff_account_id)
    .filter(Boolean);

  let query = supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, name, email, active, active_organization_id")
    .eq("auth_user_id", userId)
    .eq("active", true);

  if (activeMembershipIds.length) {
    query = query.in("id", activeMembershipIds);
  } else {
    query = query.eq("active_organization_id", organizationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.auth_user_id) throw new Error("Invalid Finance assignee for organization");

  return {
    id: data.auth_user_id,
    name: data.name || data.email || "Finance User",
  };
}

export async function manageForecastExceptionCase(input = {}) {
  const { data, error } = await supabaseAdmin.rpc(
    "finance_manage_forecast_exception_case",
    {
      p_organization_id: input.organizationId,
      p_entity_id: input.entityId,
      p_exception_type: input.exceptionType,
      p_occurrence_key: input.occurrenceKey,
      p_exception_severity: input.exceptionSeverity,
      p_exception_title: input.exceptionTitle,
      p_exception_detail: input.exceptionDetail,
      p_evidence: input.evidence || [],
      p_recommended_action: input.recommendedAction || null,
      p_action: input.action,
      p_assigned_to: input.assignedTo || null,
      p_assigned_to_name: input.assignedToName || null,
      p_due_date: input.dueDate || null,
      p_resolution_note: input.resolutionNote || null,
      p_performed_by: input.performedBy || null,
      p_performed_by_name: input.performedByName || null,
    }
  );

  if (error) throw error;
  return data;
}
