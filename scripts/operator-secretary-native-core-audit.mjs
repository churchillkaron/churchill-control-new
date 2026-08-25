import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20260825062200_avantiqo_secretary_native_core.sql");
const runtime = read("lib/operator/secretary/SecretaryRuntime.js");
const capabilities = read("lib/platform/capabilities/createSecretaryCapability.js");
const platform = read("lib/platform/runtime/PlatformDomainRuntime.js");
const memory = read("lib/operator/runtime/IntelligenceMemoryRuntime.js");
const communications = read("supabase/migrations/20260812033911_communications_domain_convergence.sql");

const requiredTables = [
  "secretary_contact_profiles",
  "secretary_calendar_events",
  "secretary_tasks",
  "secretary_calls",
  "secretary_follow_ups",
  "secretary_settings",
];
for (const table of requiredTables) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), `missing ${table}`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `RLS missing for ${table}`);
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"), `public grants not revoked for ${table}`);
}

assert.match(migration, /references public\.parties \(organization_id, id\)/i, "Secretary contacts must reuse canonical parties");
assert.match(migration, /references public\.communication_conversations\(id\)/i, "Secretary must link normalized communications");
assert.doesNotMatch(migration, /create table[^;]*(secretary_memor|secretary_messages|secretary_parties)/i, "Secretary must not duplicate memory, messages, or party identity");
assert.match(memory, /const MEMORY_TABLE = "intelligence_memories"/, "canonical intelligence memory missing");
assert.match(communications, /create table if not exists public\.communication_messages/, "canonical communication history missing");

for (const fn of [
  "readAgenda",
  "createCalendarEvent",
  "updateCalendarEvent",
  "listContacts",
  "upsertContactProfile",
  "listTasks",
  "createTask",
  "updateTask",
  "listFollowUps",
  "createFollowUp",
  "listCalls",
  "logCall",
  "readSettings",
  "updateSettings",
]) {
  assert.match(runtime, new RegExp(`export async function ${fn}\\b`), `runtime action missing: ${fn}`);
}

for (const action of [
  "readAgenda",
  "createCalendarEvent",
  "updateCalendarEvent",
  "listContacts",
  "upsertContactProfile",
  "listTasks",
  "createTask",
  "updateTask",
  "listFollowUps",
  "createFollowUp",
  "listCalls",
  "readSettings",
  "updateSettings",
]) {
  assert.match(platform, new RegExp(`${action}: async \\(\\) => createSecretaryCapability\\("${action}"\\)`), `Platform registration missing: ${action}`);
}

for (const readAction of ["readAgenda", "listContacts", "listTasks", "listFollowUps", "listCalls", "readSettings"]) {
  const block = capabilities.match(new RegExp(`${readAction}: \\{([\\s\\S]*?)\\n  \\},`));
  assert.ok(block, `capability block missing: ${readAction}`);
  assert.match(block[1], /mode: "read"/, `${readAction} must be read-only`);
  assert.match(block[1], /risk: "low"/, `${readAction} must be low risk`);
}

for (const writeAction of ["createCalendarEvent", "updateCalendarEvent", "upsertContactProfile", "createTask", "updateTask", "createFollowUp", "updateSettings"]) {
  const block = capabilities.match(new RegExp(`${writeAction}: \\{([\\s\\S]*?)\\n  \\},`));
  assert.ok(block, `capability block missing: ${writeAction}`);
  assert.match(block[1], /confirm: true/, `${writeAction} must require conversational confirmation`);
}

const logCallBlock = capabilities.match(/logCall: \{([\s\S]*?)\n  \},/);
assert.ok(logCallBlock, "internal logCall capability missing");
assert.match(logCallBlock[1], /operatorEnabled: false/, "logCall must be hidden from Operator");
assert.match(logCallBlock[1], /aiEnabled: false/, "logCall must not leak through aiEnabled catalog fallback");

assert.doesNotMatch(migration, /google_calendar|microsoft_graph|outlook_calendar|calendly|twilio/i, "Secretary core must remain provider-independent and in-house");
assert.doesNotMatch(runtime, /googleapis|microsoft|outlook|calendly|twilio/i, "Secretary runtime must remain provider-independent and in-house");

console.log("OPERATOR_SECRETARY_NATIVE_CORE_AUDIT=PASS");
console.log(`OPERATOR_SECRETARY_NATIVE_TABLE_COUNT=${requiredTables.length}`);
console.log("OPERATOR_SECRETARY_EXTERNAL_AUTHORITY_COUNT=0");
console.log("OPERATOR_SECRETARY_CANONICAL_MEMORY_REUSED=true");
console.log("OPERATOR_SECRETARY_CANONICAL_COMMUNICATIONS_REUSED=true");
