import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CANONICAL_OPERATIONS_CAPABILITY_CATALOG } from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";
import { developerCapabilityCatalog } from "@/lib/developer/DeveloperCapabilityContractRuntime";
import {
  OPERATIONS_ACTIONS,
  resolveOperationsCommandAction,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";

export const DEVELOPER_ROLES = new Set([
  "OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN",
  "ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN","DEVELOPER","INTEGRATOR","PARTNER",
]);

const DEVELOPER_SECURITY_ROLES = new Set([
  "OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN",
]);

function normalizedPermission(value) {
  return String(value || "").trim().toLowerCase();
}

function permissionCovers(granted, requested) {
  const g = normalizedPermission(granted);
  const r = normalizedPermission(requested);
  if (!g || !r) return false;
  if (g === "*" || g === r) return true;
  if (g.endsWith(".*")) return r.startsWith(g.slice(0, -1));
  return false;
}

export function hasDeveloperPermission(access = {}, required = "") {
  const permissions = Array.isArray(access.permissions) ? access.permissions : [];
  return permissions.some((permission) => permissionCovers(permission, required));
}

export function canManageDeveloperSecurity(access = {}) {
  if (DEVELOPER_SECURITY_ROLES.has(String(access.role || "").trim().toUpperCase())) return true;
  const permissions = Array.isArray(access.permissions) ? access.permissions : [];
  return permissions.some((permission) => permissionCovers(permission, "developer.security.manage"));
}

export function validateDeveloperCredentialScopes(access = {}, requestedScopes = []) {
  const scopes = [...new Set((Array.isArray(requestedScopes) ? requestedScopes : [])
    .map(normalizedPermission)
    .filter(Boolean))].slice(0, 64);
  const normalized = scopes.length ? scopes : ["operations.view"];
  const validShape = normalized.every((scope) =>
    /^operations(?:\.[a-z0-9-]+)*(?:\.\*)?$/.test(scope)
  );
  if (!validShape) return { success: false, error: "Invalid developer credential scope" };

  if (canManageDeveloperSecurity(access)) {
    return { success: true, scopes: normalized };
  }

  const creatorPermissions = Array.isArray(access.permissions) ? access.permissions : [];
  const allowed = normalized.every((scope) =>
    creatorPermissions.some((permission) => permissionCovers(permission, scope))
  );
  if (!allowed) return { success: false, error: "Credential scope exceeds creator authority" };
  return { success: true, scopes: normalized };
}

export function canManageDeveloperWebhooks(access = {}) {
  return canManageDeveloperSecurity(access) || hasDeveloperPermission(access, "developer.webhooks.manage");
}

const GLOBAL_DEVELOPER_OPERATION_SCOPES = Object.freeze([
  "operations.view","operations.create","operations.update","operations.execute",
  "operations.control","operations.audit","operations.events.manage","operations.import",
  "operations.ai","operations.manage","operations.administer",
]);

function capabilityActions(capability) {
  const actions = new Set([OPERATIONS_ACTIONS.VIEW]);
  for (const command of capability?.commands || []) {
    actions.add(resolveOperationsCommandAction(command));
  }
  return [...actions];
}

export function developerCredentialScopeCatalog(access = {}) {
  const entries = [];
  const seen = new Set();

  const add = (entry) => {
    const scope = String(entry?.scope || "").trim().toLowerCase();
    if (!scope || seen.has(scope)) return;
    if (!canManageDeveloperSecurity(access) && !hasDeveloperPermission(access, scope)) return;
    seen.add(scope);
    entries.push({ ...entry, scope });
  };

  for (const scope of GLOBAL_DEVELOPER_OPERATION_SCOPES) {
    add({
      scope,
      kind: "global",
      label: scope.replace("operations.", ""),
      description: "Applies across every Operations capability allowed by this action.",
    });
  }

  const groups = [...new Set(CANONICAL_OPERATIONS_CAPABILITY_CATALOG.map((capability) => capability.group))]
    .filter(Boolean)
    .sort();

  for (const group of groups) {
    const capabilities = CANONICAL_OPERATIONS_CAPABILITY_CATALOG.filter((capability) => capability.group === group);
    const actions = new Set(capabilities.flatMap(capabilityActions));
    add({
      scope: `operations.${group}.*`,
      kind: "group",
      group,
      label: `${group} · all actions`,
      description: `All governed Operations actions in the ${group} group.`,
    });
    for (const action of [...actions].sort()) {
      add({
        scope: `operations.${group}.${action}`,
        kind: "group",
        group,
        action,
        label: `${group} · ${action}`,
        description: `${action} authority for capabilities in the ${group} group.`,
      });
    }
  }

  for (const capability of CANONICAL_OPERATIONS_CAPABILITY_CATALOG) {
    add({
      scope: `operations.${capability.id}.*`,
      kind: "capability",
      group: capability.group,
      capability_id: capability.id,
      capability_name: capability.name,
      label: `${capability.name} · all actions`,
      description: `All governed actions for ${capability.name} only.`,
    });
    for (const action of capabilityActions(capability).sort()) {
      add({
        scope: `operations.${capability.id}.${action}`,
        kind: "capability",
        group: capability.group,
        capability_id: capability.id,
        capability_name: capability.name,
        action,
        label: `${capability.name} · ${action}`,
        description: `${action} authority for ${capability.name} only.`,
      });
    }
  }

  return entries;
}

export function availableDeveloperCredentialScopes(access = {}) {
  return developerCredentialScopeCatalog(access).map((entry) => entry.scope);
}

export function isReadOnlyDeveloperCredentialScope(scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  return normalized === "operations.view" || normalized.endsWith(".view");
}

export function validateDeveloperEnvironmentCredentialScopes({
  environmentKey,
  scopes = [],
} = {}) {
  const key = String(environmentKey || "").trim().toLowerCase();
  if (key === "production") return { success: true };

  const unsafe = (Array.isArray(scopes) ? scopes : [])
    .map((scope) => String(scope || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((scope) => !isReadOnlyDeveloperCredentialScope(scope));

  if (unsafe.length) {
    return {
      success: false,
      status: 400,
      error: "Development and staging credentials are read-only until an isolated sandbox data plane is configured",
      disallowed_scopes: unsafe,
    };
  }
  return { success: true };
}

export function requireProductionDeveloperAuthority(access = {}, environmentKey = "") {
  if (String(environmentKey || "").trim().toLowerCase() !== "production") {
    return { success: true };
  }
  return canManageDeveloperSecurity(access)
    ? { success: true }
    : { success: false, status: 403, error: "Production developer security authority required" };
}

export function resolveDeveloperCredentialExpiry({
  environmentKey = "development",
  expiresAt = null,
  expiresInDays = null,
  now = Date.now(),
} = {}) {
  const environment = String(environmentKey || "development").trim().toLowerCase();
  const production = environment === "production";
  const defaultDays = production ? 30 : 90;
  const maxDays = production ? 90 : 365;
  let target;

  if (expiresAt) {
    target = new Date(expiresAt);
  } else {
    const requestedDays = Number(expiresInDays);
    const days = Number.isFinite(requestedDays) && requestedDays > 0
      ? requestedDays
      : defaultDays;
    target = new Date(Number(now) + days * 24 * 60 * 60 * 1000);
  }

  if (Number.isNaN(target.getTime())) {
    return { success: false, status: 400, error: "Credential expiry is invalid" };
  }
  const minimum = Number(now) + 5 * 60 * 1000;
  if (target.getTime() <= minimum) {
    return { success: false, status: 400, error: "Credential expiry must be in the future" };
  }
  const maximum = Number(now) + maxDays * 24 * 60 * 60 * 1000;
  if (target.getTime() > maximum) {
    return {
      success: false,
      status: 400,
      error: production
        ? "Production credentials cannot exceed 90 days"
        : "Developer credentials cannot exceed 365 days",
    };
  }
  return {
    success: true,
    expires_at: target.toISOString(),
    default_days: defaultDays,
    max_days: maxDays,
  };
}


export async function requireDeveloperPortalAccess({ organizationId, request } = {}) {
  const id = String(organizationId || "").trim();
  if (!id) return { success:false, status:400, error:"Missing organizationId", organizationId:id };

  const staffAccess = await requireOrganizationAccess({ organizationId: id, request }).catch(() => ({ success: false }));
  const staffRole = String(staffAccess?.role || "").trim().toUpperCase();
  if (staffAccess?.success && DEVELOPER_ROLES.has(staffRole)) {
    return {
      ...staffAccess,
      success:true,
      role:staffRole,
      organizationId:staffAccess.organizationId || id,
      externalDeveloper:false,
    };
  }

  const user = await getServerCurrentUser();
  if (!user?.id) {
    return {
      ...staffAccess,
      success:false,
      status: staffAccess?.status || 401,
      error: staffAccess?.error || "Authentication required",
      organizationId:id,
    };
  }

  const { data: external, error } = await supabaseAdmin
    .from("developer_portal_access")
    .select("id,organization_id,auth_user_id,email,name,role,permissions,status")
    .eq("organization_id", id)
    .eq("auth_user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    return { success:false, status:500, error:error.message, organizationId:id };
  }
  const externalRole = String(external?.role || "").trim().toUpperCase();
  if (!external || !DEVELOPER_ROLES.has(externalRole)) {
    return { success:false, status:403, error:"Developer access required", organizationId:id };
  }

  const permissions = Array.isArray(external.permissions) ? external.permissions : ["operations.view"];
  return {
    success:true,
    status:200,
    user:{ id:user.id, email:user.email || external.email || null },
    userId:user.id,
    userEmail:user.email || external.email || null,
    organizationId:id,
    organization_id:id,
    organization:{ id },
    role:externalRole,
    permissions,
    staff:null,
    membership:null,
    externalDeveloper:true,
    externalDeveloperAccessId:external.id,
    access:{
      authenticated:true,
      externalDeveloper:true,
      externalDeveloperAccessId:external.id,
      userId:user.id,
      userEmail:user.email || external.email || null,
      staffAccountId:null,
      organizationUserId:null,
      role:externalRole,
      permissions,
    },
  };
}

export function developerWebhookEventCatalog() {
  const entries = [{
    event_type: "developer.test",
    kind: "test",
    group: "developer",
    capability_id: null,
    capability_name: "Developer test",
    command: "test",
    label: "Developer test event",
    description: "Explicit connectivity and signature-verification test event.",
  }];

  for (const capability of CANONICAL_OPERATIONS_CAPABILITY_CATALOG) {
    for (const command of capability.commands || []) {
      entries.push({
        event_type: `operations.${capability.id}.${command}`,
        kind: "operations",
        group: capability.group,
        capability_id: capability.id,
        capability_name: capability.name,
        command,
        label: `${capability.name} · ${command}`,
        description: `Committed ${capability.name} event after the governed ${command} command.`,
      });
    }
  }

  return entries;
}

export function validateDeveloperWebhookEventTypes({
  environmentKey,
  eventTypes,
} = {}) {
  const environment = String(environmentKey || "").trim().toLowerCase();
  const requested = [...new Set((Array.isArray(eventTypes) ? eventTypes : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))].slice(0, 64);
  const normalized = requested.length ? requested : ["developer.test"];

  if (environment !== "production") {
    if (normalized.some((eventType) => eventType !== "developer.test")) {
      return {
        success: false,
        status: 400,
        error: "Development and staging webhooks accept developer.test only",
      };
    }
    return { success: true, event_types: ["developer.test"] };
  }

  const allowed = new Set(developerWebhookEventCatalog().map((entry) => entry.event_type));
  const invalid = normalized.filter((eventType) => eventType !== "*" && !allowed.has(eventType));
  if (invalid.length) {
    return {
      success: false,
      status: 400,
      error: "Unsupported Developer webhook event type",
      invalid_event_types: invalid,
    };
  }

  return { success: true, event_types: normalized };
}

export { developerCapabilityCatalog };

export async function developerUsageSummary(organizationId, { externalDeveloper = false, userId = null } = {}) {
  const id = String(organizationId || "").trim();
  const base = { total: 0, success: 0, failed: 0, recent: [], schemaReady: true, scope: externalDeveloper ? "OWN_DEVELOPER_API" : "ORGANIZATION_SERVICE_USAGE" };
  if (!id) return base;
  try {
    if (externalDeveloper) {
      const actor = String(userId || "").trim();
      if (!actor) return base;
      const credentials = await supabaseAdmin
        .from("developer_api_credentials")
        .select("id")
        .eq("organization_id", id)
        .eq("created_by", actor);
      if (credentials.error) throw credentials.error;
      const credentialIds = (credentials.data || []).map((row) => row.id).filter(Boolean);
      if (!credentialIds.length) return base;
      const requests = await supabaseAdmin
        .from("developer_api_requests")
        .select("request_id,capability_id,method,command,status_code,latency_ms,error_code,created_at,environment_id,credential_id")
        .eq("organization_id", id)
        .in("credential_id", credentialIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (requests.error) throw requests.error;
      const rows = (requests.data || []).map((row) => ({
        id: row.request_id,
        created_at: row.created_at,
        capability: row.capability_id,
        operation: row.command || row.method,
        status: Number(row.status_code) < 400 ? "SUCCESS" : "FAILED",
        execution_status: Number(row.status_code) < 400 ? "SUCCESS" : "FAILED",
        provider: "Avantiqo Developer API",
        provider_model: null,
        model: null,
        customer_cost: 0,
        currency: "THB",
        latency_ms: row.latency_ms,
        error_code: row.error_code,
        environment_id: row.environment_id,
        credential_id: row.credential_id,
      }));
      return {
        total: rows.length,
        success: rows.filter((row) => row.status === "SUCCESS").length,
        failed: rows.filter((row) => row.status === "FAILED").length,
        recent: rows,
        schemaReady: true,
        scope: "OWN_DEVELOPER_API",
      };
    }

    const result = await supabaseAdmin
      .from("platform_service_usage")
      .select("*")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw result.error;
    const rows = result.data || [];
    return {
      total: rows.length,
      success: rows.filter((row) => String(row.status || row.execution_status || "").toUpperCase() === "SUCCESS").length,
      failed: rows.filter((row) => ["FAILED","ERROR"].includes(String(row.status || row.execution_status || "").toUpperCase())).length,
      recent: rows,
      schemaReady: true,
      scope: "ORGANIZATION_SERVICE_USAGE",
    };
  } catch (error) {
    return { ...base, schemaReady: false, error: error?.message || "Usage ledger unavailable." };
  }
}

export async function recordDeveloperSecurityAudit({
  organizationId,
  actorUserId = null,
  action,
  targetType,
  targetId = null,
  metadata = {},
}) {
  const safeMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
  const result = await supabaseAdmin.from("developer_security_audit_events").insert({
    organization_id: organizationId,
    actor_user_id: actorUserId,
    action: String(action || "").slice(0, 120),
    target_type: String(targetType || "").slice(0, 80),
    target_id: targetId || null,
    metadata: safeMetadata,
  });
  if (result.error) console.error("DEVELOPER_SECURITY_AUDIT_FAILED", result.error.message);
}

export async function developerSecurityActivity(organizationId) {
  const id = String(organizationId || "").trim();
  if (!id) return [];
  const result = await supabaseAdmin
    .from("developer_security_audit_events")
    .select("id,actor_user_id,action,target_type,target_id,metadata,created_at")
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  return result.error ? [] : (result.data || []);
}

export async function developerEnvironmentQuotaSummary(organizationId, { externalDeveloper = false, userId = null } = {}) {
  const id = String(organizationId || "").trim();
  if (!id) return [];

  const environments = await supabaseAdmin
    .from("developer_environments")
    .select("id,environment_key,name,status,requests_per_minute,monthly_request_limit,max_active_credentials,max_active_webhooks")
    .eq("organization_id", id)
    .order("created_at", { ascending: true });
  if (environments.error) return [];

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthKey = monthStart.toISOString().slice(0, 10);

  const usage = await supabaseAdmin
    .from("developer_api_monthly_usage")
    .select("environment_id,request_count,month_start")
    .eq("organization_id", id)
    .eq("month_start", monthKey);
  const usageByEnvironment = new Map(
    (usage.data || []).map((row) => [row.environment_id, Number(row.request_count || 0)]),
  );

  const credentials = await supabaseAdmin
    .from("developer_api_credentials")
    .select("environment_id,status,revoked_at,expires_at,created_by")
    .eq("organization_id", id)
    .eq("status", "ACTIVE")
    .is("revoked_at", null);
  const webhooks = await supabaseAdmin
    .from("developer_webhook_endpoints")
    .select("environment_id,status,created_by")
    .eq("organization_id", id)
    .eq("status", "ACTIVE");

  return (environments.data || []).map((environment) => {
    const requestCount = usageByEnvironment.get(environment.id) || 0;
    const monthlyLimit = environment.monthly_request_limit == null
      ? null
      : Number(environment.monthly_request_limit);
    return {
      ...environment,
      request_count: requestCount,
      monthly_remaining: monthlyLimit == null ? null : Math.max(0, monthlyLimit - requestCount),
      active_credentials: (credentials.data || []).filter((row) => (
        row.environment_id === environment.id &&
        (!externalDeveloper || row.created_by === userId) &&
        (!row.expires_at || new Date(row.expires_at).getTime() > Date.now())
      )).length,
      active_webhooks: (webhooks.data || []).filter((row) => (
        row.environment_id === environment.id &&
        (!externalDeveloper || row.created_by === userId)
      )).length,
      access_scope: externalDeveloper ? "OWN_DEVELOPER_IDENTITY" : "ORGANIZATION",
    };
  });
}

export async function developerIdempotencyHealth(organizationId) {
  const id = String(organizationId || "").trim();
  if (!id) return { in_progress: 0, stale: 0, oldest_started_at: null };

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [inProgress, stale] = await Promise.all([
    supabaseAdmin
      .from("developer_api_idempotency")
      .select("id,created_at", { count: "exact", head: false })
      .eq("organization_id", id)
      .eq("state", "IN_PROGRESS")
      .order("created_at", { ascending: true })
      .limit(1),
    supabaseAdmin
      .from("developer_api_idempotency")
      .select("id,created_at", { count: "exact", head: true })
      .eq("organization_id", id)
      .eq("state", "IN_PROGRESS")
      .lt("created_at", cutoff),
  ]);

  return {
    in_progress: Number(inProgress.count || 0),
    stale: Number(stale.count || 0),
    oldest_started_at: inProgress.data?.[0]?.created_at || null,
  };
}

export async function developerApiRequestSummary(organizationId, { externalDeveloper = false, userId = null } = {}) {
  const id = String(organizationId || "").trim();
  if (!id) return { total: 0, recent: [], success: 0, failed: 0 };
  let credentialIds = null;
  if (externalDeveloper) {
    const actor = String(userId || "").trim();
    if (!actor) return { total:0, recent:[], success:0, failed:0, scope:"OWN_DEVELOPER_API" };
    const credentials = await supabaseAdmin
      .from("developer_api_credentials")
      .select("id")
      .eq("organization_id", id)
      .eq("created_by", actor);
    if (credentials.error) return { total:0, recent:[], success:0, failed:0, error:credentials.error.message, scope:"OWN_DEVELOPER_API" };
    credentialIds = (credentials.data || []).map((row) => row.id).filter(Boolean);
    if (!credentialIds.length) return { total:0, recent:[], success:0, failed:0, scope:"OWN_DEVELOPER_API" };
  }
  let query = supabaseAdmin
    .from("developer_api_requests")
    .select("request_id,capability_id,method,command,status_code,latency_ms,error_code,idempotency_key,created_at,environment_id,credential_id")
    .eq("organization_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (credentialIds) query = query.in("credential_id", credentialIds);
  const result = await query;
  if (result.error) {
    return { total: 0, recent: [], success: 0, failed: 0, error: result.error.message };
  }
  const rows = result.data || [];
  return {
    total: rows.length,
    recent: rows,
    success: rows.filter((row) => Number(row.status_code) < 400).length,
    failed: rows.filter((row) => Number(row.status_code) >= 400).length,
    scope: externalDeveloper ? "OWN_DEVELOPER_API" : "ORGANIZATION",
  };
}


export async function developerOperationalHealthSummary(organizationId) {
  const id = String(organizationId || "").trim();
  const empty = {
    request_count: 0,
    success_rate: 100,
    p95_latency_ms: 0,
    auth_failures: 0,
    permission_failures: 0,
    conflict_failures: 0,
    throttled: 0,
    server_failures: 0,
    webhook_failed: 0,
    webhook_retrying: 0,
    webhook_exhausted: 0,
    projection_failed: 0,
    projection_dead_letter: 0,
    status: "HEALTHY",
  };
  if (!id) return empty;

  const [requests, deliveries, projections] = await Promise.all([
    supabaseAdmin
      .from("developer_api_requests")
      .select("status_code,latency_ms,error_code,created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("developer_webhook_deliveries")
      .select("status,attempt,response_status,error,created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("developer_operations_webhook_projections")
      .select("status,attempt,last_error,updated_at")
      .eq("organization_id", id)
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  const requestRows = requests.data || [];
  const deliveryRows = deliveries.data || [];
  const projectionRows = projections.data || [];
  const latencies = requestRows
    .map((row) => Number(row.latency_ms))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const p95Index = latencies.length
    ? Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
    : 0;
  const p95Latency = latencies.length ? latencies[p95Index] : 0;
  const successes = requestRows.filter((row) => Number(row.status_code) < 400).length;
  const successRate = requestRows.length
    ? Math.round((successes / requestRows.length) * 1000) / 10
    : 100;

  const summary = {
    request_count: requestRows.length,
    success_rate: successRate,
    p95_latency_ms: p95Latency,
    auth_failures: requestRows.filter((row) => Number(row.status_code) === 401).length,
    permission_failures: requestRows.filter((row) => Number(row.status_code) === 403).length,
    conflict_failures: requestRows.filter((row) => Number(row.status_code) === 409).length,
    throttled: requestRows.filter((row) => Number(row.status_code) === 429).length,
    server_failures: requestRows.filter((row) => Number(row.status_code) >= 500).length,
    webhook_failed: deliveryRows.filter((row) => row.status === "FAILED").length,
    webhook_retrying: deliveryRows.filter((row) => row.status === "RETRYING").length,
    webhook_exhausted: deliveryRows.filter((row) => row.status === "FAILED" && Number(row.attempt || 0) >= 20).length,
    projection_failed: projectionRows.filter((row) => row.status === "FAILED").length,
    projection_dead_letter: projectionRows.filter((row) => row.status === "DEAD_LETTER").length,
  };

  const critical = summary.server_failures > 0 ||
    summary.webhook_exhausted > 0 ||
    summary.projection_dead_letter > 0;
  const degraded = critical ||
    summary.success_rate < 98 ||
    summary.throttled > 0 ||
    summary.webhook_failed > 0 ||
    summary.projection_failed > 0;

  return {
    ...summary,
    status: critical ? "ATTENTION" : degraded ? "DEGRADED" : "HEALTHY",
  };
}

export async function developerAttentionSummary(organizationId) {
  const id = String(organizationId || "").trim();
  if (!id) {
    return {
      status: "SETUP",
      active_environments: 0,
      usable_credentials: 0,
      active_webhooks: 0,
      recent_requests: 0,
      attention: [],
      next_action: null,
      recent_activity: [],
    };
  }

  const [quotas, health, readiness, credentials, requests, webhooks] = await Promise.all([
    developerEnvironmentQuotaSummary(id),
    developerOperationalHealthSummary(id),
    developerReadinessSummary(id),
    supabaseAdmin
      .from("developer_api_credentials")
      .select("id,name,environment_id,status,revoked_at,expires_at,last_used_at,created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("developer_api_requests")
      .select("request_id,capability_id,method,command,status_code,error_code,latency_ms,created_at,environment_id")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("developer_webhook_endpoints")
      .select("id,name,environment_id,status,event_types,created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const now = Date.now();
  const credentialRows = credentials.data || [];
  const usableCredentials = credentialRows.filter((row) => (
    row.status === "ACTIVE" &&
    !row.revoked_at &&
    (!row.expires_at || new Date(row.expires_at).getTime() > now)
  ));
  const expiringSoon = usableCredentials
    .map((row) => ({
      ...row,
      days_remaining: row.expires_at
        ? Math.ceil((new Date(row.expires_at).getTime() - now) / (24 * 60 * 60 * 1000))
        : null,
    }))
    .filter((row) => row.days_remaining !== null && row.days_remaining <= 14)
    .sort((a, b) => a.days_remaining - b.days_remaining);

  const webhookRows = (webhooks.data || []).filter((row) => row.status === "ACTIVE");
  const requestRows = requests.data || [];
  const activeEnvironments = (quotas || []).filter((row) => row.status === "ACTIVE");
  const attention = [];

  const addAttention = (item) => {
    if (!item?.title) return;
    attention.push({
      severity: item.severity || "info",
      title: item.title,
      detail: item.detail || "",
      href: item.href || "/logs",
      action: item.action || "Open",
    });
  };

  if (!usableCredentials.length) {
    addAttention({
      severity: "high",
      title: "No usable machine credential",
      detail: "Create a least-privilege credential before integrating from an external system.",
      href: "/credentials",
      action: "Create credential",
    });
  }

  for (const credential of expiringSoon.slice(0, 3)) {
    addAttention({
      severity: credential.days_remaining <= 3 ? "high" : "medium",
      title: `${credential.name || "Credential"} expires in ${Math.max(0, credential.days_remaining)} day${credential.days_remaining === 1 ? "" : "s"}`,
      detail: credential.last_used_at
        ? `Last used ${new Date(credential.last_used_at).toISOString()}.`
        : "This credential has never been used.",
      href: "/credentials",
      action: "Rotate safely",
    });
  }

  if (health.server_failures > 0) {
    addAttention({
      severity: "high",
      title: `${health.server_failures} recent Developer API server failure${health.server_failures === 1 ? "" : "s"}`,
      detail: "Preserve request IDs and inspect the runtime before retrying business mutations.",
      href: "/logs",
      action: "Inspect failures",
    });
  }

  if (health.projection_dead_letter > 0 || health.webhook_exhausted > 0) {
    addAttention({
      severity: "high",
      title: "Webhook delivery requires intervention",
      detail: `${health.projection_dead_letter} dead-lettered projection · ${health.webhook_exhausted} exhausted delivery${health.webhook_exhausted === 1 ? "" : "ies"}.`,
      href: "/webhooks",
      action: "Open webhooks",
    });
  } else if (health.webhook_failed > 0 || health.webhook_retrying > 0 || health.projection_failed > 0) {
    addAttention({
      severity: "medium",
      title: "Webhook delivery is degraded",
      detail: `${health.webhook_failed} failed · ${health.webhook_retrying} retrying · ${health.projection_failed} projection failures.`,
      href: "/webhooks",
      action: "Review delivery",
    });
  }

  if (health.throttled > 0) {
    addAttention({
      severity: "medium",
      title: `${health.throttled} recent request${health.throttled === 1 ? "" : "s"} throttled`,
      detail: "Check per-minute and monthly environment capacity before retrying.",
      href: "/usage",
      action: "Check capacity",
    });
  }

  if (health.permission_failures > 0) {
    addAttention({
      severity: "medium",
      title: `${health.permission_failures} recent permission failure${health.permission_failures === 1 ? "" : "s"}`,
      detail: "The token authenticated, but its scope did not permit the requested capability/action.",
      href: "/logs",
      action: "Inspect authorization",
    });
  }

  for (const quota of quotas || []) {
    const monthlyLimit = quota.monthly_request_limit == null ? null : Number(quota.monthly_request_limit);
    const monthlyPercent = monthlyLimit == null
      ? null
      : monthlyLimit <= 0
        ? 100
        : Math.round((Number(quota.request_count || 0) / monthlyLimit) * 100);
    const credentialPercent = Number(quota.max_active_credentials || 0) > 0
      ? Math.round((Number(quota.active_credentials || 0) / Number(quota.max_active_credentials)) * 100)
      : 100;
    const webhookPercent = Number(quota.max_active_webhooks || 0) > 0
      ? Math.round((Number(quota.active_webhooks || 0) / Number(quota.max_active_webhooks)) * 100)
      : 100;

    if (monthlyPercent !== null && monthlyPercent >= 80) {
      addAttention({
        severity: monthlyPercent >= 100 ? "high" : "medium",
        title: `${quota.name} monthly API capacity at ${Math.min(100, monthlyPercent)}%`,
        detail: monthlyLimit <= 0
          ? "Requests are disabled by this environment policy."
          : `${quota.monthly_remaining} monthly requests remain.`,
        href: "/usage",
        action: "Review usage",
      });
    }
    if (credentialPercent >= 80) {
      addAttention({
        severity: credentialPercent >= 100 ? "high" : "medium",
        title: `${quota.name} credential slots at ${Math.min(100, credentialPercent)}%`,
        detail: `${quota.active_credentials} of ${quota.max_active_credentials} active credential slots are in use.`,
        href: "/credentials",
        action: "Review credentials",
      });
    }
    if (webhookPercent >= 80) {
      addAttention({
        severity: webhookPercent >= 100 ? "high" : "medium",
        title: `${quota.name} webhook slots at ${Math.min(100, webhookPercent)}%`,
        detail: `${quota.active_webhooks} of ${quota.max_active_webhooks} active webhook slots are in use.`,
        href: "/webhooks",
        action: "Review endpoints",
      });
    }
  }

  const nextAction = readiness.steps.find((step) => !step.complete) || null;
  const recentActivity = requestRows.slice(0, 6).map((row) => ({
    id: row.request_id,
    capability_id: row.capability_id,
    operation: [row.method, row.command].filter(Boolean).join(" · "),
    status_code: row.status_code,
    error_code: row.error_code || null,
    latency_ms: row.latency_ms,
    created_at: row.created_at,
  }));

  const status = attention.some((item) => item.severity === "high")
    ? "ATTENTION"
    : attention.some((item) => item.severity === "medium")
      ? "DEGRADED"
      : readiness.production_ready
        ? "READY"
        : "SETUP";

  return {
    status,
    active_environments: activeEnvironments.length,
    usable_credentials: usableCredentials.length,
    active_webhooks: webhookRows.length,
    recent_requests: requestRows.length,
    attention: attention.slice(0, 8),
    next_action: nextAction,
    recent_activity: recentActivity,
  };
}

export async function developerReadinessSummary(organizationId) {
  const id = String(organizationId || "").trim();
  const empty = {
    score: 0,
    completed: 0,
    total: 8,
    steps: [],
    production_ready: false,
  };
  if (!id) return empty;

  const [environments, credentials, webhooks, requests, deliveries] = await Promise.all([
    supabaseAdmin
      .from("developer_environments")
      .select("id,environment_key,name,status")
      .eq("organization_id", id),
    supabaseAdmin
      .from("developer_api_credentials")
      .select("id,environment_id,status,revoked_at,expires_at,created_at")
      .eq("organization_id", id)
      .eq("status", "ACTIVE")
      .is("revoked_at", null),
    supabaseAdmin
      .from("developer_webhook_endpoints")
      .select("id,environment_id,status,event_types,created_at")
      .eq("organization_id", id)
      .eq("status", "ACTIVE"),
    supabaseAdmin
      .from("developer_api_requests")
      .select("request_id,environment_id,status_code,created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("developer_webhook_deliveries")
      .select("id,endpoint_id,event_type,status,created_at,delivered_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const envRows = environments.data || [];
  const now = Date.now();
  const usableCredentials = (credentials.data || []).filter((row) => (
    !row.expires_at || new Date(row.expires_at).getTime() > now
  ));
  const webhookRows = webhooks.data || [];
  const requestRows = requests.data || [];
  const deliveryRows = deliveries.data || [];

  const envByKey = new Map(envRows.map((row) => [row.environment_key, row]));
  const development = envByKey.get("development");
  const staging = envByKey.get("staging");
  const production = envByKey.get("production");

  const activeNonProduction = [development, staging].filter((row) => row?.status === "ACTIVE");
  const nonProductionIds = new Set(activeNonProduction.map((row) => row.id));
  const productionId = production?.id || null;

  const hasDevCredential = usableCredentials.some((row) => nonProductionIds.has(row.environment_id));
  const hasSuccessfulMachineRead = requestRows.some((row) => (
    nonProductionIds.has(row.environment_id) &&
    Number(row.status_code) >= 200 &&
    Number(row.status_code) < 400
  ));
  const devWebhookIds = new Set(
    webhookRows.filter((row) => nonProductionIds.has(row.environment_id)).map((row) => row.id),
  );
  const hasDevWebhook = devWebhookIds.size > 0;
  const hasSuccessfulWebhookTest = deliveryRows.some((row) => (
    devWebhookIds.has(row.endpoint_id) &&
    row.event_type === "developer.test" &&
    row.status === "DELIVERED"
  ));

  const hasProductionEnvironment = Boolean(production);
  const productionEnabled = production?.status === "ACTIVE";
  const hasProductionCredential = usableCredentials.some((row) => (
    productionId && row.environment_id === productionId
  ));
  const hasProductionWebhook = webhookRows.some((row) => (
    productionId &&
    row.environment_id === productionId &&
    Array.isArray(row.event_types) &&
    row.event_types.some((eventType) => eventType === "*" || eventType.startsWith("operations."))
  ));

  const steps = [
    {
      id: "sandbox_environment",
      label: "Create Development or Staging",
      detail: "Creates a safe read-only machine identity against the live organization plane.",
      href: "/environments",
      complete: activeNonProduction.length > 0,
    },
    {
      id: "machine_credential",
      label: "Create a read-only machine credential",
      detail: "Use least-privilege view scope first; the plaintext token is shown once.",
      href: "/credentials",
      complete: hasDevCredential,
    },
    {
      id: "first_machine_request",
      label: "Complete the first machine API request",
      detail: "Proves token, organization scope, capability authorization and API contract end-to-end.",
      href: "/api-explorer",
      complete: Boolean(hasDevCredential && hasSuccessfulMachineRead),
    },
    {
      id: "test_webhook",
      label: "Register a webhook endpoint",
      detail: "Development and Staging accept only the explicit developer.test event.",
      href: "/webhooks",
      complete: hasDevWebhook,
    },
    {
      id: "verify_webhook",
      label: "Deliver and verify a webhook test",
      detail: "Confirms destination reachability, signing secret and delivery evidence.",
      href: "/webhooks",
      complete: Boolean(hasDevWebhook && hasSuccessfulWebhookTest),
    },
    {
      id: "production_environment",
      label: "Create and enable Production",
      detail: "Production is created disabled and requires separate typed activation.",
      href: "/environments",
      complete: Boolean(hasProductionEnvironment && productionEnabled),
    },
    {
      id: "production_credential",
      label: "Create a bounded Production credential",
      detail: "Production credentials expire sooner and carry only explicitly selected authority.",
      href: "/credentials",
      complete: Boolean(productionEnabled && hasProductionCredential),
    },
    {
      id: "production_webhook",
      label: "Subscribe Production to committed Operations events",
      detail: "Select exact canonical event types or deliberately choose the wildcard.",
      href: "/webhooks",
      complete: Boolean(productionEnabled && hasProductionWebhook),
    },
  ];

  const completed = steps.filter((step) => step.complete).length;
  return {
    score: Math.round((completed / steps.length) * 100),
    completed,
    total: steps.length,
    steps,
    production_ready: Boolean(
      productionEnabled &&
      hasProductionCredential &&
      hasProductionWebhook
    ),
  };
}

export function developerGroups(catalog = developerCapabilityCatalog()) {
  const groups = {};
  for (const capability of catalog) {
    if (!groups[capability.group]) groups[capability.group] = [];
    groups[capability.group].push(capability);
  }
  return groups;
}
