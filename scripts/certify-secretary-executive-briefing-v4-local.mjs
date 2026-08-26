import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_EXECUTIVE_BRIEFING_V4_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_EXECUTIVE_BRIEFING_V4_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const { readSecretaryExecutiveBriefingV4 } = await import("../lib/operator/secretary/SecretaryExecutiveBriefingV4Runtime.js");
const { createSecretaryExecutiveBriefingCapability } = await import("../lib/platform/capabilities/createSecretaryExecutiveBriefingCapability.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Executive Briefing V4 Local Certification" }).select("id").single(),
    "SECRETARY_EXECUTIVE_BRIEFING_V4_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive Owner", email: "briefing-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Relationship Contact", email: "briefing-contact@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Coverage Delegate", email: "briefing-delegate@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_EXECUTIVE_BRIEFING_V4_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Executive Owner");
  const contactId = byName.get("Relationship Contact");
  const delegateId = byName.get("Coverage Delegate");
  assert.ok(ownerId && contactId && delegateId);

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId, localCertification: true },
  };

  const from = "2033-03-01T00:00:00Z";
  const dailyTo = "2033-03-02T00:00:00Z";
  const weeklyTo = "2033-03-08T00:00:00Z";

  await one(
    supabaseAdmin.from("secretary_calendar_events").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      title: "Executive planning meeting",
      event_type: "MEETING",
      status: "CONFIRMED",
      starts_at: "2033-03-01T09:00:00Z",
      ends_at: "2033-03-01T10:00:00Z",
      timezone: "Asia/Bangkok",
      source: "secretary",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_EXECUTIVE_BRIEFING_V4_CALENDAR_INSERT_FAILED",
  );

  await many(
    supabaseAdmin.from("secretary_tasks").insert([
      {
        organization_id: organizationId,
        owner_party_id: ownerId,
        title: "Renew operating evidence",
        status: "IN_PROGRESS",
        priority: "HIGH",
        due_at: "2033-03-01T08:00:00Z",
        source: "secretary_deadline_coordination",
        created_by_party_id: ownerId,
        metadata: {
          deadline_key: "briefing-deadline-1",
          title: "Renew operating evidence",
          deadline_type: "ADMINISTRATIVE",
          due_at: "2033-03-01T08:00:00Z",
          deadline_status: "ACTIVE",
          required_inputs: [{ id: "input-1", label: "Current certificate", status: "MISSING" }],
          legal_compliance_inferred: false,
          external_authority_used: false,
        },
      },
      {
        organization_id: organizationId,
        owner_party_id: ownerId,
        contact_party_id: contactId,
        title: "File current insurance certificate",
        status: "IN_PROGRESS",
        priority: "NORMAL",
        source: "secretary_document_filing",
        created_by_party_id: ownerId,
        metadata: {
          document_key: "briefing-document-1",
          document_title: "Insurance certificate",
          document_status: "WAITING_FOR_DOCUMENT",
          document_type: "CERTIFICATE",
          category: "INSURANCE",
          filing_folder: "Operations/Insurance",
          current_version: 0,
          versions: [],
          external_authority_used: false,
        },
      },
      {
        organization_id: organizationId,
        owner_party_id: ownerId,
        title: "Prepare executive travel expense pack",
        status: "IN_PROGRESS",
        priority: "HIGH",
        due_at: "2033-03-02T12:00:00Z",
        source: "secretary",
        created_by_party_id: ownerId,
        metadata: {
          expense_pack: true,
          expense_pack_state: "COLLECTING",
          pack_reference: "TRIP-2033-03",
          collection_deadline: "2033-03-02T12:00:00Z",
          items: [{ id: "receipt-1", description: "Hotel receipt", receipt_required: true, status: "PENDING" }],
          review_status: "NOT_QUEUED",
          pending_revision: false,
          reimbursement_authority_created: false,
          payment_authority_created: false,
          external_authority_used: false,
        },
      },
      {
        organization_id: organizationId,
        owner_party_id: ownerId,
        title: "Coordinate visitor arrival",
        status: "IN_PROGRESS",
        priority: "NORMAL",
        due_at: "2033-03-01T11:30:00Z",
        source: "secretary",
        created_by_party_id: ownerId,
        metadata: {
          visitor_coordination: true,
          visitor_name: "Local Certification Visitor",
          arrival_inferred: false,
          physical_access_authority_created: false,
          external_authority_used: false,
        },
      },
      {
        organization_id: organizationId,
        owner_party_id: ownerId,
        title: "Call screening: executive review",
        status: "OPEN",
        priority: "HIGH",
        due_at: "2033-03-01T07:30:00Z",
        source: "secretary_call_screening",
        created_by_party_id: ownerId,
        metadata: {
          secretary_call_screening: true,
          call_id: "briefing-call-screening-fixture",
          screening_id: "briefing-screening-fixture",
          route: "EXECUTIVE_REVIEW",
          caller_stated_urgency: "URGENT",
          urgency_verified: false,
          vip_inferred: false,
          urgency_inferred: false,
          external_authority_used: false,
        },
      },
      {
        organization_id: organizationId,
        owner_party_id: ownerId,
        contact_party_id: delegateId,
        title: "Temporary absence coverage",
        status: "IN_PROGRESS",
        priority: "NORMAL",
        due_at: "2033-03-03T00:00:00Z",
        source: "secretary_absence_coverage",
        created_by_party_id: ownerId,
        metadata: {
          absence_key: "briefing-absence-1",
          owner_party_id: ownerId,
          delegate_party_id: delegateId,
          starts_at: "2033-03-01T12:00:00Z",
          ends_at: "2033-03-03T00:00:00Z",
          coverage_status: "ACTIVE",
          coverage_scopes: ["CALL_SCREENING", "FOLLOW_UP_COORDINATION"],
          reason: "Local certification coverage",
          platform_permissions_mutated: false,
          delegated_binding_authority_created: false,
          external_authority_used: false,
        },
      },
    ]).select("id,title"),
    "SECRETARY_EXECUTIVE_BRIEFING_V4_TASK_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_contact_profiles").insert({
      organization_id: organizationId,
      party_id: contactId,
      relationship_label: "Key operating contact",
      preferred_channel: "email",
      last_contact_at: "2033-02-15T03:00:00Z",
      next_follow_up_at: "2033-03-01T06:00:00Z",
      metadata: {
        relationship_memory_v1: {
          next_touch: {
            due_at: "2033-03-01T06:00:00Z",
            reason: "Scheduled relationship touchpoint",
            evidence_id: "briefing-relationship-evidence",
          },
        },
      },
    }).select("id").single(),
    "SECRETARY_EXECUTIVE_BRIEFING_V4_CONTACT_PROFILE_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: contactId,
      action_type: "EMAIL",
      reason: "Request missing insurance certificate.",
      status: "PENDING",
      due_at: "2033-03-01T05:00:00Z",
      created_by_party_id: ownerId,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: "Request missing insurance certificate.",
        secretary_owned: true,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_EXECUTIVE_BRIEFING_V4_FOLLOW_UP_INSERT_FAILED",
  );

  const daily = await readSecretaryExecutiveBriefingV4({
    context,
    payload: { cadence: "DAILY", from, to: dailyTo, limit: 100 },
  });
  assert.equal(daily.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V4");
  assert.equal(daily.cadence, "DAILY");
  assert.equal(daily.evidence_only, true);
  assert.equal(daily.conclusions_not_inferred, true);
  assert.equal(daily.source_status.complete, true);
  assert.equal(daily.source_status.source_errors.length, 0);
  assert.ok(daily.executive_desk.deadlines.relevant.some((item) => item.deadline_key === "briefing-deadline-1"));
  assert.ok(daily.executive_desk.deadlines.missing_inputs.some((item) => item.deadline_key === "briefing-deadline-1"));
  assert.ok(daily.executive_desk.documents.missing.some((item) => item.document_key === "briefing-document-1"));
  assert.ok(daily.executive_desk.relationships.due.some((item) => item.party_id === contactId));
  assert.ok(daily.executive_desk.call_screening.attention.some((item) => item.metadata?.route === "EXECUTIVE_REVIEW"));
  assert.ok(daily.executive_desk.expenses.active.some((item) => item.pack_reference === "TRIP-2033-03" && item.missing_receipt_count === 1));
  assert.ok(daily.executive_desk.visitors.active.some((item) => item.metadata?.visitor_coordination === true));
  assert.ok(daily.executive_desk.absence_coverage.relevant.some((item) => item.delegate_party_id === delegateId));
  assert.ok(daily.executive_desk.secretary_follow_through.pending.length >= 1);
  assert.equal(daily.relationship_priority_inferred, false);
  assert.equal(daily.call_vip_inferred, false);
  assert.equal(daily.call_urgency_inferred, false);
  assert.equal(daily.legal_compliance_inferred, false);
  assert.equal(daily.reimbursement_eligibility_inferred, false);
  assert.equal(daily.accounting_treatment_inferred, false);
  assert.equal(daily.physical_access_authority_created, false);
  assert.equal(daily.approval_extends_authority, false);
  assert.equal(daily.external_authority_used, false);

  const weekly = await readSecretaryExecutiveBriefingV4({
    context,
    payload: { cadence: "WEEKLY", from, to: weeklyTo, limit: 100 },
  });
  assert.equal(weekly.cadence, "WEEKLY");
  assert.equal(Date.parse(weekly.window.from), Date.parse(from));
  assert.equal(Date.parse(weekly.window.to), Date.parse(weeklyTo));
  assert.ok(weekly.executive_desk.absence_coverage.relevant.length >= 1);
  assert.equal(weekly.source_status.complete, true);

  const manifest = createSecretaryExecutiveBriefingCapability();
  assert.equal(manifest.manifest.capability, "secretary_briefing");
  assert.equal(manifest.manifest.action, "read");
  assert.equal(manifest.manifest.transactional, false);
  assert.equal(manifest.manifest.operatorAutoExecute, true);
  assert.equal(manifest.manifest.operatorRequiresConfirmation, false);
  assert.equal(manifest.authorize({ context }), true);
  assert.ok(manifest.manifest.operatorAliases.some((item) => /weekly executive briefing/i.test(item)));

  console.log("SECRETARY_EXECUTIVE_BRIEFING_V4_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_DAILY=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_WEEKLY=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_EVIDENCE_ONLY=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_SOURCE_COMPLETENESS_EXPLICIT=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_DEADLINES=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_DOCUMENT_GAPS=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_RELATIONSHIP_TOUCHPOINTS=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_CALL_SCREENING=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_EXPENSE_RECEIPTS=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_VISITORS=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_ABSENCE_COVERAGE=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_SECRETARY_FOLLOW_THROUGH=true");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_RELATIONSHIP_PRIORITY_INFERRED=false");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_CALL_VIP_INFERRED=false");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_CALL_URGENCY_INFERRED=false");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_LEGAL_COMPLIANCE_INFERRED=false");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_REIMBURSEMENT_ELIGIBILITY_INFERRED=false");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_ACCOUNTING_TREATMENT_INFERRED=false");
  console.log("SECRETARY_EXECUTIVE_BRIEFING_PHYSICAL_ACCESS_AUTHORITY_CREATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_EXECUTIVE_BRIEFING_V4_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
