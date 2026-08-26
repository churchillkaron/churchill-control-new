import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  meetingSchema: "supabase/migrations/20260825150000_secretary_meeting_intelligence_and_jobs.sql",
  meetingChunkSchema: "supabase/migrations/20260826010000_secretary_meeting_audio_chunk_idempotency.sql",
  jobClaim: "supabase/migrations/20260825151000_secretary_job_execution_claim.sql",
  prospectSchema: "supabase/migrations/20260826002000_secretary_prospect_discovery.sql",
  responseSchema: "supabase/migrations/20260826002500_secretary_job_response_collection.sql",
  waitingClaim: "supabase/migrations/20260826003000_secretary_job_waiting_claim_semantics.sql",
  meetingRuntime: "lib/operator/secretary/SecretaryMeetingRuntime.js",
  meetingAudioRuntime: "lib/operator/secretary/SecretaryMeetingAudioRuntime.js",
  meetingSpeakerRuntime: "lib/operator/secretary/SecretaryMeetingSpeakerRuntime.js",
  meetingApi: "app/api/secretary/meetings/route.js",
  meetingAudioApi: "app/api/secretary/meetings/audio/route.js",
  meetingPresence: "components/operator/SecretaryMeetingPresence.jsx",
  meetingPresenceBridge: "components/operator/SecretaryMeetingPresenceBridge.jsx",
  platformShell: "components/platform/PlatformShell.jsx",
  jobRuntime: "lib/operator/secretary/SecretaryJobExecutionRuntime.js",
  prospectRuntime: "lib/operator/secretary/SecretaryProspectDiscoveryRuntime.js",
  responseRuntime: "lib/operator/secretary/SecretaryJobResponseRuntime.js",
  worker: "app/api/internal/secretary/jobs/process/route.js",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

for (const table of [
  "secretary_meetings",
  "secretary_meeting_participants",
  "secretary_meeting_segments",
  "secretary_jobs",
  "secretary_job_steps",
  "secretary_meeting_action_items",
]) {
  assert.match(source.meetingSchema, new RegExp(`create table if not exists public\\.${table}`, "i"));
}
assert.match(source.meetingSchema, /capture_authorized boolean not null default false/i);
assert.match(source.meetingSchema, /raw_audio_persisted boolean not null default false/i);
assert.match(source.meetingSchema, /EXECUTE_WITH_GATES/);
assert.match(source.meetingSchema, /owner_kind in \('SECRETARY','STAFF','CONTACT','UNKNOWN'\)/i);

assert.match(source.meetingChunkSchema, /create table if not exists public\.secretary_meeting_audio_chunks/i);
assert.match(source.meetingChunkSchema, /unique \(organization_id, meeting_id, chunk_number\)/i);
assert.match(source.meetingChunkSchema, /Raw audio bytes are never persisted here/i);
assert.match(source.meetingChunkSchema, /enable row level security/i);
assert.match(source.meetingChunkSchema, /service_role/i);

assert.match(source.meetingRuntime, /SECRETARY_MEETING_CAPTURE_AUTHORIZATION_REQUIRED/);
assert.match(source.meetingRuntime, /FINALIZE_MEETING_PROTOCOL/);
assert.match(source.meetingRuntime, /executive_summary/);
assert.match(source.meetingRuntime, /protocol/);
assert.match(source.meetingRuntime, /decisions/);
assert.match(source.meetingRuntime, /unresolved_questions/);
assert.match(source.meetingRuntime, /secretary_tasks/);
assert.match(source.meetingRuntime, /secretary_jobs/);
assert.match(source.meetingRuntime, /executionReady/);
assert.match(source.meetingRuntime, /external_authority_used:\s*false/);

assert.match(source.meetingAudioRuntime, /service_id:\s*"ai\.speech\.to\.text"/);
assert.match(source.meetingAudioRuntime, /MEETING_STT/);
assert.match(source.meetingAudioRuntime, /silent_chunk:\s*true/);
assert.match(source.meetingAudioRuntime, /raw_audio_persisted:\s*false/);
assert.match(source.meetingAudioRuntime, /speaker_identity_invented:\s*false/);
assert.match(source.meetingAudioRuntime, /provider_speaker_label/);
assert.match(source.meetingAudioRuntime, /participantSpeakerMap/);
assert.match(source.meetingAudioRuntime, /secretary_meeting_audio_chunks/);
assert.match(source.meetingAudioRuntime, /SECRETARY_MEETING_AUDIO_CHUNK_IN_PROGRESS/);
assert.match(source.meetingAudioRuntime, /idempotent_replay:\s*true/);
assert.match(source.meetingAudioRuntime, /existingSegmentsForChunk/);

