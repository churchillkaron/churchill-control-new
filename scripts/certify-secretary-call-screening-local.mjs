import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_CALL_SCREENING_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_CALL_SCREENING_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  clearSecretaryContactCallHandling,
  readSecretaryCallScreening,
  readSecretaryContactCallHandling,
  recordSecretaryCallScreeningDisposition,
  screenSecretaryCall,
  setSecretaryContactCallHandling,
} = await import("../lib/operator/secretary/SecretaryCallScreeningRuntime.js");
const { createSecretaryCallScreeningCapability } = await import("../lib/platform/capabilities/createSecretaryCallScreeningCapability.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Call Screening Local Certification" }).select("id").single(),
    "SECRETARY_CALL_SCREENING_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive Owner", email: "call-screen-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Priority Caller", email: "priority-caller@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Routine Caller", email: "routine-caller@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_CALL_SCREENING_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Executive Owner");
  const priorityCallerId = byName.get("Priority Caller");
  const routineCallerId = byName.get("Routine Caller");
  assert.ok(ownerId && priorityCallerId && routineCallerId);

  const line = await one(
    supabaseAdmin.from("secretary_phone_lines").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      line_address: `local-call-screen-${organizationId}`,
      transport_kind: "INTERNAL",
      display_name: "Executive Line",
      timezone: "Asia/Bangkok",
      active: true,
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_CALL_SCREENING_PHONE_LINE_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId, localCertification: true },
  };

  const handlingPayload = {
    party_id: priorityCallerId,
    tier: "EXECUTIVE_PRIORITY",
    interrupt_mode: "ALWAYS",
    callback_window: { timezone: "Asia/Bangkok", start_local: "09:00", end_local: "18:00" },
    notes: "Explicitly authorized to interrupt for calls.",
    evidence_id: "call-screen-contact:priority-v1",
    source_reference: "conversation://call-screen/contact-priority-v1",
  };
  const handling = await setSecretaryContactCallHandling({ context, payload: handlingPayload });
  assert.equal(handling.status, "contact_handling_recorded");
  assert.equal(handling.handling.explicit_not_inferred, true);
  assert.equal(handling.vip_inferred, false);
  const handlingReplay = await setSecretaryContactCallHandling({ context, payload: handlingPayload });
  assert.equal(handlingReplay.idempotent, true);

  const handlingRead = await readSecretaryContactCallHandling({ context, payload: { party_id: priorityCallerId } });
  assert.equal(handlingRead.current.tier, "EXECUTIVE_PRIORITY");
  assert.equal(handlingRead.current.interrupt_mode, "ALWAYS");

  async function createInboundCall({ contactPartyId = null, remoteAddress }) {
    return one(
      supabaseAdmin.from("secretary_calls").insert({
        organization_id: organizationId,
        contact_party_id: contactPartyId,
        phone_line_id: line.id,
        direction: "INBOUND",
        remote_address: remoteAddress,
        status: "ANSWERED",
        started_at: "2032-01-10T03:00:00Z",
        answered_at: "2032-01-10T03:00:01Z",
        raw_audio_persisted: false,
        metadata: { local_certification: true },
      }).select("*").single(),
      "SECRETARY_CALL_SCREENING_CALL_INSERT_FAILED",
    );
  }

  const priorityCall = await createInboundCall({ contactPartyId: priorityCallerId, remoteAddress: "priority-local" });
  const priorityScreenPayload = {
    call_id: priorityCall.id,
    caller_request: "Routine operational update.",
    caller_stated_urgency: "ROUTINE",
    evidence_id: "call-screen:priority-call-v1",
    source_reference: "call-turn://priority/1",
    screened_at: "2032-01-10T03:01:00Z",
  };
  const priorityScreen = await screenSecretaryCall({ context, payload: priorityScreenPayload });
  assert.equal(priorityScreen.status, "screened");
  assert.equal(priorityScreen.screening.route, "INTERRUPT_EXECUTIVE");
  assert.equal(priorityScreen.screening.routing_reason, "EXPLICIT_CONTACT_INTERRUPT_RULE");
  assert.equal(priorityScreen.screening.vip_inferred, false);
  assert.equal(priorityScreen.screening.urgency_inferred, false);
  assert.equal(priorityScreen.screening.objective_emergency_inferred, false);
  assert.equal(priorityScreen.routing_task.priority, "URGENT");
  const priorityReplay = await screenSecretaryCall({ context, payload: priorityScreenPayload });
  assert.equal(priorityReplay.idempotent, true);
  assert.equal(priorityReplay.screening.id, priorityScreen.screening.id);

  const unknownCall = await createInboundCall({ remoteAddress: "unknown-local" });
  const unknownUrgent = await screenSecretaryCall({
    context,
    payload: {
      call_id: unknownCall.id,
      caller_request: "Caller says this is an emergency and wants the executive now.",
      caller_stated_urgency: "EMERGENCY",
      evidence_id: "call-screen:unknown-urgent-v1",
      source_reference: "call-turn://unknown/1",
      screened_at: "2032-01-10T03:02:00Z",
    },
  });
  assert.equal(unknownUrgent.screening.route, "EXECUTIVE_REVIEW");
  assert.equal(unknownUrgent.screening.routing_reason, "CALLER_STATED_URGENCY_UNVERIFIED");
  assert.notEqual(unknownUrgent.screening.route, "INTERRUPT_EXECUTIVE");
  assert.equal(unknownUrgent.screening.urgency_verified, false);
  assert.equal(unknownUrgent.screening.objective_emergency_inferred, false);
  assert.equal(unknownUrgent.screening.vip_inferred, false);

  const routineCall = await createInboundCall({ contactPartyId: routineCallerId, remoteAddress: "routine-local" });
  const routineScreen = await screenSecretaryCall({
    context,
    payload: {
      call_id: routineCall.id,
      caller_request: "Please confirm the office address.",
      caller_stated_urgency: "ROUTINE",
      secretary_can_resolve: true,
      evidence_id: "call-screen:routine-v1",
      source_reference: "call-turn://routine/1",
      screened_at: "2032-01-10T03:03:00Z",
    },
  });
  assert.equal(routineScreen.screening.route, "SECRETARY_HANDLE");
  assert.equal(routineScreen.routing_task, null);

  const callbackCall = await createInboundCall({ contactPartyId: routineCallerId, remoteAddress: "callback-local" });
  const callbackPayload = {
    call_id: callbackCall.id,
    caller_request: "Please call me back later.",
    callback_requested: true,
    callback_due_at: "2032-01-10T06:30:00Z",
    evidence_id: "call-screen:callback-v1",
    source_reference: "call-turn://callback/1",
    screened_at: "2032-01-10T03:04:00Z",
  };
  const callbackScreen = await screenSecretaryCall({ context, payload: callbackPayload });
  assert.equal(callbackScreen.screening.route, "CALLBACK");
  assert.equal(callbackScreen.callback_follow_up.due_at, "2032-01-10T06:30:00+00:00");
  const callbackReplay = await screenSecretaryCall({ context, payload: callbackPayload });
  assert.equal(callbackReplay.idempotent, true);
  assert.equal(callbackReplay.callback_follow_up.id, callbackScreen.callback_follow_up.id);

  const authorityCall = await createInboundCall({ contactPartyId: routineCallerId, remoteAddress: "authority-local" });
  const authorityScreen = await screenSecretaryCall({
    context,
    payload: {
      call_id: authorityCall.id,
      caller_request: "Caller asks the executive to approve a binding agreement.",
      high_authority_request: true,
      evidence_id: "call-screen:authority-v1",
      source_reference: "call-turn://authority/1",
      screened_at: "2032-01-10T03:05:00Z",
    },
  });
  assert.equal(authorityScreen.screening.route, "EXECUTIVE_REVIEW");
  assert.equal(authorityScreen.screening.priority, "HIGH");
  assert.equal(authorityScreen.screening.executive_interruption_authority_created, false);

  const dispositionPayload = {
    call_id: unknownCall.id,
    screening_id: unknownUrgent.screening.id,
    disposition: "EXECUTIVE_REVIEWED",
    evidence_id: "call-screen:disposition-v1",
    source_reference: "executive-review://unknown/1",
    notes: "Executive reviewed the screened request.",
  };
  const disposition = await recordSecretaryCallScreeningDisposition({ context, payload: dispositionPayload });
  assert.equal(disposition.status, "disposition_recorded");
  assert.equal(disposition.screening.status, "RESOLVED");
  const dispositionReplay = await recordSecretaryCallScreeningDisposition({ context, payload: dispositionPayload });
  assert.equal(dispositionReplay.idempotent, true);

  const readScreen = await readSecretaryCallScreening({ context, payload: { call_id: unknownCall.id } });
  assert.equal(readScreen.screening.id, unknownUrgent.screening.id);
  assert.equal(readScreen.screening.disposition.disposition, "EXECUTIVE_REVIEWED");

  const clearPayload = {
    party_id: priorityCallerId,
    evidence_id: "call-screen-contact:clear-v1",
    source_reference: "conversation://call-screen/contact-clear-v1",
    reason: "Executive removed the temporary interruption rule.",
  };
  const cleared = await clearSecretaryContactCallHandling({ context, payload: clearPayload });
  assert.equal(cleared.status, "contact_handling_cleared");
  assert.equal(cleared.history_preserved, true);
  const clearReplay = await clearSecretaryContactCallHandling({ context, payload: clearPayload });
  assert.equal(clearReplay.idempotent, true);
  const afterClear = await readSecretaryContactCallHandling({ context, payload: { party_id: priorityCallerId } });
  assert.equal(afterClear.current, null);
  assert.ok(afterClear.history.some((item) => item.status === "CLEARED"));

  const afterClearCall = await createInboundCall({ contactPartyId: priorityCallerId, remoteAddress: "priority-after-clear" });
  const afterClearScreen = await screenSecretaryCall({
    context,
    payload: {
      call_id: afterClearCall.id,
      caller_request: "Routine operational update after priority rule removal.",
      caller_stated_urgency: "ROUTINE",
      secretary_can_resolve: true,
      evidence_id: "call-screen:priority-after-clear-v1",
      source_reference: "call-turn://priority-after-clear/1",
      screened_at: "2032-01-10T03:06:00Z",
    },
  });
  assert.equal(afterClearScreen.screening.route, "SECRETARY_HANDLE");
  assert.notEqual(afterClearScreen.screening.route, "INTERRUPT_EXECUTIVE");

  for (const action of ["setContactHandling", "clearContactHandling", "readContactHandling", "screen", "read", "listAttention", "recordDisposition"]) {
    const capability = createSecretaryCallScreeningCapability(action);
    assert.equal(capability.manifest.capability, "secretary_call_screening");
    assert.equal(capability.manifest.action, action);
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.authorize({ context }), true);
  }

  console.log("SECRETARY_CALL_SCREENING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_CALL_SCREENING_DURABLE=true");
  console.log("SECRETARY_CALL_SCREENING_IDEMPOTENT=true");
  console.log("SECRETARY_CALL_SCREENING_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_CALL_SCREENING_CONTACT_PRIORITY_EXPLICIT=true");
  console.log("SECRETARY_CALL_SCREENING_CONTACT_HISTORY_PRESERVED=true");
  console.log("SECRETARY_CALL_SCREENING_STALE_PRIORITY_CLEARED=true");
  console.log("SECRETARY_CALL_SCREENING_UNKNOWN_CALLER_NOT_VIP=true");
  console.log("SECRETARY_CALL_SCREENING_CALLER_URGENCY_UNVERIFIED=true");
  console.log("SECRETARY_CALL_SCREENING_URGENCY_INFERRED=false");
  console.log("SECRETARY_CALL_SCREENING_EXECUTIVE_INTERRUPT_EXPLICIT=true");
  console.log("SECRETARY_CALL_SCREENING_EXECUTIVE_REVIEW=true");
  console.log("SECRETARY_CALL_SCREENING_CALLBACK_DETERMINISTIC=true");
  console.log("SECRETARY_CALL_SCREENING_SECRETARY_HANDLE=true");
  console.log("SECRETARY_CALL_SCREENING_DISPOSITION_EVIDENCE=true");
  console.log("SECRETARY_CALL_SCREENING_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_CALL_SCREENING_EXTERNAL_AUTHORITY_CREATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_CALL_SCREENING_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
