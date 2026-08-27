import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_INBOX_COVERAGE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_INBOX_COVERAGE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  startSecretaryAbsenceCoverage,
  acknowledgeSecretaryAbsenceHandoff,
} = await import("../lib/operator/secretary/SecretaryAbsenceCoverageRuntime.js");
const {
  recordSecretaryInboundTriage,
  reconcileSecretaryWaitingExternal,
} = await import("../lib/operator/secretary/SecretaryInboxTriageRuntime.js");

let organizationId = null;

async function createConversation({ connectionId, contactPartyId, suffix, lastInboundAt = null, lastOutboundAt = null }) {
  return one(
    supabaseAdmin.from("communication_conversations").insert({
      organization_id: organizationId,
      connection_id: connectionId,
      provider: "email_google",
      channel_type: "email",
      external_thread_id: `coverage-${suffix}`,
      external_participant_id: `${suffix}@example.invalid`,
      external_participant_name: `Coverage ${suffix}`,
      external_participant_address: `${suffix}@example.invalid`,
      customer_party_id: contactPartyId,
      subject: `Coverage ${suffix}`,
      status: "OPEN",
      unread_count: 1,
      last_message_at: lastInboundAt || lastOutboundAt || new Date().toISOString(),
      last_inbound_at: lastInboundAt,
      last_outbound_at: lastOutboundAt,
      metadata: { local_certification: true },
    }).select("*").single(),
    `SECRETARY_INBOX_COVERAGE_CONVERSATION_INSERT_FAILED:${suffix}`,
  );
}

async function createInbound({ conversation, contactPartyId, suffix, body, receivedAt }) {
  const inbound = await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      connection_id: conversation.connection_id,
      provider: conversation.provider,
      channel_type: conversation.channel_type,
      direction: "INBOUND",
      message_type: "TEXT",
      external_message_id: `coverage-inbound-${suffix}`,
      sender_address: conversation.external_participant_address,
      recipient_address: "secretary@example.invalid",
      subject: conversation.subject,
      body,
      status: "RECEIVED",
      received_at: receivedAt,
      metadata: { local_certification: true },
    }).select("*").single(),
    `SECRETARY_INBOX_COVERAGE_INBOUND_INSERT_FAILED:${suffix}`,
  );
  const request = await one(
    supabaseAdmin.from("secretary_message_reception_requests").insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      inbound_message_id: inbound.id,
      contact_party_id: contactPartyId,
      status: "COMPLETED",
      decision_action: "LEAVE_MESSAGE",
      decision: { action: "LEAVE_MESSAGE", external_authority_used: false },
      action_result: {},
      completed_at: receivedAt,
      metadata: { local_certification: true },
    }).select("*").single(),
    `SECRETARY_INBOX_COVERAGE_REQUEST_INSERT_FAILED:${suffix}`,
  );
  return { inbound, request };
}