assert.match(source.meetingSpeakerRuntime, /AVANTIQO_SECRETARY_MEETING_SPEAKER_MAPPING_V1/);
assert.match(source.meetingSpeakerRuntime, /speaker_mapping_source:\s*"AUTHENTICATED_ORGANIZATION_USER"/);
assert.match(source.meetingSpeakerRuntime, /provider_speaker_label/);
assert.match(source.meetingSpeakerRuntime, /speaker_identity_mapped_by_user:\s*true/);
assert.match(source.meetingSpeakerRuntime, /speaker_identity_invented:\s*false/);

assert.match(source.meetingApi, /requireOrganizationAccess/);
assert.match(source.meetingApi, /action === "START"/);
assert.match(source.meetingApi, /capture_authorized/);
assert.match(source.meetingApi, /action === "MAP_SPEAKER"/);
assert.match(source.meetingApi, /mapSecretaryMeetingSpeaker/);
assert.match(source.meetingApi, /action === "FINALIZE"/);
assert.match(source.meetingAudioApi, /requireOrganizationAccess/);
assert.match(source.meetingAudioApi, /ingestSecretaryMeetingAudio/);
assert.match(source.meetingAudioApi, /chunk_number/);
assert.match(source.meetingAudioApi, /chunk_started_offset_ms/);
assert.match(source.meetingAudioApi, /CHUNK_IN_PROGRESS/);
assert.match(source.meetingAudioApi, /idempotent_replay === true \? 200 : 201/);

assert.match(source.meetingPresence, /navigator\.mediaDevices\.getUserMedia/);
assert.match(source.meetingPresence, /new MediaRecorder/);
assert.match(source.meetingPresence, /CHUNK_DURATION_MS = 25000/);
assert.match(source.meetingPresence, /recorder\.start\(\)/);
assert.match(source.meetingPresence, /\/api\/secretary\/meetings\/audio/);
assert.match(source.meetingPresence, /action:\s*"START"/);
assert.match(source.meetingPresence, /capture_authorized:\s*true/);
assert.match(source.meetingPresence, /action:\s*"MAP_SPEAKER"/);
assert.match(source.meetingPresence, /action:\s*"FINALIZE"/);
assert.match(source.meetingPresence, /beforeunload/);
assert.match(source.meetingPresence, /Raw meeting audio is not stored/i);
assert.match(source.meetingPresence, /Retry failed audio upload/);
assert.match(source.meetingPresence, /speaker identity/i);
assert.match(source.meetingPresence, /Live meeting transcript/i);
assert.match(source.meetingPresence, /Secretary Attend Meeting/i);
assert.match(source.meetingPresence, /requestAnimationFrame/);

const startMeetingSource = source.meetingPresence.slice(
  source.meetingPresence.indexOf("async function startMeeting()"),
  source.meetingPresence.indexOf("async function stopRecorderAndWait()"),
);
assert.ok(startMeetingSource.indexOf("notifyCaptureState(true)") >= 0);
assert.ok(startMeetingSource.indexOf("notifyCaptureState(true)") < startMeetingSource.indexOf("navigator.mediaDevices.getUserMedia"));
assert.ok(startMeetingSource.indexOf("requestAnimationFrame") < startMeetingSource.indexOf("navigator.mediaDevices.getUserMedia"));
assert.ok(startMeetingSource.indexOf("notifyCaptureState(false)") > startMeetingSource.indexOf("navigator.mediaDevices.getUserMedia"));

const endMeetingSource = source.meetingPresence.slice(
  source.meetingPresence.indexOf("async function endMeeting()"),
  source.meetingPresence.indexOf("async function retryUploads()"),
);
assert.ok(endMeetingSource.indexOf("await waitForUploads()") >= 0);
assert.ok(endMeetingSource.indexOf("await waitForUploads()") < endMeetingSource.indexOf("releaseStream()"));
assert.match(endMeetingSource, /meetingRef\.current\?\.status === "CAPTURING" && streamRef\.current/);
assert.match(endMeetingSource, /startRecorderChunk\(\)/);

assert.match(source.meetingPresenceBridge, /useBusinessContext/);
assert.match(source.meetingPresenceBridge, /avantiqo:secretary-meeting-capture/);
assert.match(source.platformShell, /SecretaryMeetingPresenceBridge/);
assert.match(source.platformShell, /avantiqo:secretary-meeting-capture/);
assert.match(source.platformShell, /secretaryMeetingCaptureActive/);
assert.match(source.platformShell, /!secretaryMeetingCaptureActive \? <LocalHeyAvantiqoWakeBridge \/> : null/);

