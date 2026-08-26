import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_INBOX_TRIAGE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_INBOX_TRIAGE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

async function many(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return Array.isArray(resolved.data) ? resolved.data : [];
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  readSecretaryInboxTriage,
  recordSecretaryInboundTriage,
  reconcileSecretaryWaitingExternal,
  repairSecretaryMissingInboundTriage,
} = await import("../lib/operator/secretary/SecretaryInboxTriageRuntime.js");
const { readSecretaryExecutiveBriefing } = await import("../lib/operator/secretary/SecretaryExecutiveBriefingRuntime.js");
const { createSecretaryInboxTriageCapability } = await import("../lib/platform/capabilities/createSecretaryInboxTriageCapability.js");

let organizationId = null;

async function createConversation({
  connectionId,
  contactPartyId,
  suffix,
  subject,
  lastInboundAt = null,
  lastOutboundAt = null,
}) {
  return one(
    supabaseAdmin.from("communication_conversations").insert({
      organization_id: organizationId,
      connection_id: connectionId,
      provider: "email_google",
      channel_type: "email",
      external_thread_id: `triage-${suffix}`,
      external_participant_id: `contact-${suffix}@example.invalid`,
      external_participant_name: `Contact ${suffix}`,
      external_participant_address: `contact-${suffix}@example.invalid`,
      customer_party_id: contactPartyId,
      subject,
      status: "OPEN",
      unread_count: 1,
      last_message_at: lastInboundAt || lastOutboundAt || new Date().toISOString(),
      last_inbound_at: lastInboundAt,
      last_outbound_at: lastOutboundAt,
      metadata: { local_certification: true },
    }).select("*").single(),
    `SECRETARY_INBOX_TRIAGE_CONVERSATION_INSERT_FAILED:${suffix}`,
  );
}

async function createInboundRequest({ conversation, contactPartyId, suffix, body, decisionAction, status = "COMPLETED" }) {
  const now = new Date().toISOString();
  const inbound = await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      connection_id: conversation.connection_id,
      provider: conversation.provider,
      channel_type: conversation.channel_type,
      direction: "INBOUND",
      message_type: "TEXT",
      external_message_id: `triage-inbound-${suffix}`,
      sender_address: conversation.external_participant_address,
      recipient_address: "secretary@example.invalid",
      subject: conversation.subject,
      body,
      status: "RECEIVED",
      received_at: now,
      metadata: { local_certification: true },
    }).select("*").single(),
    `SECRETARY_INBOX_TRIAGE_INBOUND_INSERT_FAILED:${suffix}`,
  );
  const request = await one(
    supabaseAdmin.from("secretary_message_reception_requests").insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      inbound_message_id: inbound.id,
      contact_party_id: contactPartyId,
      status,
      decision_action: decisionAction,
      decision: { action: decisionAction, external_authority_used: false },
      action_result: {},
      completed_at: status === "COMPLETED" ? now : null,
      metadata: { local_certification: true },
    }).select("*").single(),
    `SECRETARY_INBOX_TRIAGE_REQUEST_INSERT_FAILED:${suffix}`,
  );
  return { inbound, request };
}

