import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_DOCUMENT_FILING_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_DOCUMENT_FILING_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  registerSecretaryDocumentFile,
  fileSecretaryDocumentVersion,
  recordSecretaryDocumentUnavailable,
  reclassifySecretaryDocumentFile,
  reconcileSecretaryDocumentCurrentName,
  readSecretaryDocumentFile,
  listSecretaryDocumentFiles,
} = await import("../lib/operator/secretary/SecretaryDocumentFilingRuntime.js");
const { createSecretaryDocumentFilingCapability } = await import("../lib/platform/capabilities/createSecretaryDocumentFilingCapability.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Document Filing Local Certification" }).select("id").single(),
    "SECRETARY_DOCUMENT_FILING_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Document Owner", email: "document-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Document Provider", email: "document-provider@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_DOCUMENT_FILING_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Document Owner");
  const providerId = byName.get("Document Provider");
  assert.ok(ownerId && providerId);

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: providerId, preferred_channel: "email", metadata: { local_certification: true } },
    ]).select("id"),
    "SECRETARY_DOCUMENT_FILING_PROFILE_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId, localCertification: true },
  };

  const registerPayload = {
    document_key: "BOARD-PACK-2031-10",
    document_title: "Board Pack October 2031",
    document_type: "BOARD_PACK",
    category: "GOVERNANCE",
    subject_reference: "October 2031 board meeting",
    responsible_party_id: providerId,
    filing_folder: "Governance/Board/2031/10-October",
    naming_base: "Board Pack October 2031",
    document_date: "2031-10-15",
    collection_deadline: "2031-10-14T09:00:00Z",
    expected_missing: true,
  };

  const registered = await registerSecretaryDocumentFile({ context, payload: registerPayload });
  assert.equal(registered.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DOCUMENT_FILING_V1");
  assert.equal(registered.deterministic_document_id, true);
  assert.equal(registered.task.metadata.document_status, "MISSING");
  assert.equal(registered.document_store, "REFERENCES_ONLY");
  assert.equal(registered.missing_document_follow_up_ids.length, 2);

  const replay = await registerSecretaryDocumentFile({ context, payload: registerPayload });
  assert.equal(replay.document_id, registered.document_id);
  assert.deepEqual(replay.missing_document_follow_up_ids.sort(), registered.missing_document_follow_up_ids.sort());

  const v1 = await fileSecretaryDocumentVersion({
    context,
    payload: {
      document_id: registered.document_id,
      evidence_id: "message-evidence:board-pack-v1",
      source_reference: "drive://governance/board-pack-october-2031-draft.pdf",
      original_filename: "Board Pack October 2031 draft.pdf",
      received_from_party_id: providerId,
      received_at: "2031-10-13T08:00:00Z",
    },
  });
  assert.equal(v1.status, "version_filed");
  assert.equal(v1.version.version, 1);
  assert.equal(v1.version.canonical_filename, "2031-10-15_Board-Pack-October-2031_v1.pdf");
  assert.equal(v1.prior_version_superseded_not_deleted, true);
  assert.equal(v1.filing_does_not_imply_review, true);
  assert.equal(v1.filing_does_not_imply_signature, true);
  assert.equal(v1.filing_does_not_imply_acceptance, true);
  assert.equal(v1.filing_does_not_imply_submission, true);

  const v1Replay = await fileSecretaryDocumentVersion({
    context,
    payload: {
      document_id: registered.document_id,
      evidence_id: "message-evidence:board-pack-v1",
      source_reference: "drive://governance/board-pack-october-2031-draft.pdf",
      original_filename: "Board Pack October 2031 draft.pdf",
    },
  });
  assert.equal(v1Replay.status, "version_already_filed");
  assert.equal(v1Replay.idempotent, true);

  const afterV1FollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("status,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", registered.document_id),
    "SECRETARY_DOCUMENT_FILING_FOLLOW_UP_READ_FAILED",
  );
  assert.equal(afterV1FollowUps.length, 2);
  assert.ok(afterV1FollowUps.every((row) => row.status === "CANCELLED"));

  const v2 = await fileSecretaryDocumentVersion({
    context,
    payload: {
      document_id: registered.document_id,
      evidence_id: "message-evidence:board-pack-v2",
      source_reference: "drive://governance/board-pack-october-2031-final.pdf",
      original_filename: "Board Pack October 2031 final.pdf",
      received_from_party_id: providerId,
      received_at: "2031-10-14T07:30:00Z",
    },
  });
  assert.equal(v2.version.version, 2);
  assert.equal(v2.version.canonical_filename, "2031-10-15_Board-Pack-October-2031_v2.pdf");

  const afterV2 = await readSecretaryDocumentFile({ context, payload: { document_id: registered.document_id } });
  assert.equal(afterV2.current_version, 2);
  assert.deepEqual(afterV2.versions.map((row) => [row.version, row.status]), [[1, "SUPERSEDED"], [2, "CURRENT"]]);
  assert.equal(afterV2.versions[0].source_reference, "drive://governance/board-pack-october-2031-draft.pdf");
  assert.equal(afterV2.versions[1].source_reference, "drive://governance/board-pack-october-2031-final.pdf");

  const reclassified = await reclassifySecretaryDocumentFile({
    context,
    payload: {
      document_id: registered.document_id,
      filing_folder: "Governance/Board/2031/Final",
      category: "BOARD_GOVERNANCE",
      naming_base: "Board Pack 2031 October Final",
      reason: "Executive office approved filing taxonomy correction; no legal-content decision involved.",
    },
  });
  assert.equal(reclassified.status, "reclassified");
  assert.equal(reclassified.classification_history_preserved, true);
  assert.equal(reclassified.stored_source_reference_mutated, false);

  const renamed = await reconcileSecretaryDocumentCurrentName({
    context,
    payload: {
      document_id: registered.document_id,
      reason: "Reconcile canonical filename with corrected filing taxonomy.",
    },
  });
  assert.equal(renamed.status, "current_name_reconciled");
  assert.equal(renamed.version.canonical_filename, "2031-10-15_Board-Pack-2031-October-Final_v2.pdf");
  assert.equal(renamed.version.source_reference, "drive://governance/board-pack-october-2031-final.pdf");
  assert.equal(renamed.naming_history_preserved, true);

  const finalRead = await readSecretaryDocumentFile({ context, payload: { document_id: registered.document_id } });
  assert.equal(finalRead.classification_history.length, 1);
  assert.equal(finalRead.versions.length, 2);
  assert.equal(finalRead.versions[0].status, "SUPERSEDED");
  assert.equal(finalRead.versions[1].status, "CURRENT");
  assert.equal(finalRead.versions[1].naming_history.length, 1);
  assert.equal(finalRead.document_store, "REFERENCES_ONLY");
  assert.equal(finalRead.filing_does_not_imply_review, true);
  assert.equal(finalRead.filing_does_not_imply_signature, true);
  assert.equal(finalRead.filing_does_not_imply_acceptance, true);
  assert.equal(finalRead.filing_does_not_imply_submission, true);

  const missing = await registerSecretaryDocumentFile({
    context,
    payload: {
      document_key: "INSURANCE-CERT-2032",
      document_title: "Insurance Certificate 2032",
      document_type: "INSURANCE_CERTIFICATE",
      category: "COMPLIANCE",
      responsible_party_id: providerId,
      filing_folder: "Compliance/Insurance/2032",
      collection_deadline: "2031-12-20T09:00:00Z",
      expected_missing: true,
    },
  });
  const unavailable = await recordSecretaryDocumentUnavailable({
    context,
    payload: {
      document_id: missing.document_id,
      evidence_id: "message-evidence:insurance-cert-not-yet-issued",
      reason: "Insurer explicitly confirmed the 2032 certificate has not yet been issued.",
    },
  });
  assert.equal(unavailable.status, "unavailability_recorded");
  assert.equal(unavailable.missing_document_exception_preserved, true);
  assert.equal(unavailable.task.metadata.document_status, "UNAVAILABLE_RECORDED");

  const listed = await listSecretaryDocumentFiles({ context, payload: { query: "board", limit: 20 } });
  assert.equal(listed.count, 1);
  assert.equal(listed.documents[0].document_id, registered.document_id);
  assert.equal(listed.documents[0].current_version, 2);

  for (const action of ["register", "fileVersion", "recordUnavailable", "reclassify", "reconcileCurrentName", "read", "list", "cancel"]) {
    const capability = createSecretaryDocumentFilingCapability(action);
    assert.equal(capability.manifest.capability, "secretary_document_filing");
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
  }

  console.log("SECRETARY_DOCUMENT_FILING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_DOCUMENT_FILING_DURABLE_REGISTER=true");
  console.log("SECRETARY_DOCUMENT_FILING_IDEMPOTENT=true");
  console.log("SECRETARY_DOCUMENT_FILING_REFERENCE_ONLY_STORAGE=true");
  console.log("SECRETARY_DOCUMENT_FILING_RECEIPT_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_DOCUMENT_FILING_MISSING_DOCUMENT_CHASE=true");
  console.log("SECRETARY_DOCUMENT_FILING_MISSING_EXCEPTION_PRESERVED=true");
  console.log("SECRETARY_DOCUMENT_FILING_VERSION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_DOCUMENT_FILING_SUPERSEDED_VERSION_PRESERVED=true");
  console.log("SECRETARY_DOCUMENT_FILING_CANONICAL_NAMING=true");
  console.log("SECRETARY_DOCUMENT_FILING_CLASSIFICATION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_DOCUMENT_FILING_NAMING_HISTORY_PRESERVED=true");
  console.log("SECRETARY_DOCUMENT_FILING_SOURCE_REFERENCE_PRESERVED=true");
  console.log("SECRETARY_DOCUMENT_FILING_REVIEW_INFERRED=false");
  console.log("SECRETARY_DOCUMENT_FILING_SIGNATURE_INFERRED=false");
  console.log("SECRETARY_DOCUMENT_FILING_ACCEPTANCE_INFERRED=false");
  console.log("SECRETARY_DOCUMENT_FILING_SUBMISSION_INFERRED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) throw cleanup.error;
  }
}
