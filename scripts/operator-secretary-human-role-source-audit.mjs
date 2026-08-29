import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  officeAdministration: "lib/operator/secretary/SecretaryOfficeAdministrationRuntime.js",
  officeArtifact: "lib/operator/secretary/SecretaryOfficeArtifactPreparationRuntime.js",
  accessMedia: "lib/operator/secretary/SecretaryAccessMediaCustodyRuntime.js",
  travel: "lib/operator/secretary/SecretaryTravelCoordinationRuntime.js",
  jobExecution: "lib/operator/secretary/SecretaryJobExecutionRuntime.js",
  expensePack: "lib/operator/secretary/SecretaryExpensePackRuntime.js",
  signatureRouting: "lib/operator/secretary/SecretarySignatureRoutingRuntime.js",
  writtenAction: "lib/operator/secretary/SecretaryWrittenActionAdministrationRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function requirePlatformCoverage(family, fragments) {
  for (const fragment of fragments) {
    assert.ok(
      source.platform.includes(fragment),
      `Secretary human-role coverage missing ${family}: ${fragment}`,
    );
  }
}

const coverageFamilies = [
  {
    id: "EXECUTIVE_SCHEDULING_CALENDAR_APPOINTMENTS",
    fragments: [
      "createCalendarEvent",
      "updateCalendarEvent",
      "secretary_calendar_stewardship",
      "secretary_appointment_attendance_stewardship",
    ],
  },
  {
    id: "CALLS_MESSAGES_CORRESPONDENCE",
    fragments: [
      "secretary_correspondence",
      "secretary_inbox_triage",
      "secretary_call_screening",
      "secretary_outbound_call",
    ],
  },
  {
    id: "VISITOR_RECEPTION",
    fragments: [
      "secretary_visitor_coordination",
      "secretary_appointment_attendance_stewardship",
    ],
  },
  {
    id: "MEETINGS_AGENDA_PACKS_MINUTES_RESOURCES_HOSPITALITY",
    fragments: [
      "secretary_meeting_coordination",
      "secretary_recurring_meeting",
      "secretary_meeting_agenda",
      "secretary_meeting_pack_coordination",
      "secretary_meeting_preparation",
      "secretary_meeting_closeout",
      "secretary_resource_reservation",
      "secretary_hospitality_coordination",
      "secretary_event_guest_coordination",
    ],
  },
  {
    id: "TRAVEL_READINESS_OPERATIONS_CANCELLATION",
    fragments: [
      "secretary_travel",
      "secretary_travel_document_readiness",
      "secretary_travel_operations",
    ],
  },
  {
    id: "DOCUMENTS_PROOFREADING_ARTIFACTS_SIGNATURE_FILING_RETRIEVAL_TRANSMITTAL",
    fragments: [
      "secretary_document_preparation",
      "secretary_office_artifact_preparation",
      "secretary_signature_routing",
      "secretary_document_filing",
      "secretary_records_retrieval",
      "secretary_document_transmittal",
      "secretary_paperwork",
    ],
  },
  {
    id: "RECORDS_DATABASES_PHYSICAL_RECORDS_ACCESS_MEDIA",
    fragments: [
      "secretary_contact_record_maintenance",
      "secretary_physical_records_custody",
      "secretary_physical_key_badge_custody",
    ],
  },
  {
    id: "MAIL_COURIER",
    fragments: ["secretary_mail_courier"],
  },
  {
    id: "OFFICE_SERVICES_SUPPLIES_VENDOR_QUOTES",
    fragments: ["secretary_office_administration"],
  },
  {
    id: "EXPENSE_BASIC_FINANCIAL_ADMINISTRATION_COORDINATION",
    fragments: ["secretary_expense_pack"],
  },
  {
    id: "RESEARCH_INFORMATION_REQUESTS",
    fragments: ["secretary_job"],
  },
  {
    id: "EXECUTIVE_BRIEFING_DECISIONS_DIRECTIVES_COMMITMENTS",
    fragments: [
      "secretary_briefing",
      "secretary_commitments",
      "secretary_decision_register",
      "secretary_directive_register",
      "secretary_directive_follow_through",
    ],
  },
  {
    id: "STAFF_DELEGATION_ABSENCE_COVERAGE",
    fragments: [
      "secretary_staff_delegation",
      "secretary_absence_coverage",
    ],
  },
  {
    id: "CONTACTS_RELATIONSHIPS_DATES_DEADLINES_PREFERENCES",
    fragments: [
      "listContacts",
      "createContact",
      "secretary_relationship_memory",
      "secretary_important_date_stewardship",
      "secretary_deadline_coordination",
      "secretary_working_preferences",
    ],
  },
  {
    id: "GENERIC_DELEGATED_SECRETARY_JOBS",
    fragments: ["secretary_job"],
  },
  {
    id: "OFFICE_ARTIFACTS_PDF_DOCX_PPTX_XLSX",
    fragments: ["secretary_office_artifact_preparation"],
  },
];

for (const family of coverageFamilies) {
  requirePlatformCoverage(family.id, family.fragments);
}

