export const OPERATIONS_DEPLOYMENT_CONTRACT_VERSION = "20260728234500";

export const OPERATIONS_MIGRATION_MANIFEST = Object.freeze([
  Object.freeze({
    version: "20260728130000",
    file: "20260728130000_operations_runtime_persistence.sql",
    purpose: "Canonical Operations records, command ledger and transactional outbox.",
    contracts: Object.freeze([
      "operations_records",
      "operations_command_ledger",
      "operations_event_outbox",
    ]),
  }),
  Object.freeze({
    version: "20260728173000",
    file: "20260728173000_operations_atomic_command_execution.sql",
    purpose: "Atomic, idempotent Operations command execution.",
    contracts: Object.freeze([
      "execute_operations_command",
    ]),
  }),
  Object.freeze({
    version: "20260728190000",
    file: "20260728190000_operations_lifecycle_guard.sql",
    purpose: "Database-enforced canonical lifecycle transitions.",
    contracts: Object.freeze([
      "operations_lifecycle_target_status",
      "operations_records_lifecycle_guard",
    ]),
  }),
  Object.freeze({
    version: "20260728210000",
    file: "20260728210000_operations_event_delivery.sql",
    purpose: "Immutable Operations event stream and retryable outbox publication.",
    contracts: Object.freeze([
      "operations_events",
      "publish_operations_event_batch",
      "operations_events_immutable_guard",
    ]),
  }),
  Object.freeze({
    version: "20260728213000",
    file: "20260728213000_operations_event_health.sql",
    purpose: "Scoped event-delivery health and dead-letter recovery.",
    contracts: Object.freeze([
      "get_operations_event_delivery_health",
      "retry_operations_dead_letter",
    ]),
  }),
  Object.freeze({
    version: "20260728220000",
    file: "20260728220000_operations_command_audit_projection.sql",
    purpose: "Indexed record and actor projections for command audit history.",
    contracts: Object.freeze([
      "operations_command_ledger_audit_projection",
      "record_id",
      "actor_id",
    ]),
  }),
  Object.freeze({
    version: "20260728230000",
    file: "20260728230000_operations_role_permissions.sql",
    purpose: "Organisation-scoped Operations roles, permissions and assignments.",
    contracts: Object.freeze([
      "operations_roles",
      "operations_role_permissions",
      "user_operations_roles",
    ]),
  }),
  Object.freeze({
    version: "20260728233000",
    file: "20260728233000_operations_owner_admin_backfill.sql",
    purpose: "Durable Operations administrator assignment for existing owners and administrators.",
    contracts: Object.freeze([
      "OPERATIONS_ADMIN",
      "operations.*",
    ]),
  }),
  Object.freeze({
    version: OPERATIONS_DEPLOYMENT_CONTRACT_VERSION,
    file: `${OPERATIONS_DEPLOYMENT_CONTRACT_VERSION}_operations_deployment_contract.sql`,
    purpose: "Database-side assertion and read-only production deployment status.",
    contracts: Object.freeze([
      "get_operations_deployment_status",
      "operations_deployment_contract",
    ]),
  }),
]);

export function getOperationsMigrationVersions() {
  return OPERATIONS_MIGRATION_MANIFEST.map((migration) => migration.version);
}

export function getOperationsMigrationFiles() {
  return OPERATIONS_MIGRATION_MANIFEST.map((migration) => migration.file);
}

export default OPERATIONS_MIGRATION_MANIFEST;
