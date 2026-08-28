import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_WRITTEN_ACTION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}
function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_WRITTEN_ACTION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const { registerSecretaryDocumentFile, fileSecretaryDocumentVersion } = await import(
  "../lib/operator/secretary/SecretaryDocumentFilingRuntime.js"
);
const {
  startSecretaryWrittenActionAdministration,
  reviseSecretaryWrittenActionAdministration,
  refreshSecretaryWrittenActionAdministration,
  recordSecretaryWrittenActionResponse,
  recordSecretaryWrittenActionOutcome,
  recordSecretaryWrittenActionFiling,
  readSecretaryWrittenActionAdministration,
} = await import("../lib/operator/secretary/SecretaryWrittenActionAdministrationRuntime.js");
const { createSecretaryWrittenActionAdministrationCapability } = await import(
  "../lib/platform/capabilities/createSecretaryWrittenActionAdministrationCapability.js"
);

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Written Action Local Certification" }).select("id").single(),
    "SECRETARY_WRITTEN_ACTION_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive Owner", email: "written-action-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Director Alpha", email: "director-alpha@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Director Beta", email: "director-beta@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_WRITTEN_ACTION_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Executive Owner");
  const alphaId = byName.get("Director Alpha");
  const betaId = byName.get("Director Beta");
  assert.ok(ownerId && alphaId && betaId);

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: alphaId, preferred_channel: "email", metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: betaId, preferred_channel: "message", metadata: { local_certification: true } },
    ]).select("id"),
    "SECRETARY_WRITTEN_ACTION_PROFILE_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      appointment_duration_minutes: 30,
      business_hours: {},
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_WRITTEN_ACTION_SETTINGS_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId, localCertification: true },
  };

  const sourceRegistration = await registerSecretaryDocumentFile({
    context,
    payload: {
      document_key: "WRITTEN-RESOLUTION-2035-01",
      document_title: "Written Resolution 2035-01",
      document_type: "WRITTEN_RESOLUTION",
      category: "GOVERNANCE",
      filing_folder: "Governance/Written Actions/2035",
      naming_base: "Written Resolution 2035-01",
      document_date: "2035-01-10",
      expected_missing: false,
    },
  });
  const sourceV1 = await fileSecretaryDocumentVersion({
    context,
    payload: {
      document_id: sourceRegistration.document_id,
      evidence_id: "written-action-source-v1",
      source_reference: "drive://governance/written-resolution-2035-01-v1.pdf",
      original_filename: "Written Resolution 2035-01.pdf",
      received_at: "2035-01-10T08:00:00Z",
    },
  });
  assert.equal(sourceV1.version.version, 1);

  const startPayload = {
    title: "Written Resolution 2035-01",
    action_kind: "WRITTEN_RESOLUTION",
    source_document_filing_id: sourceRegistration.document_id,
    source_document_version: 1,
    response_due_at: "2035-01-15T10:00:00Z",
    participants: [
      { party_id: alphaId, expected_response: "APPROVAL" },
      { party_id: betaId, expected_response: "CONSENT" },
    ],
    evidence_id: "written-action-start-v1",
    occurred_at: "2035-01-10T09:00:00Z",
  };
  const started = await startSecretaryWrittenActionAdministration({ context, payload: startPayload });
  assert.equal(started.contract, "AVANTIQO_EXECUTIVE_SECRETARY_WRITTEN_ACTION_ADMINISTRATION_V1");
  assert.equal(started.record.state, "CIRCULATING");
  assert.equal(started.record.action_version, 1);
  assert.equal(started.record.source_document.document_filing_id, sourceRegistration.document_id);
  assert.equal(started.record.source_document.version, 1);
  assert.equal(started.record.frozen_versions.length, 1);
  assert.equal(started.record.frozen_versions[0].source_document.version, 1);
  assert.equal(started.quorum_determined, false);
  assert.equal(started.legal_validity_inferred, false);
  assert.equal(started.legal_effect_inferred, false);
  assert.equal(started.corporate_authority_created, false);

  const startReplay = await startSecretaryWrittenActionAdministration({ context, payload: startPayload });
  assert.equal(startReplay.replay_safe, true);
  assert.equal(startReplay.written_action.id, started.written_action.id);

  const refresh1 = await refreshSecretaryWrittenActionAdministration({ context, payload: { action_id: started.written_action.id } });
  const refresh2 = await refreshSecretaryWrittenActionAdministration({ context, payload: { action_id: started.written_action.id } });
  assert.equal(refresh1.follow_up_count, 2);
  assert.equal(refresh2.follow_up_count, 2);
  assert.deepEqual([...refresh1.follow_up_ids].sort(), [...refresh2.follow_up_ids].sort());

  const alphaResponsePayload = {
    action_id: started.written_action.id,
    expected_version: 1,
    participant_party_id: alphaId,
    response_value: "APPROVED",
    source_reference: "email://director-alpha/explicit-approval",
    evidence_id: "alpha-approved-v1",
    occurred_at: "2035-01-11T08:00:00Z",
  };
  const alphaResponse = await recordSecretaryWrittenActionResponse({ context, payload: alphaResponsePayload });
  assert.equal(alphaResponse.record.version, 2);
  assert.equal(alphaResponse.record.state, "CIRCULATING");
  assert.equal(alphaResponse.record.participants.find((row) => row.party_id === alphaId).response_value, "APPROVED");
  assert.equal(alphaResponse.participant_response_inferred, false);

  const alphaReplay = await recordSecretaryWrittenActionResponse({ context, payload: alphaResponsePayload });
  assert.equal(alphaReplay.replay_safe, true);

  let staleFenced = false;
  try {
    await recordSecretaryWrittenActionResponse({
      context,
      payload: {
        action_id: started.written_action.id,
        expected_version: 1,
        participant_party_id: betaId,
        response_value: "CONSENTED",
        source_reference: "message://director-beta/consent",
        evidence_id: "beta-consented-stale",
        occurred_at: "2035-01-11T09:00:00Z",
      },
    });
  } catch (error) {
    staleFenced = error?.message === "SECRETARY_WRITTEN_ACTION_STALE_VERSION";
  }
  assert.equal(staleFenced, true);

  const sourceV2 = await fileSecretaryDocumentVersion({
    context,
    payload: {
      document_id: sourceRegistration.document_id,
      evidence_id: "written-action-source-v2",
      source_reference: "drive://governance/written-resolution-2035-01-v2.pdf",
      original_filename: "Written Resolution 2035-01 revised.pdf",
      received_at: "2035-01-11T10:00:00Z",
    },
  });
  assert.equal(sourceV2.version.version, 2);

  const revised = await reviseSecretaryWrittenActionAdministration({
    context,
    payload: {
      action_id: started.written_action.id,
      expected_version: 2,
      title: "Written Resolution 2035-01 Revised",
      action_kind: "WRITTEN_RESOLUTION",
      source_document_filing_id: sourceRegistration.document_id,
      source_document_version: 2,
      response_due_at: "2035-01-16T10:00:00Z",
      participants: [
        { party_id: alphaId, expected_response: "APPROVAL" },
        { party_id: betaId, expected_response: "CONSENT" },
      ],
      evidence_id: "written-action-revision-v2",
      occurred_at: "2035-01-11T11:00:00Z",
    },
  });
  assert.equal(revised.record.version, 3);
  assert.equal(revised.record.action_version, 2);
  assert.equal(revised.record.source_document.version, 2);
  assert.equal(revised.record.frozen_versions.length, 2);
  assert.deepEqual(revised.record.frozen_versions.map((row) => row.source_document.version), [1, 2]);
  assert.ok(revised.record.participants.every((row) => row.response_status === "PENDING"));

  const revisedRefresh1 = await refreshSecretaryWrittenActionAdministration({ context, payload: { action_id: started.written_action.id } });
  const revisedRefresh2 = await refreshSecretaryWrittenActionAdministration({ context, payload: { action_id: started.written_action.id } });
  assert.equal(revisedRefresh1.follow_up_count, 2);
  assert.deepEqual([...revisedRefresh1.follow_up_ids].sort(), [...revisedRefresh2.follow_up_ids].sort());
  assert.notDeepEqual([...refresh1.follow_up_ids].sort(), [...revisedRefresh1.follow_up_ids].sort());

  const alphaV2 = await recordSecretaryWrittenActionResponse({
    context,
    payload: {
      action_id: started.written_action.id,
      expected_version: 3,
      participant_party_id: alphaId,
      response_value: "APPROVED",
      source_reference: "email://director-alpha/revised-explicit-approval",
      evidence_id: "alpha-approved-v2",
      occurred_at: "2035-01-12T08:00:00Z",
    },
  });
  assert.equal(alphaV2.record.version, 4);

  const betaV2 = await recordSecretaryWrittenActionResponse({
    context,
    payload: {
      action_id: started.written_action.id,
      expected_version: 4,
      participant_party_id: betaId,
      response_value: "CONSENTED",
      source_reference: "message://director-beta/revised-explicit-consent",
      evidence_id: "beta-consented-v2",
      occurred_at: "2035-01-12T09:00:00Z",
    },
  });
  assert.equal(betaV2.record.version, 5);
  assert.equal(betaV2.record.state, "RESPONSES_COMPLETE");

  const outcome = await recordSecretaryWrittenActionOutcome({
    context,
    payload: {
      action_id: started.written_action.id,
      expected_version: 5,
      reported_outcome: "REPORTED_EFFECTIVE",
      source_reference: "governance-record://board-secretary/report-effective",
      reported_by_party_id: ownerId,
      evidence_id: "written-action-outcome-explicit",
      occurred_at: "2035-01-12T10:00:00Z",
    },
  });
  assert.equal(outcome.record.version, 6);
  assert.equal(outcome.record.state, "OUTCOME_RECORDED");
  assert.equal(outcome.record.reported_outcome, "REPORTED_EFFECTIVE");
  assert.equal(outcome.outcome_inferred, false);
  assert.equal(outcome.legal_effect_inferred, false);

  const finalRegistration = await registerSecretaryDocumentFile({
    context,
    payload: {
      document_key: "WRITTEN-RESOLUTION-2035-01-EXECUTED",
      document_title: "Written Resolution 2035-01 Executed",
      document_type: "EXECUTED_WRITTEN_RESOLUTION",
      category: "GOVERNANCE",
      filing_folder: "Governance/Written Actions/2035/Executed",
      naming_base: "Written Resolution 2035-01 Executed",
      document_date: "2035-01-12",
      expected_missing: false,
    },
  });
  const finalV1 = await fileSecretaryDocumentVersion({
    context,
    payload: {
      document_id: finalRegistration.document_id,
      evidence_id: "written-action-final-v1",
      source_reference: "drive://governance/written-resolution-2035-01-executed.pdf",
      original_filename: "Written Resolution 2035-01 Executed.pdf",
      received_at: "2035-01-12T11:00:00Z",
    },
  });
  assert.equal(finalV1.version.version, 1);

  const filed = await recordSecretaryWrittenActionFiling({
    context,
    payload: {
      action_id: started.written_action.id,
      expected_version: 6,
      final_document_filing_id: finalRegistration.document_id,
      final_document_version: 1,
      filing_source_reference: "filing-log://governance/final-written-action-recorded",
      evidence_id: "written-action-final-filing-evidence",
      occurred_at: "2035-01-12T12:00:00Z",
    },
  });
  assert.equal(filed.record.version, 7);
  assert.equal(filed.record.state, "FILED");
  assert.equal(filed.record.final_filing.document.document_filing_id, finalRegistration.document_id);
  assert.equal(filed.record.final_filing.document.version, 1);
  assert.equal(filed.filing_performed_by_runtime, false);

  const finalRead = await readSecretaryWrittenActionAdministration({ context, payload: { action_id: started.written_action.id } });
  assert.equal(finalRead.record.state, "FILED");
  assert.equal(finalRead.record.frozen_versions.length, 2);
  assert.equal(finalRead.quorum_determined, false);
  assert.equal(finalRead.legal_validity_inferred, false);
  assert.equal(finalRead.legal_effect_inferred, false);
  assert.equal(finalRead.statutory_compliance_inferred, false);
  assert.equal(finalRead.corporate_authority_created, false);
  assert.equal(finalRead.vote_cast_by_secretary, false);
  assert.equal(finalRead.consent_given_by_secretary, false);
  assert.equal(finalRead.signature_created_by_secretary, false);
  assert.equal(finalRead.signature_validity_inferred, false);
  assert.equal(finalRead.participant_response_inferred, false);
  assert.equal(finalRead.outcome_inferred, false);
  assert.equal(finalRead.external_message_sent_by_runtime, false);
  assert.equal(finalRead.provider_calls_performed, false);
  assert.equal(finalRead.external_authority_used, false);

  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.written_action.id),
    "SECRETARY_WRITTEN_ACTION_FOLLOW_UP_READ_FAILED",
  );
  assert.ok(followUps.length >= 4);
  assert.ok(followUps.every((row) => row.status === "CANCELLED"));

  for (const action of ["start", "revise", "refresh", "recordResponse", "recordOutcome", "recordFiling", "cancel", "read", "list"]) {
    const capability = createSecretaryWrittenActionAdministrationCapability(action);
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
    assert.equal(capability.manifest.approvalRequired, false);
  }

  console.log("SECRETARY_WRITTEN_ACTION_ADMINISTRATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_WRITTEN_ACTION_FILED_SOURCE_VERSION_FROZEN=true");
  console.log("SECRETARY_WRITTEN_ACTION_REVISION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_WRITTEN_ACTION_DETERMINISTIC_FOLLOW_UPS=true");
  console.log("SECRETARY_WRITTEN_ACTION_EXPLICIT_RESPONSE_EVIDENCE=true");
  console.log("SECRETARY_WRITTEN_ACTION_STALE_VERSION_FENCED=true");
  console.log("SECRETARY_WRITTEN_ACTION_EVIDENCE_REPLAY_SAFE=true");
  console.log("SECRETARY_WRITTEN_ACTION_REPORTED_OUTCOME_EVIDENCE=true");
  console.log("SECRETARY_WRITTEN_ACTION_FINAL_FILING_EVIDENCE=true");
  console.log("SECRETARY_WRITTEN_ACTION_TERMINAL_FOLLOW_UPS_CANCELLED=true");
  console.log("SECRETARY_WRITTEN_ACTION_QUORUM_DETERMINED=false");
  console.log("SECRETARY_WRITTEN_ACTION_LEGAL_VALIDITY_INFERRED=false");
  console.log("SECRETARY_WRITTEN_ACTION_LEGAL_EFFECT_INFERRED=false");
  console.log("SECRETARY_WRITTEN_ACTION_STATUTORY_COMPLIANCE_INFERRED=false");
  console.log("SECRETARY_WRITTEN_ACTION_CORPORATE_AUTHORITY_CREATED=false");
  console.log("SECRETARY_WRITTEN_ACTION_VOTE_CAST_BY_SECRETARY=false");
  console.log("SECRETARY_WRITTEN_ACTION_CONSENT_GIVEN_BY_SECRETARY=false");
  console.log("SECRETARY_WRITTEN_ACTION_SIGNATURE_CREATED_BY_SECRETARY=false");
  console.log("SECRETARY_WRITTEN_ACTION_PARTICIPANT_RESPONSE_INFERRED=false");
  console.log("SECRETARY_WRITTEN_ACTION_OUTCOME_INFERRED=false");
  console.log("SECRETARY_WRITTEN_ACTION_FILING_PERFORMED_BY_RUNTIME=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