try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Inbox Triage Local Certification" }).select("id").single(),
    "SECRETARY_INBOX_TRIAGE_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive", email: "executive@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Routine Contact", email: "routine@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Decision Contact", email: "decision@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_INBOX_TRIAGE_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Executive");
  const routineContactId = byName.get("Routine Contact");
  const decisionContactId = byName.get("Decision Contact");
  assert.ok(executiveId && routineContactId && decisionContactId);

  const connection = await one(
    supabaseAdmin.from("organization_channel_connections").insert({
      organization_id: organizationId,
      provider: "email_google",
      channel_type: "email",
      name: "Secretary inbox triage certification",
      external_account_id: "triage-local",
      status: "ACTIVE",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_INBOX_TRIAGE_CONNECTION_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      default_language: "en",
      booking_policy: { owner_party_id: executiveId },
      metadata: { owner_party_id: executiveId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_INBOX_TRIAGE_SETTINGS_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };

  const routineConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: routineContactId,
    suffix: "routine",
    subject: "Routine status request",
    lastInboundAt: "2026-10-01T03:00:00Z",
  });
  const routine = await createInboundRequest({
    conversation: routineConversation,
    contactPartyId: routineContactId,
    suffix: "routine",
    body: "Please send me the current status of the documents we already discussed.",
    decisionAction: "LEAVE_MESSAGE",
  });
  const routineTriage = await recordSecretaryInboundTriage({
    request: routine.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(routineTriage.triage.category, "SECRETARY_HANDLE");
  assert.equal(routineTriage.executive_attention_required, false);
  assert.equal(routineTriage.secretary_owns_follow_through, true);
  assert.ok(routineTriage.secretary_job?.id);
  assert.equal(routineTriage.secretary_job.autonomy_level, "EXECUTE_WITH_GATES");

  const routineReplay = await recordSecretaryInboundTriage({
    request: routine.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(routineReplay.secretary_job.id, routineTriage.secretary_job.id);
  const routineJobs = await many(
    supabaseAdmin.from("secretary_jobs").select("id").eq("organization_id", organizationId).eq("source_id", routine.request.id),
    "SECRETARY_INBOX_TRIAGE_ROUTINE_JOB_COUNT_FAILED",
  );
  assert.equal(routineJobs.length, 1);

  const decisionConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: decisionContactId,
    suffix: "decision",
    subject: "Discount exception",
    lastInboundAt: "2026-10-01T04:00:00Z",
  });
  const decision = await createInboundRequest({
    conversation: decisionConversation,
    contactPartyId: decisionContactId,
    suffix: "decision",
    body: "Can you approve a 10% discount exception for this customer?",
    decisionAction: "LEAVE_MESSAGE",
  });
  const decisionTriage = await recordSecretaryInboundTriage({
    request: decision.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(decisionTriage.triage.category, "EXECUTIVE_DECISION");
  assert.equal(decisionTriage.triage.business_decision_boundary_detected, true);
  assert.equal(decisionTriage.executive_attention_required, true);
  assert.equal(decisionTriage.secretary_job, null);

  const authorityConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: decisionContactId,
    suffix: "authority",
    subject: "Agreement and deposit",
    lastInboundAt: "2026-10-01T05:00:00Z",
  });
  const authority = await createInboundRequest({
    conversation: authorityConversation,
    contactPartyId: decisionContactId,
    suffix: "authority",
    body: "Please sign the agreement and pay the deposit today.",
    decisionAction: "LEAVE_MESSAGE",
  });
  const authorityTriage = await recordSecretaryInboundTriage({
    request: authority.request,
    result: { status: "completed", action: "LEAVE_MESSAGE", action_result: { message_recorded: true } },
  });
  assert.equal(authorityTriage.triage.category, "EXECUTIVE_DECISION");
  assert.equal(authorityTriage.triage.high_authority_boundary_detected, true);
  assert.equal(authorityTriage.secretary_job, null);

  const fyiConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: routineContactId,
    suffix: "fyi",
    subject: "Automated receipt",
    lastInboundAt: "2026-10-01T06:00:00Z",
  });
  const fyi = await createInboundRequest({
    conversation: fyiConversation,
    contactPartyId: routineContactId,
    suffix: "fyi",
    body: "Automated delivery receipt. No reply required.",
    decisionAction: "NO_REPLY",
  });
  const fyiTriage = await recordSecretaryInboundTriage({
    request: fyi.request,
    result: { status: "completed", action: "NO_REPLY", action_result: {} },
  });
  assert.equal(fyiTriage.triage.category, "FYI");
  assert.equal(fyiTriage.executive_attention_required, false);

  const waitingConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: routineContactId,
    suffix: "waiting",
    subject: "Existing information request",
    lastOutboundAt: "2026-10-01T00:00:00Z",
  });
  const waitingOutbound = await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: waitingConversation.id,
      connection_id: connection.id,
      provider: "email_google",
      channel_type: "email",
      direction: "OUTBOUND",
      message_type: "TEXT",
      external_message_id: "triage-waiting-outbound",
      sender_address: "secretary@example.invalid",
      recipient_address: "routine@example.invalid",
      subject: waitingConversation.subject,
      body: "Please send the updated delivery schedule when available.",
      status: "SENT",
      sent_at: "2026-10-01T00:00:00Z",
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_INBOX_TRIAGE_WAITING_OUTBOUND_INSERT_FAILED",
  );

  const reconcileNow = new Date("2026-10-03T06:00:00Z");
  const waitingFirst = await reconcileSecretaryWaitingExternal({ organizationId, now: reconcileNow, waitHours: 24, limit: 20 });
  const waitingFirstItem = waitingFirst.results.find((row) => row.conversation_id === waitingConversation.id);
  assert.ok(waitingFirstItem?.follow_up_id);
  assert.equal(waitingFirstItem.triage.category, "WAITING_EXTERNAL");
  assert.equal(waitingFirstItem.triage.secretary_owns_follow_through, true);

  const waitingSecond = await reconcileSecretaryWaitingExternal({ organizationId, now: reconcileNow, waitHours: 24, limit: 20 });
  const waitingSecondItem = waitingSecond.results.find((row) => row.conversation_id === waitingConversation.id);
  assert.equal(waitingSecondItem.follow_up_id, waitingFirstItem.follow_up_id);
  const waitingFollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organizationId)
      .eq("conversation_id", waitingConversation.id)
      .contains("metadata", { inbox_waiting_external: true }),
    "SECRETARY_INBOX_TRIAGE_WAITING_FOLLOWUP_COUNT_FAILED",
  );
  assert.equal(waitingFollowUps.length, 1);
  assert.equal(waitingFollowUps[0].metadata?.execution_owner, "SECRETARY");
  assert.equal(waitingFollowUps[0].metadata?.execution_ready, true);
  assert.equal(waitingFollowUps[0].metadata?.source_outbound_message_id, waitingOutbound.id);

  const response = await createInboundRequest({
    conversation: waitingConversation,
    contactPartyId: routineContactId,
    suffix: "waiting-response",
    body: "The updated delivery schedule is attached in our system; thanks.",
    decisionAction: "ANSWER",
  });
  await recordSecretaryInboundTriage({
    request: response.request,
    result: { status: "completed", action: "ANSWER", response_text: "Thank you." },
  });
  const cancelledChase = await one(
    supabaseAdmin.from("secretary_follow_ups").select("status,metadata")
      .eq("organization_id", organizationId)
      .eq("id", waitingFirstItem.follow_up_id)
      .single(),
    "SECRETARY_INBOX_TRIAGE_CANCELLED_CHASE_READ_FAILED",
  );
  assert.equal(cancelledChase.status, "CANCELLED");
  assert.equal(cancelledChase.metadata?.cancelled_by_inbound_response, true);

  const blockedConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: decisionContactId,
    suffix: "blocked-wait",
    subject: "Binding request",
    lastOutboundAt: "2026-10-01T01:00:00Z",
  });
  await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: blockedConversation.id,
      connection_id: connection.id,
      provider: "email_google",
      channel_type: "email",
      direction: "OUTBOUND",
      message_type: "TEXT",
      external_message_id: "triage-blocked-outbound",
      sender_address: "secretary@example.invalid",
      recipient_address: "decision@example.invalid",
      subject: blockedConversation.subject,
      body: "Please sign the agreement and confirm payment of the deposit.",
      status: "SENT",
      sent_at: "2026-10-01T01:00:00Z",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_INBOX_TRIAGE_BLOCKED_OUTBOUND_INSERT_FAILED",
  );
  const blockedReconcile = await reconcileSecretaryWaitingExternal({ organizationId, now: reconcileNow, waitHours: 24, limit: 20 });
  const blockedItem = blockedReconcile.results.find((row) => row.conversation_id === blockedConversation.id);
  assert.equal(blockedItem.triage.category, "EXECUTIVE_DECISION");
  assert.equal(blockedItem.follow_up_id, null);
  assert.equal(blockedItem.triage.high_authority_boundary_detected, true);

  const repairConversation = await createConversation({
    connectionId: connection.id,
    contactPartyId: routineContactId,
    suffix: "repair",
    subject: "Interrupted triage fixture",
    lastInboundAt: "2026-10-01T07:00:00Z",
  });
  const repair = await createInboundRequest({
    conversation: repairConversation,
    contactPartyId: routineContactId,
    suffix: "repair",
    body: "Please check the existing status and follow up with me.",
    decisionAction: "LEAVE_MESSAGE",
  });
  const repairResult = await repairSecretaryMissingInboundTriage({ limit: 50 });
  assert.ok(repairResult.repaired_count >= 1);
  assert.equal(repairResult.repair_candidates_selected_server_side, true);
  assert.equal(repairResult.oldest_untriaged_first, true);
  const repairedRequest = await one(
    supabaseAdmin.from("secretary_message_reception_requests").select("metadata")
      .eq("organization_id", organizationId)
      .eq("id", repair.request.id)
      .single(),
    "SECRETARY_INBOX_TRIAGE_REPAIRED_REQUEST_READ_FAILED",
  );
  assert.equal(repairedRequest.metadata?.secretary_inbox_triage?.category, "SECRETARY_HANDLE");

  const desk = await readSecretaryInboxTriage({ context, payload: { limit: 100 } });
  assert.ok(desk.executive_attention_count >= 3);
  assert.ok(desk.executive_decisions.some((row) => row.id === decisionConversation.id));
  assert.ok(desk.executive_decisions.some((row) => row.id === authorityConversation.id));
  assert.ok(desk.executive_decisions.some((row) => row.id === blockedConversation.id));
  assert.ok(desk.fyi.some((row) => row.id === fyiConversation.id));
  assert.equal(desk.external_authority_used, false);

  const briefing = await readSecretaryExecutiveBriefing({ context, payload: { limit: 100, horizon_hours: 24 } });
  assert.equal(briefing.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V3");
  assert.ok(briefing.executive_desk.correspondence.attention_required.length >= 3);
  assert.ok(briefing.executive_desk.executive_interrupt_count >= 3);
  assert.equal(briefing.executive_desk.no_action_required, false);
  assert.equal(briefing.inbox_attention_is_exception_based, true);

  const capability = createSecretaryInboxTriageCapability();
  assert.equal(capability.authorize({ context }), true);
  assert.equal(capability.manifest.operatorAutoExecute, true);
  assert.equal(capability.manifest.operatorRequiresConfirmation, false);
  const capabilityRead = await capability.execute({ context, payload: { limit: 100 } });
  assert.equal(capabilityRead.contract, "AVANTIQO_EXECUTIVE_SECRETARY_INBOX_TRIAGE_V1");

  console.log("SECRETARY_INBOX_TRIAGE_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_INBOX_ROUTINE_WORK_SECRETARY_OWNED=true");
  console.log("SECRETARY_INBOX_ROUTINE_JOB_IDEMPOTENT=true");
  console.log("SECRETARY_INBOX_BUSINESS_DECISION_ESCALATED=true");
  console.log("SECRETARY_INBOX_HIGH_AUTHORITY_ESCALATED=true");
  console.log("SECRETARY_INBOX_FYI_SUPPRESSED_FROM_EXECUTIVE=true");
  console.log("SECRETARY_INBOX_WAITING_EXTERNAL_CHASE_CREATED=true");
  console.log("SECRETARY_INBOX_WAITING_EXTERNAL_CHASE_IDEMPOTENT=true");
  console.log("SECRETARY_INBOX_INBOUND_RESPONSE_CANCELS_STALE_CHASE=true");
  console.log("SECRETARY_INBOX_HIGH_AUTHORITY_AUTO_CHASE_BLOCKED=true");
  console.log("SECRETARY_INBOX_INTERRUPTED_TRIAGE_REPAIR=true");
  console.log("SECRETARY_INBOX_EXECUTIVE_BRIEFING_INTEGRATED=true");
  console.log("SECRETARY_INBOX_EXECUTIVE_ATTENTION_EXCEPTION_BASED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
