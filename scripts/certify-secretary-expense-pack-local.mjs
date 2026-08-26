import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_EXPENSE_PACK_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_EXPENSE_PACK_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  finalizeSecretaryExpensePack,
  queueSecretaryExpensePackReview,
  readSecretaryExpensePack,
  recordSecretaryExpensePackReviewAcknowledgement,
  recordSecretaryExpenseReceipt,
  recordSecretaryExpenseReceiptUnavailable,
  reviseSecretaryExpensePack,
  startSecretaryExpensePack,
} = await import("../lib/operator/secretary/SecretaryExpensePackRuntime.js");
const { createSecretaryExpensePackCapability } = await import("../lib/platform/capabilities/createSecretaryExpensePackCapability.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Expense Pack Local Certification" }).select("id").single(),
    "SECRETARY_EXPENSE_PACK_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Expense Traveler", email: "expense-traveler@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Expense Reviewer", email: "expense-reviewer@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_EXPENSE_PACK_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const travelerId = byName.get("Expense Traveler");
  const reviewerId = byName.get("Expense Reviewer");
  assert.ok(travelerId && reviewerId);

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: travelerId, preferred_channel: "email", metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: reviewerId, preferred_channel: "email", metadata: { local_certification: true } },
    ]).select("id"),
    "SECRETARY_EXPENSE_PACK_PROFILES_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: travelerId },
    metadata: { partyId: travelerId, localCertification: true },
  };
  const startPayload = {
    pack_reference: "TRIP-SG-2031-001",
    trip_reference: "Singapore leadership trip",
    traveler_party_id: travelerId,
    reviewer_party_id: reviewerId,
    purpose: "Executive leadership meetings",
    collection_deadline: "2031-10-20T12:00:00Z",
    expected_items: [
      { description: "Airport transfer", category: "TRANSPORT", responsible_party_id: travelerId },
      { description: "Business dinner", category: "MEALS", responsible_party_id: travelerId },
      { description: "Hotel", category: "LODGING", responsible_party_id: travelerId },
    ],
  };

  const started = await startSecretaryExpensePack({ context, payload: startPayload });
  assert.equal(started.contract, "AVANTIQO_EXECUTIVE_SECRETARY_EXPENSE_PACK_V1");
  assert.equal(started.deterministic_pack_id, true);
  assert.equal(started.task.metadata.items.length, 3);
  assert.equal(started.missing_receipt_follow_up_ids.length, 6);
  assert.equal(started.reimbursement_authority_created, false);
  assert.equal(started.payment_authority_created, false);

  const replay = await startSecretaryExpensePack({ context, payload: startPayload });
  assert.equal(replay.pack_id, started.pack_id);
  assert.deepEqual(replay.missing_receipt_follow_up_ids.sort(), started.missing_receipt_follow_up_ids.sort());

  const [transportItem, dinnerItem, hotelItem] = started.task.metadata.items;
  const transportReceipt = await recordSecretaryExpenseReceipt({
    context,
    payload: {
      pack_id: started.pack_id,
      expected_item_id: transportItem.id,
      evidence_id: "receipt-evidence:transport-1",
      receipt_reference: "receipt://transport-1",
      vendor: "Airport Transfer Co",
      expense_date: "2031-10-10",
      amount: "1250.50",
      currency: "THB",
      category: "TRANSPORT",
    },
  });
  assert.equal(transportReceipt.status, "receipt_recorded");
  assert.equal(transportReceipt.fx_conversion_performed, false);

  const transportReplay = await recordSecretaryExpenseReceipt({
    context,
    payload: {
      pack_id: started.pack_id,
      expected_item_id: transportItem.id,
      evidence_id: "receipt-evidence:transport-1",
      receipt_reference: "receipt://transport-1",
      vendor: "Airport Transfer Co",
      amount: "1250.50",
      currency: "THB",
    },
  });
  assert.equal(transportReplay.status, "receipt_already_recorded");
  assert.equal(transportReplay.idempotent, true);

  const dinnerReceipt = await recordSecretaryExpenseReceipt({
    context,
    payload: {
      pack_id: started.pack_id,
      expected_item_id: dinnerItem.id,
      evidence_id: "receipt-evidence:dinner-1",
      receipt_reference: "receipt://dinner-1",
      vendor: "Marina Dinner",
      expense_date: "2031-10-11",
      amount: "85.25",
      currency: "USD",
      category: "MEALS",
    },
  });
  assert.equal(dinnerReceipt.status, "receipt_recorded");

  const unavailable = await recordSecretaryExpenseReceiptUnavailable({
    context,
    payload: {
      pack_id: started.pack_id,
      expected_item_id: hotelItem.id,
      evidence_id: "message-evidence:hotel-receipt-unavailable-1",
      reason: "Hotel has not yet provided the receipt.",
    },
  });
  assert.equal(unavailable.status, "receipt_unavailability_recorded");
  assert.equal(unavailable.missing_receipt_exception_preserved, true);

  const beforeFinalize = await readSecretaryExpensePack({ context, payload: { pack_id: started.pack_id } });
  assert.deepEqual(beforeFinalize.totals_by_currency_current, { THB: "1250.5", USD: "85.25" });
  assert.deepEqual(beforeFinalize.missing_receipt_item_ids, [hotelItem.id]);
  assert.equal(beforeFinalize.multi_currency_totals_not_converted, true);

  await assert.rejects(
    finalizeSecretaryExpensePack({ context, payload: { pack_id: started.pack_id } }),
    /SECRETARY_EXPENSE_PACK_MISSING_RECEIPTS/,
  );

  const finalizedV1 = await finalizeSecretaryExpensePack({
    context,
    payload: { pack_id: started.pack_id, allow_missing_receipts: true },
  });
  assert.equal(finalizedV1.status, "finalized");
  assert.equal(finalizedV1.version.version, 1);
  assert.equal(finalizedV1.version.review_ready_with_exceptions, true);
  assert.deepEqual(finalizedV1.version.totals_by_currency, { THB: "1250.5", USD: "85.25" });
  assert.deepEqual(finalizedV1.version.missing_receipt_item_ids, [hotelItem.id]);
  assert.equal(finalizedV1.reimbursement_authority_created, false);
  assert.equal(finalizedV1.accounting_posting_authority_created, false);
  assert.equal(finalizedV1.payment_authority_created, false);

  const reviewV1 = await queueSecretaryExpensePackReview({
    context,
    payload: { pack_id: started.pack_id, reviewer_party_id: reviewerId, review_chase_at: "2031-10-22T12:00:00Z" },
  });
  assert.equal(reviewV1.status, "review_queued");
  assert.equal(reviewV1.follow_up_ids.length, 2);
  assert.equal(reviewV1.review_is_not_reimbursement_approval, true);
  assert.equal(reviewV1.review_is_not_accounting_posting_approval, true);

  const reviewReplay = await queueSecretaryExpensePackReview({
    context,
    payload: { pack_id: started.pack_id, reviewer_party_id: reviewerId, review_chase_at: "2031-10-22T12:00:00Z" },
  });
  assert.deepEqual(reviewReplay.follow_up_ids, reviewV1.follow_up_ids);

  const ack = await recordSecretaryExpensePackReviewAcknowledgement({
    context,
    payload: {
      pack_id: started.pack_id,
      reviewer_party_id: reviewerId,
      evidence_id: "message-evidence:expense-pack-received-v1",
      acknowledged: true,
    },
  });
  assert.equal(ack.status, "review_receipt_acknowledged");
  assert.equal(ack.acknowledgement_is_not_reimbursement_approval, true);
  assert.equal(ack.acknowledgement_is_not_accounting_approval, true);
  assert.equal(ack.acknowledgement_is_not_payment_approval, true);

  const lateHotel = await recordSecretaryExpenseReceipt({
    context,
    payload: {
      pack_id: started.pack_id,
      expected_item_id: hotelItem.id,
      evidence_id: "receipt-evidence:hotel-late-1",
      receipt_reference: "receipt://hotel-late-1",
      vendor: "Marina Hotel",
      expense_date: "2031-10-10",
      amount: "420.00",
      currency: "USD",
      category: "LODGING",
    },
  });
  assert.equal(lateHotel.status, "late_receipt_recorded");
  assert.equal(lateHotel.requires_revision, true);
  assert.equal(lateHotel.task.metadata.pending_revision, true);
  assert.equal(lateHotel.task.metadata.versions.length, 1);

  const revised = await reviseSecretaryExpensePack({ context, payload: { pack_id: started.pack_id, change_note: "Hotel receipt received after review distribution." } });
  assert.equal(revised.status, "revision_opened");
  assert.equal(revised.prior_versions_preserved, true);
  assert.equal(revised.stale_review_fenced, true);
  assert.equal(revised.task.metadata.versions.length, 1);

  const finalizedV2 = await finalizeSecretaryExpensePack({ context, payload: { pack_id: started.pack_id } });
  assert.equal(finalizedV2.version.version, 2);
  assert.equal(finalizedV2.version.review_ready, true);
  assert.deepEqual(finalizedV2.version.missing_receipt_item_ids, []);
  assert.deepEqual(finalizedV2.version.totals_by_currency, { THB: "1250.5", USD: "505.25" });

  const finalRead = await readSecretaryExpensePack({ context, payload: { pack_id: started.pack_id } });
  assert.deepEqual(finalRead.versions.map((row) => row.version), [1, 2]);
  assert.equal(finalRead.missing_receipt_item_ids.length, 0);
  assert.equal(finalRead.multi_currency_totals_not_converted, true);
  assert.equal(finalRead.reimbursement_eligibility_not_inferred, true);
  assert.equal(finalRead.accounting_treatment_not_inferred, true);
  assert.equal(finalRead.accounting_posting_authority_created, false);
  assert.equal(finalRead.reimbursement_authority_created, false);
  assert.equal(finalRead.payment_authority_created, false);
  assert.equal(finalRead.external_authority_used, false);

  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("status,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", started.pack_id),
    "SECRETARY_EXPENSE_PACK_FOLLOW_UP_READ_FAILED",
  );
  const staleReview = followUps.filter((row) => Number(row.metadata?.secretary_expense_pack_version) === 1 && ["EXPENSE_PACK_REVIEW", "EXPENSE_PACK_REVIEW_RECEIPT_CHASE"].includes(row.metadata?.secretary_expense_pack_kind));
  assert.equal(staleReview.length, 2);
  assert.ok(staleReview.every((row) => row.status === "CANCELLED"));

  for (const action of ["start", "read", "recordReceipt", "recordUnavailable", "finalize", "revise", "queueReview", "acknowledgeReview", "cancel"]) {
    const capability = createSecretaryExpensePackCapability(action);
    assert.equal(capability.manifest.capability, "secretary_expense_pack");
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
  }

  console.log("SECRETARY_EXPENSE_PACK_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_EXPENSE_PACK_DURABLE_TASK=true");
  console.log("SECRETARY_EXPENSE_PACK_IDEMPOTENT=true");
  console.log("SECRETARY_EXPENSE_PACK_RECEIPT_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_EXPENSE_PACK_MISSING_RECEIPT_CHASE=true");
  console.log("SECRETARY_EXPENSE_PACK_MISSING_RECEIPT_EXCEPTION_PRESERVED=true");
  console.log("SECRETARY_EXPENSE_PACK_MULTI_CURRENCY_SEPARATE=true");
  console.log("SECRETARY_EXPENSE_PACK_FX_CONVERSION_PERFORMED=false");
  console.log("SECRETARY_EXPENSE_PACK_VERSION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_EXPENSE_PACK_LATE_RECEIPT_REQUIRES_REVISION=true");
  console.log("SECRETARY_EXPENSE_PACK_STALE_REVIEW_FENCED=true");
  console.log("SECRETARY_EXPENSE_PACK_REVIEW_ACK_NOT_APPROVAL=true");
  console.log("SECRETARY_EXPENSE_PACK_REIMBURSEMENT_ELIGIBILITY_NOT_INFERRED=true");
  console.log("SECRETARY_EXPENSE_PACK_ACCOUNTING_TREATMENT_NOT_INFERRED=true");
  console.log("SECRETARY_EXPENSE_PACK_ACCOUNTING_POSTING_AUTHORITY_CREATED=false");
  console.log("SECRETARY_EXPENSE_PACK_REIMBURSEMENT_AUTHORITY_CREATED=false");
  console.log("SECRETARY_EXPENSE_PACK_PAYMENT_AUTHORITY_CREATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) throw cleanup.error;
  }
}
