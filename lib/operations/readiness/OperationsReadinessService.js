import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CANONICAL_OPERATIONS_CAPABILITY_CATALOG } from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";
import {
  hasOperationsPermission,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";

const REQUIRED_TABLES = Object.freeze([
  "operations_records",
  "operations_command_ledger",
  "operations_event_outbox",
  "operations_events",
  "operations_roles",
  "operations_role_permissions",
  "user_operations_roles",
]);

function normaliseError(error) {
  return {
    code: String(error?.code || ""),
    message: String(error?.message || "Unknown error"),
  };
}

async function checkTable(table, organizationId) {
  let query = supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { count, error } = await query;

  return error
    ? { key: table, ok: false, error: normaliseError(error) }
    : { key: table, ok: true, count: count || 0 };
}

async function checkRpc(name, args) {
  const { error } = await supabaseAdmin.rpc(name, args);
  if (!error) return { key: name, ok: true };

  const code = String(error.code || "");
  const message = String(error.message || "");
  const exists = ![
    "42883",
    "PGRST202",
  ].includes(code) && !/could not find the function|does not exist/i.test(message);

  return exists
    ? { key: name, ok: true, probe_error: normaliseError(error) }
    : { key: name, ok: false, error: normaliseError(error) };
}

export async function getOperationsReadiness({ context } = {}) {
  const organizationId = context?.organization_id || null;
  const actorId = context?.actor_id || null;
  const permissions = context?.permissions || [];

  const tableChecks = await Promise.all(
    REQUIRED_TABLES.map((table) => checkTable(table, organizationId)),
  );

  const rpcChecks = await Promise.all([
    checkRpc("execute_operations_command", {
      p_organization_id: null,
      p_entity_id: null,
      p_period_id: null,
      p_capability_id: null,
      p_record_type: null,
      p_command: null,
      p_command_key: null,
      p_payload: {},
    }),
    checkRpc("get_operations_event_delivery_health", {
      p_organization_id: organizationId,
      p_entity_id: context?.entity_id || null,
      p_period_id: context?.period_id || null,
      p_dead_letter_limit: 1,
    }),
  ]);

  const roleTable = tableChecks.find((check) => check.key === "user_operations_roles");
  let actorAssignment = null;

  if (roleTable?.ok && organizationId && actorId) {
    const { data, error } = await supabaseAdmin
      .from("user_operations_roles")
      .select("id, role_id, assigned_at, revoked_at, operations_roles(role_code, role_name)")
      .eq("organization_id", organizationId)
      .eq("user_id", actorId)
      .is("revoked_at", null);

    actorAssignment = error
      ? { ok: false, error: normaliseError(error), assignments: [] }
      : { ok: true, assignments: data || [] };
  }

  const catalogueCount = CANONICAL_OPERATIONS_CAPABILITY_CATALOG.length;
  const canView = hasOperationsPermission({
    permissions,
    action: OPERATIONS_ACTIONS.VIEW,
  });
  const canAdminister = hasOperationsPermission({
    permissions,
    action: OPERATIONS_ACTIONS.ADMINISTER,
  });

  const checks = [
    ...tableChecks,
    ...rpcChecks,
    {
      key: "canonical_capability_catalogue",
      ok: catalogueCount >= 86,
      count: catalogueCount,
    },
    {
      key: "current_user_view_access",
      ok: canView,
    },
    {
      key: "current_user_admin_access",
      ok: canAdminister,
      advisory: true,
    },
    ...(actorAssignment
      ? [{
          key: "current_user_role_assignment",
          ok: actorAssignment.ok && actorAssignment.assignments.length > 0,
          advisory: canView,
          assignments: actorAssignment.assignments,
          error: actorAssignment.error,
        }]
      : []),
  ];

  const blockingFailures = checks.filter((check) => !check.ok && !check.advisory);
  const warnings = checks.filter((check) => !check.ok && check.advisory);

  return {
    ok: blockingFailures.length === 0,
    status: blockingFailures.length === 0
      ? warnings.length === 0 ? "healthy" : "degraded"
      : "unavailable",
    checked_at: new Date().toISOString(),
    organization_id: organizationId,
    capability_count: catalogueCount,
    checks,
    blocking_failures: blockingFailures,
    warnings,
  };
}

export default getOperationsReadiness;
