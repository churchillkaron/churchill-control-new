import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const caller = read("lib/operator/secretary/SecretaryCallerRuntime.js");
const conversation = read("lib/operator/secretary/SecretaryCallerConversationRuntime.js");
const callMigration = read("supabase/migrations/20260825063300_avantiqo_secretary_call_sessions.sql");

for (const action of [
  "readPublicContext",
  "checkAvailability",
  "bookOwnAppointment",
  "requestCallback",
  "leaveMessage",
]) {
  assert.match(caller, new RegExp(`"${action}"`), `caller action missing: ${action}`);
}

for (const forbidden of [
  "readAgenda",
  "updateSettings",
  "listContacts",
  "listTasks",
  "listCalls",
  "runSyntheticIntelligenceTurn",
  "OperatorCapabilityCatalog",
  "FinanceRuntime",
]) {
  assert.doesNotMatch(conversation, new RegExp(forbidden), `restricted caller runtime references forbidden internal surface: ${forbidden}`);
}

assert.match(conversation, /tools: \[\]/, "caller intelligence must not receive general tools");
assert.match(conversation, /allow_mutating_tools: false/, "caller intelligence planner must not mutate through model tools");
assert.match(conversation, /internal_operator_capabilities_available: false/, "caller result must explicitly deny internal Operator capabilities");
assert.match(caller, /calendar_event_details_disclosed: false/, "availability response must not disclose calendar details");
assert.match(caller, /conflicting_event_count_disclosed: false/, "availability response must not disclose conflict counts");
assert.match(caller, /contact_party_id: call\.contact_party_id/, "self-booking must bind to caller contact");
assert.match(caller, /raw_audio_persisted: false/g, "call runtime must keep raw audio non-persistent by default");

for (const table of ["secretary_phone_lines", "secretary_call_turns"]) {
  assert.match(callMigration, new RegExp(`create table if not exists public\\.${table}`), `missing ${table}`);
  assert.match(callMigration, new RegExp(`alter table public\\.${table} enable row level security`), `missing RLS: ${table}`);
  assert.match(callMigration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`), `public access not revoked: ${table}`);
}

assert.doesNotMatch(conversation, /google|microsoft|calendly|twilio/i, "caller conversation brain must remain external-provider independent");
assert.doesNotMatch(caller, /google|microsoft|calendly|twilio/i, "caller execution runtime must remain external-provider independent");

console.log("OPERATOR_SECRETARY_CALLER_BOUNDARY_AUDIT=PASS");
console.log("OPERATOR_SECRETARY_CALLER_INTERNAL_OPERATOR_ACCESS=false");
console.log("OPERATOR_SECRETARY_CALLER_GENERAL_TOOL_COUNT=0");
console.log("OPERATOR_SECRETARY_CALLER_RAW_AUDIO_DEFAULT_PERSISTED=false");
console.log("OPERATOR_SECRETARY_CALLER_EXTERNAL_AUTHORITY_COUNT=0");
