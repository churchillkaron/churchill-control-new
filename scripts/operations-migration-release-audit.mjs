import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION_DIR = path.join(ROOT, "supabase", "migrations");
const MANIFEST_FILE = path.join(
  ROOT,
  "lib",
  "operations",
  "deployment",
  "OperationsMigrationManifest.js",
);

const ACTIVE_MIGRATIONS = Object.freeze([
  "20260728130000_operations_runtime_persistence.sql",
  "20260728173000_operations_atomic_command_execution.sql",
  "20260728190000_operations_lifecycle_guard.sql",
  "20260728210000_operations_event_delivery.sql",
  "20260728213000_operations_event_health.sql",
  "20260728220000_operations_command_audit_projection.sql",
  "20260728230001_operations_role_permissions.sql",
]);

const DEPLOYED_HISTORY = Object.freeze([
  Object.freeze({
    version: "20260728233000",
    historicalFile: "20260728233000_operations_owner_admin_backfill.sql",
    contractFile: "lib/operations/deployment/contracts/operations_owner_admin_backfill.sql",
  }),
  Object.freeze({
    version: "20260728234500",
    historicalFile: "20260728234500_operations_deployment_contract.sql",
    contractFile: "lib/operations/deployment/contracts/operations_deployment_contract.sql",
  }),
]);

function fail(message) {
  throw new Error(`Operations migration release audit failed: ${message}`);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`missing file ${path.relative(ROOT, file)}`);
  return fs.readFileSync(file, "utf8");
}

const manifest = read(MANIFEST_FILE);
const localMigrationNames = fs.existsSync(MIGRATION_DIR)
  ? fs.readdirSync(MIGRATION_DIR).filter((name) => name.endsWith(".sql"))
  : [];

for (const file of ACTIVE_MIGRATIONS) {
  if (!localMigrationNames.includes(file)) fail(`missing active migration ${file}`);
  if (!manifest.includes(file)) fail(`manifest does not include active migration ${file}`);
}

for (const history of DEPLOYED_HISTORY) {
  if (!manifest.includes(history.version)) {
    fail(`manifest does not include deployed history version ${history.version}`);
  }
  if (!manifest.includes(history.historicalFile)) {
    fail(`manifest does not identify historical migration ${history.historicalFile}`);
  }
  if (!manifest.includes(history.contractFile)) {
    fail(`manifest does not include contract snapshot ${history.contractFile}`);
  }
  if (localMigrationNames.includes(history.historicalFile)) {
    fail(`deployed history migration must not be active locally: ${history.historicalFile}`);
  }
}

const versions = [
  ...ACTIVE_MIGRATIONS.map((file) => file.slice(0, 14)),
  ...DEPLOYED_HISTORY.map((history) => history.version),
];
const sortedVersions = [...versions].sort();
if (versions.join("\n") !== sortedVersions.join("\n")) {
  fail("Operations migration versions are not strictly ordered");
}

if (new Set(versions).size !== versions.length) {
  fail("Operations migration versions are not unique");
}

const migrationSource = Object.fromEntries(
  ACTIVE_MIGRATIONS.map((file) => [file, read(path.join(MIGRATION_DIR, file))]),
);
const contractSource = Object.fromEntries(
  DEPLOYED_HISTORY.map((history) => [
    history.contractFile,
    read(path.join(ROOT, history.contractFile)),
  ]),
);

const requiredMigrationContracts = Object.freeze({
  "20260728130000_operations_runtime_persistence.sql": [
    "operations_records",
    "operations_command_ledger",
    "operations_event_outbox",
  ],
  "20260728173000_operations_atomic_command_execution.sql": [
    "execute_operations_command",
    "security definer",
  ],
  "20260728190000_operations_lifecycle_guard.sql": [
    "operations_records_lifecycle_guard",
    "Invalid Operations lifecycle transition",
  ],
  "20260728210000_operations_event_delivery.sql": [
    "operations_events",
    "operations_events_immutable_guard",
    "publish_operations_event_batch",
  ],
  "20260728213000_operations_event_health.sql": [
    "get_operations_event_delivery_health",
    "retry_operations_dead_letter",
  ],
  "20260728220000_operations_command_audit_projection.sql": [
    "record_id",
    "actor_id",
    "operations_command_ledger_audit_projection",
  ],
  "20260728230001_operations_role_permissions.sql": [
    "operations_roles",
    "operations_role_permissions",
    "user_operations_roles",
  ],
});

const requiredHistoryContracts = Object.freeze({
  "lib/operations/deployment/contracts/operations_owner_admin_backfill.sql": [
    "AUDIT-ONLY DEPLOYED CONTRACT SNAPSHOT",
    "OPERATIONS_ADMIN",
    "operations.*",
    "on conflict",
  ],
  "lib/operations/deployment/contracts/operations_deployment_contract.sql": [
    "AUDIT-ONLY DEPLOYED CONTRACT SNAPSHOT",
    "get_operations_deployment_status",
    "operations_admin_assignment",
    "Operations deployment contract failed",
  ],
});

for (const [file, contracts] of Object.entries(requiredMigrationContracts)) {
  const source = migrationSource[file];
  for (const contract of contracts) {
    if (!source.includes(contract)) {
      fail(`${file} is missing contract ${contract}`);
    }
  }

  if (/tenant_id|tenantId/.test(source)) {
    fail(`${file} contains a forbidden tenant reference`);
  }
}

for (const [file, contracts] of Object.entries(requiredHistoryContracts)) {
  const source = contractSource[file];
  for (const contract of contracts) {
    if (!source.includes(contract)) {
      fail(`${file} is missing contract ${contract}`);
    }
  }

  if (/tenant_id|tenantId/.test(source)) {
    fail(`${file} contains a forbidden tenant reference`);
  }
}

const remoteListFile = process.env.SUPABASE_MIGRATION_LIST_FILE || "";
if (remoteListFile) {
  const remoteList = read(path.resolve(ROOT, remoteListFile));
  const missingRemote = versions.filter((version) => !remoteList.includes(version));

  if (missingRemote.length > 0) {
    fail(`linked production history is missing ${missingRemote.join(", ")}`);
  }

  console.log("OPERATIONS_REMOTE_MIGRATION_HISTORY=PASS");
}

console.log("OPERATIONS_MIGRATION_RELEASE_AUDIT=PASS");
console.log(`OPERATIONS_ACTIVE_MIGRATION_COUNT=${ACTIVE_MIGRATIONS.length}`);
console.log(`OPERATIONS_DEPLOYED_HISTORY_COUNT=${DEPLOYED_HISTORY.length}`);
console.log(`OPERATIONS_DEPLOYMENT_CONTRACT_VERSION=${versions.at(-1)}`);