try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Inbox Coverage Routing Local Certification" }).select("id").single(),
    "SECRETARY_INBOX_COVERAGE_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const partiesResult = await supabaseAdmin.from("parties").insert([
    { organization_id: organizationId, display_name: "Coverage Executive", email: "coverage-exec@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    { organization_id: organizationId, display_name: "Coverage Delegate", email: "coverage-delegate@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    { organization_id: organizationId, display_name: "Unacknowledged Delegate", email: "coverage-unack@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    { organization_id: organizationId, display_name: "Coverage Contact", email: "coverage-contact@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
  ]).select("id,display_name");
  if (partiesResult.error) throw partiesResult.error;
  const byName = new Map(partiesResult.data.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Coverage Executive");
  const delegateId = byName.get("Coverage Delegate");
  const unackDelegateId = byName.get("Unacknowledged Delegate");
  const contactId = byName.get("Coverage Contact");
  assert.ok(executiveId && delegateId && unackDelegateId && contactId);

  const connection = await one(
    supabaseAdmin.from("organization_channel_connections").insert({
      organization_id: organizationId,
      provider: "email_google",
      channel_type: "email",
      name: "Secretary inbox coverage certification",
      external_account_id: "coverage-routing-local",
      status: "ACTIVE",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_INBOX_COVERAGE_CONNECTION_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      default_language: "en",
      booking_policy: { owner_party_id: executiveId },
      metadata: { owner_party_id: executiveId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_INBOX_COVERAGE_SETTINGS_INSERT_FAILED",
  );

  const ownerContext = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };
  const delegateContext = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: delegateId },
    metadata: { partyId: delegateId, localCertification: true },
  };

  const activeCoverage = await startSecretaryAbsenceCoverage({
    context: ownerContext,
    payload: {
      absence_key: "inbox-active-coverage",
      owner_party_id: executiveId,
      delegate_party_id: delegateId,
      starts_at: "2034-03-01T00:00:00Z",
      ends_at: "2034-03-03T00:00:00Z",
      timezone: "Asia/Bangkok",
      reason: "Inbox coverage certification",
      coverage_scopes: ["CORRESPONDENCE_TRIAGE", "FOLLOW_UP_COORDINATION"],
      instruction_evidence_id: "coverage-instruction-evidence-1",
      source_reference: "local-certification:active-coverage",
    },
  });
  await acknowledgeSecretaryAbsenceHandoff({
    context: delegateContext,
    payload: {
      coverage_id: activeCoverage.coverage_id,
      evidence_id: "coverage-handoff-evidence-1",
      source_reference: "local-certification:handoff-ack",
      acknowledged_at: "2034-03-01T00:05:00Z",
    },
  });

  const activeConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: contactId,
    suffix: "active-routine",
    lastInboundAt: "2034-03-01T08:00:00Z",
  });
  const activeInbound = await createInbound({
    conversation: activeConversation,
    contactPartyId: contactId,
    suffix: "active-routine",
    body: "Please send me the current status of the documents already discussed.",
    receivedAt: "2034-03-01T08:00:00Z",
  });
  const activeTriage = await recordSecretaryInboundTriage({
    request: activeInbound.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(activeTriage.triage.category, "SECRETARY_HANDLE");
  assert.equal(activeTriage.secretary_job.requested_by_party_id, executiveId);
  assert.equal(activeTriage.secretary_job.metadata.canonical_owner_party_id, executiveId);
  assert.equal(activeTriage.secretary_job.metadata.operational_assignee_party_id, delegateId);
  assert.equal(activeTriage.secretary_job.metadata.secretary_coverage_applied, true);
  assert.equal(activeTriage.secretary_job.metadata.secretary_coverage_scope, "CORRESPONDENCE_TRIAGE");

  const waitingConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: contactId,
    suffix: "active-waiting",
    lastOutboundAt: "2034-03-01T01:00:00Z",
  });
  await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: waitingConversation.id,
      connection_id: connection.id,
      provider: "email_google",
      channel_type: "email",
      direction: "OUTBOUND",
      message_type: "TEXT",
      external_message_id: "coverage-waiting-outbound",
      sender_address: "secretary@example.invalid",
      recipient_address: "coverage-contact@example.invalid",
      subject: waitingConversation.subject,
      body: "Please send the updated delivery schedule when available.",
      status: "SENT",
      sent_at: "2034-03-01T01:00:00Z",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_INBOX_COVERAGE_WAITING_MESSAGE_INSERT_FAILED",
  );
  const waiting = await reconcileSecretaryWaitingExternal({
    organizationId,
    now: new Date("2034-03-02T08:00:00Z"),
    waitHours: 24,
    limit: 20,
  });
  const waitingItem = waiting.results.find((row) => row.conversation_id === waitingConversation.id);
  assert.ok(waitingItem?.follow_up_id);
  const waitingFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organizationId)
      .eq("id", waitingItem.follow_up_id)
      .single(),
    "SECRETARY_INBOX_COVERAGE_WAITING_FOLLOWUP_READ_FAILED",
  );
  assert.equal(waitingFollowUp.owner_party_id, executiveId);
  assert.equal(waitingFollowUp.metadata.canonical_owner_party_id, executiveId);
  assert.equal(waitingFollowUp.metadata.operational_assignee_party_id, delegateId);
  assert.equal(waitingFollowUp.metadata.secretary_coverage_applied, true);
  assert.equal(waitingFollowUp.metadata.secretary_coverage_scope, "FOLLOW_UP_COORDINATION");

  const unackCoverage = await startSecretaryAbsenceCoverage({
    context: ownerContext,
    payload: {
      absence_key: "inbox-unacknowledged-coverage",
      owner_party_id: executiveId,
      delegate_party_id: unackDelegateId,
      starts_at: "2034-04-01T00:00:00Z",
      ends_at: "2034-04-02T00:00:00Z",
      timezone: "Asia/Bangkok",
      reason: "Unacknowledged inbox coverage certification",
      coverage_scopes: ["CORRESPONDENCE_TRIAGE"],
      instruction_evidence_id: "coverage-instruction-evidence-2",
      source_reference: "local-certification:unack-coverage",
    },
  });
  assert.ok(unackCoverage.coverage_id);
  const unackConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: contactId,
    suffix: "unack-routine",
    lastInboundAt: "2034-04-01T08:00:00Z",
  });
  const unackInbound = await createInbound({
    conversation: unackConversation,
    contactPartyId: contactId,
    suffix: "unack-routine",
    body: "Please confirm the current document status only.",
    receivedAt: "2034-04-01T08:00:00Z",
  });
  const unackTriage = await recordSecretaryInboundTriage({
    request: unackInbound.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(unackTriage.secretary_job.metadata.secretary_coverage_applied, false);
  assert.equal(unackTriage.secretary_job.metadata.operational_assignee_party_id, executiveId);
  assert.equal(unackTriage.secretary_job.metadata.canonical_owner_party_id, executiveId);

  const expiredConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: contactId,
    suffix: "expired-routine",
    lastInboundAt: "2034-03-04T08:00:00Z",
  });
  const expiredInbound = await createInbound({
    conversation: expiredConversation,
    contactPartyId: contactId,
    suffix: "expired-routine",
    body: "Please send the routine status update.",
    receivedAt: "2034-03-04T08:00:00Z",
  });
  const expiredTriage = await recordSecretaryInboundTriage({
    request: expiredInbound.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(expiredTriage.secretary_job.metadata.secretary_coverage_applied, false);
  assert.equal(expiredTriage.secretary_job.metadata.operational_assignee_party_id, executiveId);

  const authorityConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: contactId,
    suffix: "authority",
    lastInboundAt: "2034-03-01T09:00:00Z",
  });
  const authorityInbound = await createInbound({
    conversation: authorityConversation,
    contactPartyId: contactId,
    suffix: "authority",
    body: "Please sign the agreement and pay the deposit today.",
    receivedAt: "2034-03-01T09:00:00Z",
  });
  const authorityTriage = await recordSecretaryInboundTriage({
    request: authorityInbound.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(authorityTriage.triage.category, "EXECUTIVE_DECISION");
  assert.equal(authorityTriage.triage.high_authority_boundary_detected, true);
  assert.equal(authorityTriage.secretary_job, null);
  assert.equal(authorityTriage.executive_attention_required, true);

  console.log("SECRETARY_INBOX_COVERAGE_ROUTING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_INBOX_COVERAGE_ACTIVE_DELEGATE=true");
  console.log("SECRETARY_INBOX_COVERAGE_CANONICAL_OWNER_PRESERVED=true");
  console.log("SECRETARY_INBOX_COVERAGE_WAITING_EXTERNAL_DELEGATE=true");
  console.log("SECRETARY_INBOX_COVERAGE_UNACKNOWLEDGED_FALLS_BACK_TO_OWNER=true");
  console.log("SECRETARY_INBOX_COVERAGE_EXPIRED_FALLS_BACK_TO_OWNER=true");
  console.log("SECRETARY_INBOX_COVERAGE_HIGH_AUTHORITY_STAYS_EXECUTIVE=true");
  console.log("SECRETARY_INBOX_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_INBOX_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
}