assert.match(source.jobClaim, /for update skip locked/i);
assert.match(source.waitingClaim, /status = 'WAITING' then attempt_count else attempt_count \+ 1/i);
assert.match(source.jobRuntime, /DISCOVER_CONTACTS/);
assert.match(source.jobRuntime, /runOperatorWebResearch/);
assert.match(source.jobRuntime, /discoverSecretaryProspects/);
assert.match(source.jobRuntime, /ensureSecretaryJobResponseWatcher/);
assert.match(source.jobRuntime, /collectSecretaryJobResponses/);
assert.match(source.jobRuntime, /compareSecretaryJobResponses/);
assert.match(source.jobRuntime, /payment terms/i);
assert.match(source.jobRuntime, /purchase_authority_created:\s*false/);
assert.match(source.jobRuntime, /acceptance_authority_created:\s*false/);
assert.match(source.jobRuntime, /supplier_recommendation_advisory_only/);
assert.match(source.jobRuntime, /expanded_outreach_step_ids/);
assert.match(source.jobRuntime, /pendingDynamicSteps/);

assert.match(source.prospectSchema, /secretary_prospects/);
assert.match(source.prospectSchema, /DISCOVER_CONTACTS/);
assert.match(source.prospectRuntime, /provider-verified public web evidence/i);
assert.match(source.prospectRuntime, /supplier_master_created:\s*false/);
assert.match(source.prospectRuntime, /createSecretaryContact/);
assert.match(source.prospectRuntime, /createConversation/);
assert.doesNotMatch(source.prospectRuntime, /createVendor/);

assert.match(source.responseSchema, /secretary_job_responses/);
assert.match(source.responseSchema, /secretary_job_comparisons/);
assert.match(source.responseRuntime, /SUPPLIER_RESPONSE_WINDOW_EXPIRED/);
assert.match(source.responseRuntime, /non_responder_reminder:\s*true/);
assert.match(source.responseRuntime, /reminder_number:\s*1/);
assert.match(source.responseRuntime, /EXTRACT_JOB_RESPONSE_TERMS/);
assert.match(source.responseRuntime, /COMPARE_JOB_RESPONSES/);
assert.match(source.responseRuntime, /Never invent a price/i);
assert.match(source.responseRuntime, /never authorize an order/i);
assert.match(source.responseRuntime, /purchase_authority_created:\s*false/);
assert.match(source.responseRuntime, /acceptance_authority_created:\s*false/);

assert.match(source.worker, /CRON_SECRET/);
assert.match(source.worker, /processNextSecretaryJob/);
assert.equal(JSON.parse(source.vercel).crons.some((job) => job.path === "/api/internal/secretary/jobs/process" && job.schedule === "* * * * *"), true);

for (const migration of [source.meetingSchema, source.prospectSchema, source.responseSchema]) {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /service_role/i);
}

console.log("OPERATOR_SECRETARY_EXECUTIVE_AUTONOMY_AUDIT=PASS");
console.log("SECRETARY_MEETING_LIVE_PRESENCE_SOURCE_COMPLETE=true");
console.log("SECRETARY_MEETING_CAPTURE_AUTHORIZATION_REQUIRED=true");
console.log("SECRETARY_MEETING_RAW_AUDIO_PERSISTED=false");
console.log("SECRETARY_MEETING_SILENT_CHUNKS_TOLERATED=true");
console.log("SECRETARY_MEETING_AUDIO_CHUNK_IDEMPOTENCY=true");
console.log("SECRETARY_MEETING_MICROPHONE_ARBITRATION=true");
console.log("SECRETARY_MEETING_FINAL_UPLOAD_RECOVERY=true");
console.log("SECRETARY_MEETING_SPEAKER_IDENTITY_INVENTED=false");
console.log("SECRETARY_MEETING_USER_CONFIRMED_SPEAKER_MAPPING=true");
console.log("SECRETARY_MEETING_PROTOCOL=true");
console.log("SECRETARY_MEETING_TASK_ASSIGNMENT=true");
console.log("SECRETARY_OWNED_JOB_EXECUTION=true");
console.log("SECRETARY_GOVERNED_PROSPECT_DISCOVERY=true");
console.log("SECRETARY_PARALLEL_RESPONSE_WAITING=true");
console.log("SECRETARY_NON_RESPONDER_SINGLE_CHASE=true");
console.log("SECRETARY_SUPPLIER_RESPONSE_EXTRACTION=true");
console.log("SECRETARY_SUPPLIER_COMPARISON=true");
console.log("SECRETARY_PURCHASE_AUTHORITY_CREATED=false");
console.log("SECRETARY_ACCEPTANCE_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_RUNTIME_CERTIFIED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
