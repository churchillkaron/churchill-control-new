/**
 * PHASE 2: REGISTRY → DATABASE MIGRATION PLAN
 *
 * Goal:
 * Replace ERP_REGISTRY (static JS config) with database-driven registry.
 *
 * Current state:
 * - ERP_REGISTRY defines domains, capabilities, navigation
 *
 * Target state:
 * - DB tables define:
 *    - domains
 *    - capabilities
 *    - workspaces
 *    - runtime contracts
 *
 * Migration rules:
 * 1. No UI changes required (runtime.data stays stable)
 * 2. Only registry layer is replaced
 * 3. Finance/Inventory/Creative remain unchanged at UI level
 */

export const REGISTRY_MIGRATION = {
  version: "2.0.0",
  phases: [
    "schema_design",
    "db_migration_tables",
    "seed_from_erp_registry",
    "dual_read_mode",
    "cutover_to_db_registry",
    "remove_erp_registry",
  ],

  core_entities: [
    "domains",
    "capabilities",
    "workspaces",
    "navigation",
    "runtime_contracts",
  ],

  invariant: "runtime.data remains unchanged",
};
