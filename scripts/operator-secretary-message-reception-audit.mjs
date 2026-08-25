import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  queue: "supabase/migrations/20260825065700_avantiqo_secretary_message_reception.sql",
  autoEnqueue: "supabase/migrations/20260825070700_secretary_message_attachment_settle_delay.sql",
  contact: "supabase/migrations/20260825070100_secretary_atomic_message_contact_resolution.sql",
  reply: "supabase/migrations/20260825070300_secretary_idempotent_message_reply.sql",
  attachment: "supabase/migrations/20260825070400_secretary_attachment_review_task.sql",
  actions: "supabase/migrations/20260825070500_secretary_message_action_idempotency.sql",
  booking: "supabase/migrations/20260825070600_secretary_message_booking_idempotency.sql",
  brain: "lib/operator/secretary/SecretaryMessageConversationRuntime.js",
  processor: "app/api/internal/secretary/messages/process/route.js",
  delivery: "lib/commercial/communications/CommunicationDeliveryRuntime.js",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

assert.match(source.queue, /secretary_message_reception_requests/);
assert.match(source.queue, /enable row level security/i);
assert.match(source.queue, /revoke all on public\.secretary_message_reception_requests from anon, authenticated/i);
assert.match(source.queue, /for update skip locked/i);
assert.match(source.queue, /unique \(organization_id, inbound_message_id\)/i);

assert.match(source.autoEnqueue, /direction[^\n]*INBOUND/i);
assert.match(source.autoEnqueue, /PROVIDER_HISTORY_SYNC/);
assert.match(source.autoEnqueue, /BACKFILL/);
assert.match(source.autoEnqueue, /now\(\) \+ interval '10 seconds'/i);
assert.match(source.autoEnqueue, /on conflict \(organization_id, inbound_message_id\) do nothing/i);

assert.match(source.contact, /pg_advisory_xact_lock/);
assert.match(source.contact, /secretary_contact_channels/);
assert.match(source.contact, /v_address ~\* '\^\[\^\[:space:\]@\]/);
assert.doesNotMatch(source.contact, /v_phone := v_participant/);

assert.match(source.brain, /tools:\s*\[\]/);
assert.match(source.brain, /allow_mutating_tools:\s*false/);
assert.match(source.brain, /RESTRICTED_PUBLIC_SECRETARY/);
assert.match(source.brain, /Preserve the sender's language/);
assert.match(source.brain, /Never disclose finance, administration, internal calendars/);
assert.match(source.brain, /externalPublicContext/);
assert.match(source.brain, /externalActionResult/);
assert.match(source.brain, /secretary_resolve_message_contact/);
assert.match(source.brain, /secretary_book_calendar_event/);
assert.match(source.brain, /secretary_ensure_attachment_review_task/);
assert.match(source.brain, /contactAllowsMessages/);
assert.match(source.brain, /SECRETARY_CONTACT_MESSAGES_DISABLED/);
assert.match(source.brain, /secretary_reserve_message_reply/);
assert.match(source.brain, /automatic_redelivery_suppressed/);
assert.doesNotMatch(source.brain, /executeUbteCapability|OperatorCapabilityCatalog|platform\.secretary/);

assert.match(source.reply, /for update/i);
assert.match(source.reply, /response_message_id is not null/i);
assert.match(source.reply, /communication_messages_secretary_reception_reply_uidx/);
assert.match(source.reply, /AVANTIQO_SECRETARY/);
assert.match(source.reply, /delivery_authorized/);

assert.match(source.attachment, /secretary_ensure_attachment_review_task/);
assert.match(source.attachment, /secretary_tasks_message_attachment_review_uidx/);
assert.match(source.actions, /secretary_follow_ups_message_reception_uidx/);
assert.match(source.actions, /secretary_tasks_message_reception_uidx/);
assert.match(source.booking, /secretary_calendar_events_message_reception_uidx/);

assert.match(source.processor, /process\.env\.CRON_SECRET/);
assert.match(source.processor, /claimSecretaryInboundMessage/);
assert.match(source.processor, /completeSecretaryInboundMessage/);
assert.match(source.processor, /failSecretaryInboundMessage/);
assert.match(source.processor, /external_authority_used:\s*false/);

assert.match(source.delivery, /messageSource === "AVANTIQO_SECRETARY" \? null/);
assert.match(source.delivery, /execution_actor:/);

const vercel = JSON.parse(source.vercel);
const messageCron = (vercel.crons || []).find(
  (job) => job.path === "/api/internal/secretary/messages/process",
);
assert.ok(messageCron, "Secretary written-message processor must be scheduled in the real Vercel cron configuration");
assert.equal(messageCron.schedule, "* * * * *");
assert.equal(
  vercel.functions?.["app/api/internal/secretary/messages/process/route.js"]?.maxDuration,
  300,
);

console.log("OPERATOR_SECRETARY_MESSAGE_RECEPTION_AUDIT=PASS");
console.log("SECRETARY_MESSAGE_AUTHORITY=RESTRICTED_PUBLIC_SECRETARY");
console.log("SECRETARY_MESSAGE_INTERNAL_OPERATOR_TOOLS=false");
console.log("SECRETARY_MESSAGE_HISTORY_AUTO_REPLY=false");
console.log("SECRETARY_MESSAGE_REPLAY_SAFE=true");
console.log("SECRETARY_MESSAGE_ATTACHMENT_REVIEW=true");
console.log("SECRETARY_MESSAGE_LANGUAGE_PRESERVATION=required");
console.log("SECRETARY_MESSAGE_EXTERNAL_AUTHORITY_USED=false");
