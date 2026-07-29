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

const EXPECTED = Object.freeze([
  "20260728130000_operations_runtime_persistence.sql",
  "20260728173000_operations_atomic_command_execution.sql",
  "20260728190000_operations_lifecycle_guard.sql",
  "20260728210000_operations_event_delivery.sql",
  "20260728213000_operations_event_health.sql",
  "20260728220000_operations_command_audit_projection.sql",
  "20260728230000_operations_role_permissions.sql",
  "20260728233000_operations_owner_admin_backfill.sql",
  "20260728234500_operations_deployment_contract.sql",
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

for (const file of EXPECTED) {
  if (!localMigrationNames.includes(file)) fail(`missing migration ${file}`);
  if (!manifest.includes(file)) fail(`manifest does not include ${file}`);
}

const versions = EXPECTED.map((file) => file.slice(0, 14));
const sortedVersions = [...versions].sort();
if (versions.join("\n") !== sortedVersions.join("\n")) {
  fail("Operations migration versions are not strictly ordered");
}

if (new Set(versions).size !== versions.length) {
  fail("Operations migration versions are not unique");
}

const migrationSource = Object.fromEntries(
  EXPECTED.map((file) => [file, read(path.join(MIGRATION_DIR, file))]),
);

const requiredContracts = Object.freeze({
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
  "20260728230000_operations_role_permissions.sql": [
    "operations_roles",
    "operations_role_permissions",
    "user_operations_roles",
  ],
  "20260728233000_operations_owner_admin_backfill.sql": [
    "OPERATIONS_ADMIN",
    "operations.*",
    "on conflict",
  ],
  "20260728234500_operations_deployment_contract.sql": [
    "get_operations_deployment_status",
    "operations_admin_assignment",
    "Operations deployment contract failed",
  ],
});

for (const [file, contracts] of Object.entries(requiredContracts)) {
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
console.log(`OPERATIONS_MIGRATION_COUNT=${EXPECTED.length}`);
console.log(`OPERATIONS_DEPLOYMENT_CONTRACT_VERSION=${versions.at(-1)}`);
