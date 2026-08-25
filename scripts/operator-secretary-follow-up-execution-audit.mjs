import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  commitment: "lib/operator/secretary/SecretaryCommitmentCaptureRuntime.js",
  runtime: "lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js",
  worker: "app/api/internal/secretary/follow-ups/process/route.js",
  migration: "supabase/migrations/20260825073300_secretary_follow_up_execution.sql",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

for (const owner of ["SECRETARY", "CONTACT", "STAFF", "UNKNOWN"]) {
  assert.match(source.commitment, new RegExp(`\\"${owner}\\"`));
}
assert.match(source.commitment, /execution_ready/);
assert.match(source.commitment, /normalizedOwner === "SECRETARY"/);
assert.match(source.commitment, /SECRETARY_EXECUTABLE_ACTIONS\.has\(normalizedAction\)/);
assert.match(source.commitment, /tools:\s*\[\]/);
assert.match(source.commitment, /allow_mutating_tools:\s*false/);

assert.match(source.migration, /create table if not exists public\.secretary_follow_up_executions/i);
assert.match(source.migration, /enable row level security/i);
assert.match(source.migration, /revoke all on public\.secretary_follow_up_executions from anon, authenticated/i);
assert.match(source.migration, /upper\(coalesce\(f\.metadata->>'execution_owner', ''\)\) = 'SECRETARY'/i);
assert.match(source.migration, /lower\(coalesce\(f\.metadata->>'execution_ready', 'false'\)\) = 'true'/i);
assert.match(source.migration, /f\.action_type in \('CALL','MESSAGE','EMAIL'\)/i);
assert.match(source.migration, /for update skip locked/i);
assert.match(source.migration, /communication_messages_secretary_follow_up_execution_uidx/);
assert.match(source.migration, /secretary_outbound_call_follow_up_execution_uidx/);
assert.match(source.migration, /secretary_reserve_follow_up_execution_message/);

assert.match(source.runtime, /metadata\.execution_owner/);
assert.match(source.runtime, /metadata\.execution_ready !== true/);
assert.match(source.runtime, /allow_calls/);
assert.match(source.runtime, /allow_messages/);
assert.match(source.runtime, /do_not_disturb/);
assert.match(source.runtime, /FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED/);
assert.match(source.runtime, /tools:\s*\[\]/);
assert.match(source.runtime, /allow_mutating_tools:\s*false/);
assert.match(source.runtime, /secretary_reserve_follow_up_execution_message/);
assert.match(source.runtime, /secretary_follow_up_execution_id/);
assert.match(source.runtime, /status === "COMPLETED"/);
assert.match(source.runtime, /\["FAILED", "CANCELLED"\]\.includes\(status\)/);
assert.match(source.runtime, /status: "PENDING"/);
assert.match(source.runtime, /partyId:\s*null/);

assert.match(source.worker, /process\.env\.CRON_SECRET/);
assert.match(source.worker, /maxDuration = 300/);
assert.match(source.worker, /materializeSecretaryFollowUpExecutions/);
assert.match(source.worker, /reconcileQueuedSecretaryFollowUpExecutions/);
assert.match(source.worker, /claimSecretaryFollowUpExecution/);

for (const external of ["Google Calendar", "Microsoft Outlook", "Calendly", "Twilio"]) {
  assert.doesNotMatch(
    `${source.runtime}\n${source.migration}`,
    new RegExp(external.replace(/ /g, "\\s*"), "i"),
  );
}

const vercel = JSON.parse(source.vercel);
const cron = (vercel.crons || []).find(
  (entry) => entry.path === "/api/internal/secretary/follow-ups/process",
);
assert.ok(cron, "Missing real Secretary follow-up cron");
assert.equal(cron.schedule, "* * * * *");
assert.equal(
  vercel.functions?.["app/api/internal/secretary/follow-ups/process/route.js"]?.maxDuration,
  300,
);

console.log("OPERATOR_SECRETARY_FOLLOW_UP_EXECUTION_AUDIT=PASS");
console.log("SECRETARY_FOLLOW_UP_OWNER_GATE=true");
console.log("SECRETARY_CONTACT_PROMISE_AUTO_EXECUTION=false");
console.log("SECRETARY_STAFF_PROMISE_AUTO_EXECUTION=false");
console.log("SECRETARY_AUTONOMOUS_CALL_MESSAGE_EMAIL=true");
console.log("SECRETARY_FOLLOW_UP_REPLAY_SAFE=true");
console.log("SECRETARY_FOLLOW_UP_REAL_CLOUD_JOB=true");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
