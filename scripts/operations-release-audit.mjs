import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  catalogue: "lib/operations/runtime/OperationsCapabilityCatalog.js",
  lifecyclePolicy: "lib/operations/runtime/OperationsLifecyclePolicy.js",
  runtime: "lib/operations/runtime/OperationsRuntime.js",
  atomicExecutor: "lib/operations/runtime/AtomicOperationsCommandExecution.js",
  serverApi: "lib/operations/api/createServerOperationsApi.js",
  apiController: "lib/operations/api/OperationsApiController.js",
  requestContext: "lib/operations/api/resolveOperationsRequestContext.js",
  repositories: "lib/operations/repositories/OperationsRepositoryRegistry.js",
  formSchemas: "lib/operations/forms/OperationsFormSchemaRegistry.js",
  commandSchemas: "lib/operations/forms/OperationsCommandSchemaRegistry.js",
  workspaceRegistry: "lib/operations/registry/OperationsWorkspaceRegistry.js",
  workspaceResolver: "lib/operations/registry/OperationsWorkspaceResolver.js",
  workspaceHub: "components/workspace/operations/OperationsWorkspaceHub.jsx",
  runtimeWorkCenter: "components/workspace/operations/OperationsRuntimeWorkCenter.jsx",
  operationsPage: "app/(system)/workspace/[organizationId]/operations/page.jsx",
  operationsCapabilityPage: "app/(system)/workspace/[organizationId]/operations/[...operationsRoute]/page.jsx",
  collectionRoute: "app/api/operations/[capabilityId]/route.js",
  detailRoute: "app/api/operations/[capabilityId]/[recordId]/route.js",
  commandRoute: "app/api/operations/[capabilityId]/commands/[command]/route.js",
  baseMigration: "supabase/migrations/20260728130000_operations_runtime_persistence.sql",
  atomicMigration: "supabase/migrations/20260728173000_operations_atomic_command_execution.sql",
  lifecycleMigration: "supabase/migrations/20260728190000_operations_lifecycle_guard.sql",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required Operations file: ${relativePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
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
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
);

