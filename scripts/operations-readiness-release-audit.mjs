import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = Object.freeze({
  readinessService: "lib/operations/readiness/OperationsReadinessService.js",
  readinessRoute: "app/api/operations/readiness/route.js",
  readinessHook: "lib/operations/readiness/useOperationsReadiness.js",
  workspaceHub: "components/workspace/operations/OperationsWorkspaceHub.jsx",
  atomicExecutor: "lib/operations/runtime/AtomicOperationsCommandExecution.js",
  ownerBackfill: "supabase/migrations/20260728233000_operations_owner_admin_backfill.sql",
});

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing Operations readiness file: ${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireIncludes(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${label} is missing required contract: ${value}`);
    }
  }
}

function requireExcludes(source, values, label) {
  for (const value of values) {
    if (source.includes(value)) {
      throw new Error(`${label} contains forbidden contract: ${value}`);
    }
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, read(file)]),
);

requireIncludes(source.readinessService, [
  "REQUIRED_TABLES",
  "operations_records",
  "operations_command_ledger",
  "operations_event_outbox",
  "operations_events",
  "operations_roles",
  "operations_role_permissions",
  "user_operations_roles",
  "execute_operations_command",
  "get_operations_event_delivery_health",
  "capability_catalogue",
  "current_user_view_access",
  "blocking_failures",
  "warnings",
], "Operations readiness service");

requireExcludes(source.readinessService, [
  'checkRpc("publish_operations_event_batch"',
], "Operations read-only readiness service");

requireIncludes(source.readinessRoute, [
  "resolveOperationsRequestContext",
  "authorize: false",
  "getOperationsReadiness",
  "status: readiness.ok ? 200 : 503",
], "Operations readiness API");

requireIncludes(source.readinessHook, [
  "useOperationsReadiness",
  "/api/operations/readiness?",
  'cache: "no-store"',
  "blocking_failures",
  "refresh: load",
], "Operations readiness hook");

requireIncludes(source.workspaceHub, [
  "useOperationsReadiness",
  "Kernel healthy",
  "Kernel degraded",
  "Kernel unavailable",
  "blocking_failures",
  "Recheck",
], "Operations readiness UI");

requireIncludes(source.atomicExecutor, [
  "created_by: actorId",
  "updated_by: actorId",
  "_operations_lifecycle",
], "Operations actor attribution");
requireExcludes(source.atomicExecutor, [
  "created_by: payload?.created_by || actorId",
], "Operations actor spoofing protection");

requireIncludes(source.ownerBackfill, [
  "OPERATIONS_ADMIN",
  "operations.*",
  "organization_users",
  "staff_accounts",
  "on conflict (organization_id, user_id, role_id)",
  "revoked_at = null",
], "Operations owner administrator backfill");

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, ["tenant_id", "tenantId"], `Operations readiness ${label}`);
}

console.log("OPERATIONS_READINESS_RELEASE_AUDIT=PASS");
console.log("OPERATIONS_READINESS=READ_ONLY_RUNTIME_DIAGNOSTICS");
console.log("OPERATIONS_OWNER_ACCESS=DURABLE_AND_SELF_HEALING");
console.log("OPERATIONS_ACTOR_ATTRIBUTION=AUTHENTICATED_ACTOR_ONLY");
console.log("OPERATIONS_HUB_FAILURE_STATE=EXPLICIT_NOT_EMPTY");
