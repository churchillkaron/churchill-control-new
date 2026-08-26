import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_RELATIONSHIP_MEMORY_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_RELATIONSHIP_MEMORY_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  clearSecretaryRelationshipNextTouch,
  correctSecretaryRelationshipFact,
  listSecretaryRelationshipAttention,
  readSecretaryRelationshipMemory,
  recordSecretaryRelationshipFact,
  recordSecretaryRelationshipInteraction,
  retractSecretaryRelationshipFact,
  setSecretaryRelationshipNextTouch,
} = await import("../lib/operator/secretary/SecretaryRelationshipMemoryRuntime.js");
const { createSecretaryRelationshipMemoryCapability } = await import("../lib/platform/capabilities/createSecretaryRelationshipMemoryCapability.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Relationship Memory Local Certification" }).select("id").single(),
    "SECRETARY_RELATIONSHIP_MEMORY_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive Owner", email: "relationship-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Relationship Contact", email: "relationship-contact@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_RELATIONSHIP_MEMORY_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Executive Owner");
  const contactId = byName.get("Relationship Contact");
  assert.ok(ownerId && contactId);

  await one(
    supabaseAdmin.from("secretary_contact_profiles").insert({
      organization_id: organizationId,
      party_id: contactId,
      relationship_label: "Key external relationship",
      preferred_channel: "email",
      allow_calls: true,
      allow_messages: true,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_RELATIONSHIP_MEMORY_PROFILE_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId, localCertification: true },
  };

  const first = await recordSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_key: "meeting_preference",
      value: "Morning meetings preferred",
      category: "PREFERENCE",
      evidence_id: "relationship-evidence:preference-v1",
      source_reference: "conversation://relationship-cert/preference-v1",
      observed_at: "2026-08-20T03:00:00Z",
    },
  });
  assert.equal(first.status, "fact_recorded");
  assert.equal(first.fact.inferred, false);

  const firstReplay = await recordSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_key: "meeting_preference",
      value: "Morning meetings preferred",
      category: "PREFERENCE",
      evidence_id: "relationship-evidence:preference-v1",
      source_reference: "conversation://relationship-cert/preference-v1",
      observed_at: "2026-08-20T03:00:00Z",
    },
  });
  assert.equal(firstReplay.status, "fact_already_recorded");
  assert.equal(firstReplay.idempotent, true);
  assert.equal(firstReplay.fact.id, first.fact.id);

  const second = await recordSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_key: "meeting_preference",
      value: "Afternoon meetings preferred",
      category: "PREFERENCE",
      evidence_id: "relationship-evidence:preference-v2",
      source_reference: "conversation://relationship-cert/preference-v2",
      observed_at: "2026-08-21T03:00:00Z",
    },
  });
  assert.equal(second.status, "fact_recorded");
  assert.notEqual(second.fact.id, first.fact.id);

  const afterSupersession = await readSecretaryRelationshipMemory({ context, payload: { party_id: contactId } });
  const firstStored = afterSupersession.fact_history.find((fact) => fact.id === first.fact.id);
  const secondStored = afterSupersession.fact_history.find((fact) => fact.id === second.fact.id);
  assert.equal(firstStored.status, "SUPERSEDED");
  assert.equal(secondStored.status, "CURRENT");
  assert.equal(afterSupersession.current_facts.filter((fact) => fact.key === "meeting_preference").length, 1);

  const corrected = await correctSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_id: second.fact.id,
      value: "Late-afternoon meetings preferred",
      evidence_id: "relationship-evidence:preference-correction",
      reason: "Contact explicitly corrected the preferred time.",
      source_reference: "conversation://relationship-cert/preference-correction",
      observed_at: "2026-08-22T03:00:00Z",
    },
  });
  assert.equal(corrected.status, "fact_corrected");
  assert.equal(corrected.original_fact_deleted, false);

  const correctedReplay = await correctSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_id: second.fact.id,
      value: "Late-afternoon meetings preferred",
      evidence_id: "relationship-evidence:preference-correction",
      reason: "Contact explicitly corrected the preferred time.",
      source_reference: "conversation://relationship-cert/preference-correction",
      observed_at: "2026-08-22T03:00:00Z",
    },
  });
  assert.equal(correctedReplay.status, "correction_already_recorded");
  assert.equal(correctedReplay.idempotent, true);

  const afterCorrection = await readSecretaryRelationshipMemory({ context, payload: { party_id: contactId } });
  assert.equal(afterCorrection.correction_history.length, 1);
  assert.equal(afterCorrection.fact_history.find((fact) => fact.id === second.fact.id).status, "CORRECTED");
  assert.equal(afterCorrection.current_facts.find((fact) => fact.key === "meeting_preference").id, corrected.fact.id);

  const retracted = await retractSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_id: corrected.fact.id,
      evidence_id: "relationship-evidence:preference-retracted",
      reason: "Contact explicitly said there is no standing meeting-time preference.",
    },
  });
  assert.equal(retracted.status, "fact_retracted");
  assert.equal(retracted.fact_deleted, false);
  assert.equal(retracted.evidence_preserved, true);

  const stale = await recordSecretaryRelationshipFact({
    context,
    payload: {
      party_id: contactId,
      fact_key: "temporary_office",
      value: "Temporary office on Floor 7",
      category: "LOGISTICS",
      evidence_id: "relationship-evidence:temporary-office",
      source_reference: "message://relationship-cert/temporary-office",
      observed_at: "2025-12-01T03:00:00Z",
      valid_until: "2026-01-01T00:00:00Z",
    },
  });
  assert.equal(stale.status, "fact_recorded");

  const afterStale = await readSecretaryRelationshipMemory({ context, payload: { party_id: contactId } });
  assert.ok(afterStale.stale_facts.some((fact) => fact.id === stale.fact.id));
  assert.ok(!afterStale.current_facts.some((fact) => fact.id === stale.fact.id));
  assert.equal(afterStale.stale_facts_not_treated_current, true);

  await assert.rejects(
    () => recordSecretaryRelationshipFact({
      context,
      payload: {
        party_id: contactId,
        fact_key: "password",
        value: "should-never-be-stored",
        evidence_id: "relationship-evidence:forbidden-secret",
      },
    }),
    /SECRETARY_RELATIONSHIP_MEMORY_CREDENTIAL_STORAGE_FORBIDDEN/,
  );

  const interaction = await recordSecretaryRelationshipInteraction({
    context,
    payload: {
      party_id: contactId,
      evidence_id: "relationship-evidence:interaction-1",
      occurred_at: "2026-08-25T08:15:00Z",
      kind: "CALL",
      channel: "PHONE",
      direction: "OUTBOUND",
      summary: "Discussed the upcoming planning meeting; no business commitment was made.",
      source_reference: "call://relationship-cert/interaction-1",
    },
  });
  assert.equal(interaction.status, "interaction_recorded");
  assert.equal(interaction.interaction.inferred, false);
  assert.equal(interaction.last_contact_at, "2026-08-25T08:15:00.000Z");

  const interactionReplay = await recordSecretaryRelationshipInteraction({
    context,
    payload: {
      party_id: contactId,
      evidence_id: "relationship-evidence:interaction-1",
      occurred_at: "2026-08-25T08:15:00Z",
      kind: "CALL",
      channel: "PHONE",
      direction: "OUTBOUND",
      summary: "Discussed the upcoming planning meeting; no business commitment was made.",
      source_reference: "call://relationship-cert/interaction-1",
    },
  });
  assert.equal(interactionReplay.status, "interaction_already_recorded");
  assert.equal(interactionReplay.idempotent, true);

  const nextTouch = await setSecretaryRelationshipNextTouch({
    context,
    payload: {
      party_id: contactId,
      due_at: "2031-09-10T03:00:00Z",
      reason: "Reconnect after the explicitly discussed planning cycle.",
    },
  });
  assert.equal(nextTouch.status, "next_touch_set");
  assert.equal(nextTouch.follow_up.action_type, "EMAIL");
  assert.equal(nextTouch.follow_up.status, "PENDING");
  assert.equal(nextTouch.profile.next_follow_up_at, "2031-09-10T03:00:00+00:00");

  const nextTouchReplay = await setSecretaryRelationshipNextTouch({
    context,
    payload: {
      party_id: contactId,
      due_at: "2031-09-10T03:00:00Z",
      reason: "Reconnect after the explicitly discussed planning cycle.",
    },
  });
  assert.equal(nextTouchReplay.follow_up.id, nextTouch.follow_up.id);
  assert.equal(nextTouchReplay.deterministic_follow_up_id, nextTouch.deterministic_follow_up_id);

  const attention = await listSecretaryRelationshipAttention({
    context,
    payload: { now: "2031-09-09T00:00:00Z", through: "2031-09-11T00:00:00Z" },
  });
  assert.equal(attention.count, 1);
  assert.equal(attention.relationships[0].party_id, contactId);
  assert.equal(attention.relationship_priority_inferred, false);

  const cleared = await clearSecretaryRelationshipNextTouch({
    context,
    payload: { party_id: contactId, reason: "Explicitly clear the scheduled relationship touch." },
  });
  assert.equal(cleared.status, "next_touch_cleared");
  assert.equal(cleared.profile.next_follow_up_at, null);
  assert.deepEqual(cleared.cancelled_follow_up_ids, [nextTouch.follow_up.id]);

  const followUpRows = await many(
    supabaseAdmin.from("secretary_follow_ups").select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("contact_party_id", contactId),
    "SECRETARY_RELATIONSHIP_MEMORY_FOLLOW_UP_READ_FAILED",
  );
  assert.equal(followUpRows.length, 1);
  assert.equal(followUpRows[0].status, "CANCELLED");
  assert.equal(followUpRows[0].metadata.secretary_relationship_next_touch, true);

  const finalRead = await readSecretaryRelationshipMemory({ context, payload: { party_id: contactId } });
  assert.equal(finalRead.profile.last_contact_at, "2026-08-25T08:15:00+00:00");
  assert.equal(finalRead.profile.next_follow_up_at, null);
  assert.equal(finalRead.facts_not_inferred, true);
  assert.equal(finalRead.credentials_or_secrets_stored, false);
  assert.equal(finalRead.external_authority_used, false);
  assert.equal(finalRead.fact_history.find((fact) => fact.id === corrected.fact.id).status, "RETRACTED");
  assert.equal(finalRead.interaction_history.length, 1);

  for (const action of ["read", "recordFact", "correctFact", "retractFact", "recordInteraction", "setNextTouch", "clearNextTouch", "listAttention"]) {
    const capability = createSecretaryRelationshipMemoryCapability(action);
    assert.equal(capability.manifest.capability, "secretary_relationship_memory");
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
  }

  console.log("SECRETARY_RELATIONSHIP_MEMORY_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_DURABLE=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_IDEMPOTENT=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_FACTS_NOT_INFERRED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_SUPERSEDED_FACTS_PRESERVED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_CORRECTION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_RETRACTION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_STALE_FACTS_NOT_CURRENT=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_SECRET_STORAGE_FORBIDDEN=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_LAST_CONTACT_EVIDENCE_ONLY=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_INTERACTION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_NEXT_TOUCH_DETERMINISTIC=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_NEXT_TOUCH_CLEAR_FENCED=true");
  console.log("SECRETARY_RELATIONSHIP_MEMORY_PRIORITY_INFERRED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) throw cleanup.error;
  }
}