const capabilityCount = (
  source.catalogue.match(/^\s*\["[^"]+",\s*"[^"]+"/gm) || []
).length;

if (capabilityCount < 80) {
  throw new Error(
    `Operations catalogue unexpectedly contains only ${capabilityCount} capabilities.`,
  );
}

requireIncludes(source.catalogue, [
  "OPERATIONS_CAPABILITY_CATALOG",
  "OPERATIONS_CAPABILITIES_BY_ID",
  "getOperationsCapability",
  "readOnly",
  "recordType",
  "consumes",
  "boundary",
], "Operations capability catalogue");

requireIncludes(source.lifecyclePolicy, [
  "getAllowedOperationsCommands",
  "canExecuteOperationsCommand",
  "getOperationsTargetStatus",
  "assertOperationsTransition",
  "Invalid Operations lifecycle transition",
  "in_progress",
  "validated",
  "superseded",
], "Operations lifecycle policy");

requireIncludes(source.runtime, [
  "assertBusinessContext",
  "commandExecution?.execute",
  "repositories",
  "publishOperationalEvent",
], "Operations runtime");

requireIncludes(source.atomicExecutor, [
  "buildCommandKey",
  "execute_operations_command",
  "database.rpc",
  "idempotent_replay",
  "attachActor",
  "created_by",
  "updated_by",
  "_operations_lifecycle",
], "Atomic Operations executor");

requireIncludes(source.serverApi, [
  "createAtomicOperationsCommandExecution",
  "commandExecution",
  "createCanonicalOperationsRepositories",
  "createCanonicalOperationsHandlers",
], "Operations server composition");

requireIncludes(source.apiController, [
  "projectLifecycle",
  "getAllowedOperationsCommands",
  "allowed_commands",
], "Operations API lifecycle projection");

requireIncludes(source.requestContext, [
  "resolveBusinessContext",
  "organization_id",
  "entity_id",
  "period_id",
  "actor_id",
], "Operations request context");

requireIncludes(source.repositories, [
  '.eq("organization_id", context.organization_id)',
  '.eq("capability_id", capabilityId)',
  '.is("entity_id", null)',
  '.is("period_id", null)',
  "sanitizeWriteValues",
], "Operations repository isolation");

requireIncludes(source.formSchemas, [
  "BASE_FIELDS",
  "LIFECYCLE_FIELDS",
  "GROUP_FIELDS",
  "getOperationsFormSchema",
  "getOperationsInitialValues",
  "buildOperationsFormPayload",
  "validateOperationsForm",
  'storage: "attribute"',
  'storage: "column"',
], "Operations dynamic form schemas");

requireExcludes(source.formSchemas, [
  "restaurant",
  "hotel",
  "kitchen",
  "waiter",
  "pest",
], "Operations dynamic form schemas");

requireIncludes(source.commandSchemas, [
  "getOperationsCommandSchema",
  "getOperationsCommandInitialValues",
  "validateOperationsCommand",
  "buildOperationsCommandPayload",
  "assignable-users",
  "assigned_to",
  "assignee_party_id",
  "completion_note",
  "resolution",
  "approval_note",
], "Operations lifecycle command schemas");

requireExcludes(source.commandSchemas, [
  "restaurant",
  "hotel",
  "kitchen",
  "waiter",
  "pest",
], "Operations lifecycle command schemas");

requireIncludes(source.workspaceRegistry, [
  "OPERATIONS_CAPABILITY_CATALOG",
  "OperationsRuntimeWorkCenter",
  "/commands/:command",
  "commandEndpoint",
  "Import",
  "Export",
  "AI",
], "Operations workspace registry");

requireIncludes(source.workspaceResolver, [
  "getOperationsWorkspaceGroups",
  "getOperationsWorkspaceItems",
  "getOperationsWorkspaceItem",
  "getOperationsWorkspaceItemByRoute",
], "Operations workspace resolver");

requireIncludes(source.workspaceHub, [
  "getOperationsWorkspaceGroups",
  "Canonical Operations Kernel",
  "resolveWorkspaceRoute",
], "Operations workspace hub");

requireExcludes(source.workspaceHub, [
  "Waiter",
  "Kitchen",
  "KDS",
  "Tables",
  "Recipes",
], "Operations workspace hub");

requireIncludes(source.runtimeWorkCenter, [
  "json.ok",
  "Idempotency-Key",
  "/api/operations/",
  "executeCommand",
  "organization_id",
  "entity_id",
  "period_id",
  "Export",
  "getOperationsFormSchema",
  "buildOperationsFormPayload",
  "validateOperationsForm",
  "getOperationsCommandSchema",
  "validateOperationsCommand",
  "buildOperationsCommandPayload",
  "allowed_commands",
  "/api/platform/users/assignable",
  "No further lifecycle actions",
], "Operations runtime work centre");

requireIncludes(source.operationsPage, [
  "OperationsWorkspaceHub",
], "Operations landing page");

requireIncludes(source.operationsCapabilityPage, [
  "OperationsRuntimeWorkCenter",
  "getOperationsWorkspaceItem",
  "notFound",
], "Operations capability page");

for (const [label, route] of [
  ["Operations collection route", source.collectionRoute],
  ["Operations detail route", source.detailRoute],
  ["Operations command route", source.commandRoute],
]) {
  requireIncludes(route, [
    "serverOperationsApi",
    "resolveOperationsRequestContext",
    "NextResponse",
  ], label);
}

requireIncludes(source.baseMigration, [
  "create table if not exists public.operations_records",
  "create table if not exists public.operations_command_ledger",
  "create table if not exists public.operations_event_outbox",
  "operations_command_ledger_key_uidx",
  "created_by",
  "updated_by",
  "attributes jsonb",
], "Operations persistence migration");

requireIncludes(source.atomicMigration, [
  "create or replace function public.execute_operations_command",
  "language plpgsql",
  "security definer",
  "operations_command_ledger",
  "operations_records",
  "operations_event_outbox",
  "is not distinct from",
  "grant execute on function",
  "to service_role",
  "created_by",
  "updated_by",
], "Operations atomic command migration");

requireIncludes(source.lifecycleMigration, [
  "operations_lifecycle_initial_status",
  "operations_lifecycle_target_status",
  "guard_operations_record_lifecycle",
  "operations_records_lifecycle_guard",
  "Invalid Operations lifecycle transition",
  "before insert or update",
], "Operations lifecycle guard migration");

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, [
    "tenant_id",
    "tenantId",
  ], `Operations ${label}`);
}

if (!(FILES.baseMigration < FILES.atomicMigration && FILES.atomicMigration < FILES.lifecycleMigration)) {
  throw new Error("Operations migrations are not in persistence, atomic execution, lifecycle order.");
}

console.log("OPERATIONS_RELEASE_AUDIT=PASS");
console.log(`OPERATIONS_CAPABILITY_COUNT=${capabilityCount}`);
console.log("OPERATIONS_CONTEXT_SCOPE=organization_id,entity_id,period_id,capability_id");
console.log("OPERATIONS_COMMAND_EXECUTION=ATOMIC_RPC");
console.log("OPERATIONS_EVENT_DELIVERY=TRANSACTIONAL_OUTBOX");
console.log("OPERATIONS_UI=CANONICAL_NEUTRAL_WORKSPACES");
console.log("OPERATIONS_FORMS=DYNAMIC_LIFECYCLE_AND_GROUP_SCHEMAS");
console.log("OPERATIONS_AUDIT_ACTOR=AUTHENTICATED_USER");
console.log("OPERATIONS_LIFECYCLE=DATABASE_GUARDED_AND_API_PROJECTED");
console.log("OPERATIONS_COMMAND_UI=STRUCTURED_AND_STATE_GOVERNED");
