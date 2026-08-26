import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_FOLLOW_THROUGH_CANCEL_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_FOLLOW_THROUGH_CANCEL_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

async function many(result, label) {
  const data = await one(result, label);
  return Array.isArray(data) ? data : [];
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { cancelSecretaryJob } = await import("../lib/operator/secretary/SecretaryJobReviewRuntime.js");
const { dispatchSecretarySipOutboundCall } = await import("../lib/operator/secretary/SecretarySipGatewayTransportRuntime.js");

let organizationId = null;
let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  fetchCalls += 1;
  return originalFetch(...args);
};

try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Follow Through Cancellation Local Certification" }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const actor = await one(
    supabaseAdmin.from("parties").insert({
      organization_id: organizationId,
      display_name: "Secretary Cancellation Operator",
      party_type: "PERSON",
      status: "ACTIVE",
      email: "operator@example.local",
      phone: "+66000000001",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_ACTOR_INSERT_FAILED",
  );

  const contact = await one(
    supabaseAdmin.from("parties").insert({
      organization_id: organizationId,
      display_name: "Secretary Cancellation Contact",
      party_type: "PERSON",
      status: "ACTIVE",
      email: "contact@example.local",
      phone: "+66000000002",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_CONTACT_INSERT_FAILED",
  );

  const connection = await one(
    supabaseAdmin.from("organization_channel_connections").insert({
      organization_id: organizationId,
      provider: "email_google",
      channel_type: "EMAIL",
      name: "Local certification email",
      status: "ACTIVE",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_CONNECTION_INSERT_FAILED",
  );

  const conversation = await one(
    supabaseAdmin.from("communication_conversations").insert({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: "email_google",
      channel_type: "EMAIL",
      external_thread_id: "local-follow-through-cancel-thread",
      external_participant_id: "contact@example.local",
      external_participant_name: "Secretary Cancellation Contact",
      external_participant_address: "contact@example.local",
      customer_party_id: contact.id,
      subject: "Local cancellation certification",
      status: "OPEN",
      unread_count: 0,
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_CONVERSATION_INSERT_FAILED",
  );

  const phoneLine = await one(
    supabaseAdmin.from("secretary_phone_lines").insert({
      organization_id: organizationId,
      owner_party_id: actor.id,
      line_address: "sip:local-certification@example.local",
      transport_kind: "SIP",
      display_name: "Local certification line",
      timezone: "Asia/Bangkok",
      inbound_enabled: true,
      outbound_enabled: true,
      active: true,
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_PHONE_LINE_INSERT_FAILED",
  );

  const job = await one(
    supabaseAdmin.from("secretary_jobs").insert({
      organization_id: organizationId,
      requested_by_party_id: actor.id,
      source_kind: "MANUAL",
      objective: "Certify cancellation fences future Secretary follow-through without erasing completed history.",
      success_criteria: [],
      status: "ACTIVE",
      autonomy_level: "EXECUTE_WITH_GATES",
      approval_policy: {},
      execution_plan: [],
      next_action_at: new Date().toISOString(),
      metadata: { local_certification: true, external_authority_used: false },
    }).select("*").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_JOB_INSERT_FAILED",
  );

  const steps = await many(
    supabaseAdmin.from("secretary_job_steps").insert([
      {
        organization_id: organizationId,
        job_id: job.id,
        sequence_number: 1,
        action_type: "EMAIL",
        instruction: "Send information request and wait for reply.",
        status: "WAITING",
        target_party_id: contact.id,
        metadata: { await_response: true, local_certification: true },
      },
      {
        organization_id: organizationId,
        job_id: job.id,
        sequence_number: 2,
        action_type: "CALL",
        instruction: "Call once if still needed.",
        status: "PENDING",
        target_party_id: contact.id,
        metadata: { local_certification: true },
      },
    ]).select("id,sequence_number"),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_STEPS_INSERT_FAILED",
  );
  const emailStep = steps.find((row) => row.sequence_number === 1);
  const callStep = steps.find((row) => row.sequence_number === 2);
  assert.ok(emailStep?.id && callStep?.id);

  const pendingEmailFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      contact_party_id: contact.id,
      conversation_id: conversation.id,
      action_type: "EMAIL",
      reason: "Pending job-linked email reminder",
      status: "PENDING",
      due_at: new Date(Date.now() - 60_000).toISOString(),
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: "Politely chase the requested information once.",
        secretary_job_id: job.id,
        secretary_job_step_id: emailStep.id,
        local_certification: true,
      },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_EMAIL_FOLLOW_UP_INSERT_FAILED",
  );

  const pendingCallFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      contact_party_id: contact.id,
      action_type: "CALL",
      reason: "Pending job-linked call reminder",
      status: "PENDING",
      due_at: new Date(Date.now() - 60_000).toISOString(),
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: "Call the contact once about the outstanding request.",
        secretary_job_id: job.id,
        secretary_job_step_id: callStep.id,
        local_certification: true,
      },
    }).select("id").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_CALL_FOLLOW_UP_INSERT_FAILED",
  );

  const completedFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      contact_party_id: contact.id,
      conversation_id: conversation.id,
      action_type: "EMAIL",
      reason: "Already completed historical follow-up",
      status: "COMPLETED",
      due_at: new Date(Date.now() - 3_600_000).toISOString(),
      result: "Already sent before cancellation",
      completed_at: new Date(Date.now() - 3_000_000).toISOString(),
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        secretary_job_id: job.id,
        secretary_job_step_id: emailStep.id,
        local_certification_history: true,
      },
    }).select("id,status,result,completed_at").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_COMPLETED_FOLLOW_UP_INSERT_FAILED",
  );

  const queuedMessage = await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      connection_id: connection.id,
      provider: "email_google",
      channel_type: "EMAIL",
      direction: "OUTBOUND",
      message_type: "TEXT",
      recipient_address: "contact@example.local",
      subject: "Queued reminder",
      body: "Queued reminder that must not send after cancellation.",
      status: "QUEUED",
      metadata: { local_certification: true },
    }).select("id,status").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_QUEUED_MESSAGE_INSERT_FAILED",
  );

  const sentMessage = await one(
    supabaseAdmin.from("communication_messages").insert({
      organization_id: organizationId,
      conversation_id: conversation.id,
      connection_id: connection.id,
      provider: "email_google",
      channel_type: "EMAIL",
      direction: "OUTBOUND",
      message_type: "TEXT",
      recipient_address: "contact@example.local",
      subject: "Historical sent message",
      body: "Historical sent message must remain sent.",
      status: "SENT",
      sent_at: new Date(Date.now() - 3_000_000).toISOString(),
      metadata: { local_certification_history: true },
    }).select("id,status,sent_at").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_SENT_MESSAGE_INSERT_FAILED",
  );

  const claimedCall = await one(
    supabaseAdmin.from("secretary_outbound_call_requests").insert({
      organization_id: organizationId,
      phone_line_id: phoneLine.id,
      contact_party_id: contact.id,
      requested_by_party_id: actor.id,
      remote_address: "+66000000002",
      objective: "Local stale claim cancellation certification",
      status: "CLAIMED",
      scheduled_at: new Date(Date.now() - 60_000).toISOString(),
      attempt_count: 1,
      max_attempts: 3,
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
      claim_token: crypto.randomUUID(),
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_CLAIMED_CALL_INSERT_FAILED",
  );

  const emailExecution = await one(
    supabaseAdmin.from("secretary_follow_up_executions").insert({
      organization_id: organizationId,
      follow_up_id: pendingEmailFollowUp.id,
      contact_party_id: contact.id,
      action_type: "EMAIL",
      instruction: "Politely chase the requested information once.",
      status: "QUEUED",
      available_at: new Date().toISOString(),
      conversation_id: conversation.id,
      message_id: queuedMessage.id,
      metadata: { local_certification: true },
    }).select("id,status").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_EMAIL_EXECUTION_INSERT_FAILED",
  );

  const callExecution = await one(
    supabaseAdmin.from("secretary_follow_up_executions").insert({
      organization_id: organizationId,
      follow_up_id: pendingCallFollowUp.id,
      contact_party_id: contact.id,
      action_type: "CALL",
      instruction: "Call the contact once about the outstanding request.",
      status: "QUEUED",
      available_at: new Date().toISOString(),
      outbound_call_request_id: claimedCall.id,
      metadata: { local_certification: true },
    }).select("id,status").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_CALL_EXECUTION_INSERT_FAILED",
  );

  const completedExecution = await one(
    supabaseAdmin.from("secretary_follow_up_executions").insert({
      organization_id: organizationId,
      follow_up_id: completedFollowUp.id,
      contact_party_id: contact.id,
      action_type: "EMAIL",
      instruction: "Historical execution",
      status: "COMPLETED",
      available_at: new Date(Date.now() - 3_600_000).toISOString(),
      conversation_id: conversation.id,
      message_id: sentMessage.id,
      completed_at: new Date(Date.now() - 3_000_000).toISOString(),
      metadata: { local_certification_history: true },
    }).select("id,status,completed_at").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_COMPLETED_EXECUTION_INSERT_FAILED",
  );

  const responseWatcher = await one(
    supabaseAdmin.from("secretary_job_responses").insert({
      organization_id: organizationId,
      job_id: job.id,
      job_step_id: emailStep.id,
      contact_party_id: contact.id,
      conversation_id: conversation.id,
      outbound_message_id: queuedMessage.id,
      channel_type: "EMAIL",
      status: "AWAITING",
      sent_at: new Date(Date.now() - 120_000).toISOString(),
      response_due_at: new Date(Date.now() + 3_600_000).toISOString(),
      metadata: { local_certification: true },
    }).select("id,status").single(),
    "SECRETARY_FOLLOW_THROUGH_CANCEL_RESPONSE_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: actor.id },
    metadata: { partyId: actor.id, localCertification: true },
  };

  const cancellation = await cancelSecretaryJob({
    context,
    payload: { job_id: job.id, reason: "Cancel all future follow-through in local certification" },
  });
  assert.equal(cancellation.status, "cancelled");
  assert.equal(cancellation.job.status, "CANCELLED");
  assert.equal(cancellation.follow_through_cancelled.cancelled_follow_ups, 2);
  assert.equal(cancellation.follow_through_cancelled.skipped_follow_up_executions, 2);
  assert.equal(cancellation.follow_through_cancelled.cancelled_outbound_call_requests, 1);
  assert.equal(cancellation.follow_through_cancelled.quarantined_outbound_messages, 1);
  assert.equal(cancellation.follow_through_cancelled.cancelled_response_watchers, 1);

  const [emailFollowUpAfter, callFollowUpAfter, completedFollowUpAfter, emailExecutionAfter, callExecutionAfter, completedExecutionAfter, queuedMessageAfter, sentMessageAfter, callAfter, responseAfter] = await Promise.all([
    one(supabaseAdmin.from("secretary_follow_ups").select("status,result,completed_at").eq("id", pendingEmailFollowUp.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_EMAIL_FOLLOW_UP_READ_FAILED"),
    one(supabaseAdmin.from("secretary_follow_ups").select("status,result,completed_at").eq("id", pendingCallFollowUp.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_CALL_FOLLOW_UP_READ_FAILED"),
    one(supabaseAdmin.from("secretary_follow_ups").select("status,result,completed_at").eq("id", completedFollowUp.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_COMPLETED_FOLLOW_UP_READ_FAILED"),
    one(supabaseAdmin.from("secretary_follow_up_executions").select("status,last_error,completed_at").eq("id", emailExecution.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_EMAIL_EXECUTION_READ_FAILED"),
    one(supabaseAdmin.from("secretary_follow_up_executions").select("status,last_error,completed_at").eq("id", callExecution.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_CALL_EXECUTION_READ_FAILED"),
    one(supabaseAdmin.from("secretary_follow_up_executions").select("status,completed_at").eq("id", completedExecution.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_COMPLETED_EXECUTION_READ_FAILED"),
    one(supabaseAdmin.from("communication_messages").select("status,error_code,error_message,sent_at").eq("id", queuedMessage.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_QUEUED_MESSAGE_READ_FAILED"),
    one(supabaseAdmin.from("communication_messages").select("status,error_code,error_message,sent_at").eq("id", sentMessage.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_SENT_MESSAGE_READ_FAILED"),
    one(supabaseAdmin.from("secretary_outbound_call_requests").select("status,claim_token,lease_expires_at,last_error").eq("id", claimedCall.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_CALL_READ_FAILED"),
    one(supabaseAdmin.from("secretary_job_responses").select("status,last_error").eq("id", responseWatcher.id).single(), "SECRETARY_FOLLOW_THROUGH_CANCEL_RESPONSE_READ_FAILED"),
  ]);

  assert.equal(emailFollowUpAfter.status, "CANCELLED");
  assert.equal(callFollowUpAfter.status, "CANCELLED");
  assert.match(emailFollowUpAfter.result, /^SECRETARY_JOB_CANCELLED:/);
  assert.match(callFollowUpAfter.result, /^SECRETARY_JOB_CANCELLED:/);
  assert.ok(emailFollowUpAfter.completed_at && callFollowUpAfter.completed_at);
  assert.equal(emailExecutionAfter.status, "SKIPPED");
  assert.equal(callExecutionAfter.status, "SKIPPED");
  assert.equal(emailExecutionAfter.last_error, "PARENT_SECRETARY_JOB_CANCELLED");
  assert.equal(callExecutionAfter.last_error, "PARENT_SECRETARY_JOB_CANCELLED");
  assert.equal(queuedMessageAfter.status, "FAILED");
  assert.equal(queuedMessageAfter.error_code, "SECRETARY_PARENT_JOB_CANCELLED");
  assert.equal(queuedMessageAfter.sent_at, null);
  assert.equal(callAfter.status, "CANCELLED");
  assert.equal(callAfter.claim_token, null);
  assert.equal(callAfter.lease_expires_at, null);
  assert.equal(callAfter.last_error, "PARENT_SECRETARY_JOB_CANCELLED");
  assert.equal(responseAfter.status, "CANCELLED");
  assert.equal(responseAfter.last_error, "PARENT_SECRETARY_JOB_CANCELLED");

  assert.equal(completedFollowUpAfter.status, "COMPLETED");
  assert.equal(completedFollowUpAfter.result, completedFollowUp.result);
  assert.equal(completedFollowUpAfter.completed_at, completedFollowUp.completed_at);
  assert.equal(completedExecutionAfter.status, "COMPLETED");
  assert.equal(completedExecutionAfter.completed_at, completedExecution.completed_at);
  assert.equal(sentMessageAfter.status, "SENT");
  assert.equal(sentMessageAfter.sent_at, sentMessage.sent_at);
  assert.equal(sentMessageAfter.error_code, null);

  const fetchCallsBeforeStaleDispatch = fetchCalls;
  const staleDispatch = await dispatchSecretarySipOutboundCall(claimedCall);
  assert.equal(staleDispatch.status, "cancelled_or_stale");
  assert.equal(staleDispatch.gateway_acknowledged, false);
  assert.equal(staleDispatch.dispatch_performed, false);
  assert.equal(staleDispatch.stale_claim_fenced, true);
  assert.equal(fetchCalls, fetchCallsBeforeStaleDispatch);

  console.log("SECRETARY_JOB_FOLLOW_THROUGH_CANCELLATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_CANCEL_PENDING_JOB_FOLLOW_UPS=true");
  console.log("SECRETARY_CANCEL_NONTERMINAL_FOLLOW_UP_EXECUTIONS=true");
  console.log("SECRETARY_CANCEL_QUEUED_OUTBOUND_MESSAGE=true");
  console.log("SECRETARY_CANCEL_PENDING_OR_CLAIMED_OUTBOUND_CALL=true");
  console.log("SECRETARY_CANCEL_RESPONSE_WATCHER=true");
  console.log("SECRETARY_CANCEL_COMPLETED_HISTORY_PRESERVED=true");
  console.log("SECRETARY_CANCEL_SENT_HISTORY_PRESERVED=true");
  console.log("SECRETARY_SIP_STALE_CLAIM_DISPATCH_FENCED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  globalThis.fetch = originalFetch;
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
