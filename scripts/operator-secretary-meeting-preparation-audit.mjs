import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  platform: await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  capability: await readFile("lib/platform/capabilities/createSecretaryMeetingPreparationCapability.js", "utf8"),
  runtime: await readFile("lib/operator/secretary/SecretaryMeetingPreparationRuntime.js", "utf8"),
};

assert.match(files.platform, /createSecretaryMeetingPreparationCapability/);
assert.match(files.platform, /secretary_meeting_preparation/);
assert.match(files.platform, /prepare:\s*async\s*\(\)\s*=>\s*createSecretaryMeetingPreparationCapability\(\)/);

assert.match(files.capability, /prepare me for this meeting/i);
assert.match(files.capability, /brief me before this meeting/i);
assert.match(files.capability, /pre-read/i);
assert.match(files.capability, /operatorMode:\s*"read"/);
assert.match(files.capability, /operatorAutoExecute:\s*true/);
assert.match(files.capability, /transactional:\s*false/);
assert.match(files.capability, /risk:\s*"low"/);

assert.match(files.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_PREPARATION_V1/);
assert.match(files.runtime, /SECRETARY_MEETING_PREP_EVENT_AMBIGUOUS/);
assert.match(files.runtime, /SECRETARY_MEETING_PREP_EVENT_CANCELLED/);
assert.match(files.runtime, /secretary_calendar_events/);
assert.match(files.runtime, /secretary_contact_profiles/);
assert.match(files.runtime, /secretary_tasks/);
assert.match(files.runtime, /secretary_follow_ups/);
assert.match(files.runtime, /secretary_meeting_participants/);
assert.match(files.runtime, /secretary_meetings/);
assert.match(files.runtime, /Never invent an attendee, relationship, prior decision, deadline, promise, document, message, concern, preference, commercial fact or meeting objective/);
assert.match(files.runtime, /calendar contact or supplied participant is an expected\/relevant participant, not proof they will attend/i);
assert.match(files.runtime, /Prior meeting decisions are historical evidence only/i);
assert.match(files.runtime, /missing_context/);
assert.match(files.runtime, /decisions_to_prepare/);
assert.match(files.runtime, /questions_to_ask/);
assert.match(files.runtime, /risks_and_watchouts/);
assert.match(files.runtime, /suggested_agenda/);
assert.match(files.runtime, /read_only:\s*true/);
assert.match(files.runtime, /messages_sent:\s*false/);
assert.match(files.runtime, /calendar_changed:\s*false/);
assert.match(files.runtime, /commitments_created:\s*false/);
assert.match(files.runtime, /authority_created:\s*false/);
assert.match(files.runtime, /external_authority_used:\s*false/);
assert.doesNotMatch(files.runtime, /\.insert\(/);
assert.doesNotMatch(files.runtime, /\.update\(/);
assert.doesNotMatch(files.runtime, /\.delete\(/);

console.log("OPERATOR_SECRETARY_MEETING_PREPARATION_AUDIT=PASS");
console.log("SECRETARY_EXECUTIVE_MEETING_PRE_READ=true");
console.log("SECRETARY_MEETING_PREPARATION_EVIDENCE_ONLY=true");
console.log("SECRETARY_MEETING_PREPARATION_AMBIGUITY_FAILS_CLOSED=true");
console.log("SECRETARY_MEETING_PREPARATION_READ_ONLY=true");
console.log("SECRETARY_MEETING_PREPARATION_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