// Generic delegated work must actually support research/discovery rather than
// pretending every secretary duty needs its own narrow runtime.
for (const actionType of ["RESEARCH", "DISCOVER_CONTACTS", "CALL", "MESSAGE", "EMAIL", "CREATE_TASK", "CREATE_EVENT", "REVIEW"]) {
  assert.match(source.jobExecution, new RegExp(`\\"${actionType}\\"`));
}
assert.match(source.jobExecution, /secretary_owns_follow_through|completed_by:\s*"AVANTIQO_SECRETARY"/);

// Office administration coordinates quotes, supplies and services, but cannot
// buy, accept vendor terms, authorize services, pay, sign or delegate authority.
for (const boundary of [
  /purchase_performed:\s*false/,
  /order_placed:\s*false/,
  /quote_accepted:\s*false/,
  /vendor_terms_accepted:\s*false/,
  /service_authorized_by_secretary:\s*false/,
  /payment_authority_created:\s*false/,
  /signing_authority_created:\s*false/,
  /approval_authority_delegated:\s*false/,
  /binding_authority_delegated:\s*false/,
  /external_authority_used:\s*false/,
]) {
  assert.match(source.officeAdministration, boundary);
}

// Office artifact preparation is a real production skill, but remains a
// preparation/rendering function. It cannot publish, file, send, sign, post to
// Finance, invent approval, execute spreadsheet formulas or persist externally.
for (const boundary of [
  /source_snapshot_frozen:\s*true/,
  /source_data_inferred:\s*false/,
  /business_approval_inferred:\s*false/,
  /spreadsheet_formula_execution_enabled:\s*false/,
  /external_storage_write_performed:\s*false/,
  /document_published:\s*false/,
  /document_filed:\s*false/,
  /external_sharing_performed:\s*false/,
  /signature_applied:\s*false/,
  /finance_posting_performed:\s*false/,
  /payment_authority_created:\s*false/,
  /signing_authority_created:\s*false/,
  /external_authority_used:\s*false/,
]) {
  assert.match(source.officeArtifact, boundary);
}
for (const format of ["PDF", "DOCX", "PPTX", "XLSX"]) {
  assert.match(source.officeArtifact, new RegExp(`\\"${format}\\"`));
}

// Physical access-media custody records possession only. It must never grant,
// revoke, activate or deactivate access credentials or mutate security systems.
for (const boundary of [
  /access_grant_performed:\s*false/,
  /access_revoke_performed:\s*false/,
  /security_system_mutation_performed:\s*false/,
  /credential_activation_performed:\s*false/,
  /credential_deactivation_performed:\s*false/,
  /external_authority_used:\s*false/,
]) {
  assert.match(source.accessMedia, boundary);
}

// Travel administration may coordinate, but booking/payment authority remains
// explicitly gated and budgets are guidance rather than authority.
assert.match(source.travel, /travel_booking_requires_exact_step_approval:\s*true/);
assert.match(source.travel, /travel_payment_requires_exact_step_approval:\s*true/);
assert.match(source.travel, /budget_is_guidance_not_authority:\s*true/);
assert.match(source.travel, /external_booking_authority_created:\s*false/);
assert.match(source.travel, /payment_authority_created:\s*false/);

// Expense administration remains evidence/pack coordination, never accounting
// posting or payment authority.
assert.match(source.expensePack, /finance_posting_performed:\s*false/);
assert.match(source.expensePack, /payment_authority_created:\s*false/);

// Signature routing records the process; it cannot manufacture signing power.
assert.match(source.signatureRouting, /signing_authority_created:\s*false/);
assert.match(source.signatureRouting, /signature_applied:\s*false/);

// Written-action administration may chase, record outcomes and filing evidence,
// but it cannot create legal validity or binding authority on its own.
assert.match(source.writtenAction, /binding_authority_delegated:\s*false/);
assert.match(source.writtenAction, /legal_accuracy_verified:\s*false/);

console.log("OPERATOR_SECRETARY_HUMAN_ROLE_SOURCE_AUDIT=PASS");
console.log("SECRETARY_HUMAN_ROLE_COVERAGE_MATRIX=PASS");
for (const family of coverageFamilies) {
  console.log(`SECRETARY_COVERAGE_${family.id}=true`);
}
console.log("SECRETARY_FINANCE_POSTING_AUTHORITY=false");
console.log("SECRETARY_PAYMENT_AUTHORITY=false");
console.log("SECRETARY_SIGNING_AUTHORITY=false");
console.log("SECRETARY_ACCESS_PERMISSION_AUTHORITY=false");
console.log("SECRETARY_LEGAL_SUFFICIENCY_AUTHORITY=false");
console.log("SECRETARY_CORE_EXECUTIVE_ROLE_COVERAGE_COMPLETE=true");
console.log("SECRETARY_SPECIALIST_LEGAL_MEDICAL_ROLE_CLAIMED=false");
console.log("SECRETARY_FULL_LOCAL_WRAPPER_CERTIFICATION_REQUIRED=true");
console.log("SECRETARY_RUNTIME_CERTIFIED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
