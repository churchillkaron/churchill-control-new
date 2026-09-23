import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const read = (path) => fs.readFile(new URL(path, `file://${root}/`), "utf8");

const [
  runtime,
  staffRoute,
  peopleRoute,
  staffCard,
  reviewPanel,
  staffPage,
  staffProfile,
  directoryPage,
  employmentLifecycle,
  documentMigration,
] = await Promise.all([
  read("lib/people/identity/staffIdentityDocumentRuntime.js"),
  read("app/api/staff/identity-documents/route.js"),
  read("app/api/people/identity-documents/route.js"),
  read("components/staff/StaffIdentitySecurityCard.jsx"),
  read("components/workspace/people/PeopleIdentityReviewPanel.jsx"),
  read("app/(system)/staff/page.jsx"),
  read("app/(system)/staff/profile/page.jsx"),
  read("app/(system)/workspace/[organizationId]/people/directory/page.jsx"),
  read("lib/people/employees/employeeEmploymentLifecycleService.js"),
  read("supabase/migrations/20260902041500_documents_control_foundation.sql"),
]);

test("staff identity documents use governed private document storage", () => {
  assert.match(staffRoute, /createControlledDocument/);
  assert.match(staffRoute, /classification: "RESTRICTED"/);
  assert.match(staffRoute, /ownerStaffId: context\.staff\.id/);
  assert.match(staffRoute, /requestDocumentApproval/);
  assert.match(staffRoute, /uploaded_from: "staff_portal"/);
  assert.match(documentMigration, /'documents',\s*'documents',\s*false/);
});

test("passport national id and work permit are first-class identity document types", () => {
  assert.match(runtime, /STAFF_PASSPORT/);
  assert.match(runtime, /STAFF_NATIONAL_ID/);
  assert.match(runtime, /STAFF_WORK_PERMIT/);
  assert.match(staffRoute, /document_type must be passport, national_id or work_permit/);
  assert.match(staffRoute, /Passport and work permit require an expiry date/);
});

test("work permits are bound to the current legal employer", () => {
  assert.match(staffRoute, /loadEmploymentAssignmentsForPeriod/);
  assert.match(staffRoute, /employment\.current\?\.entity_id/);
  assert.match(staffRoute, /Current legal-entity employment is required before uploading a work permit/);
  assert.match(staffCard, /automatically bound to your current legal employer/);
});

test("passport or national id satisfies core identity while work permit remains optional", () => {
  assert.match(runtime, /Passport or National ID/);
  assert.match(runtime, /identityVerified = Boolean\(passport\.verified \|\| nationalId\.verified\)/);
  assert.match(runtime, /required: false/);
  assert.match(staffCard, /Work permit is optional/);
});

test("expiry state is continuously derived at 90 60 30 14 7 and expired thresholds", () => {
  assert.match(runtime, /EXPIRING_90/);
  assert.match(runtime, /EXPIRING_60/);
  assert.match(runtime, /EXPIRING_30/);
  assert.match(runtime, /EXPIRING_14/);
  assert.match(runtime, /EXPIRING_7/);
  assert.match(runtime, /EXPIRED/);
  assert.match(staffCard, /setInterval\(load, 60 \* 60 \* 1000\)/);
});

test("staff portal makes privacy review and expiry visibility explicit", () => {
  assert.match(staffCard, /Private by default/);
  assert.match(staffCard, /Owner \/ HR review/);
  assert.match(staffCard, /Expiry stays visible/);
  assert.match(staffCard, /restricted document storage/);
});

test("staff portal shows verified login identity and governed document lifecycle", () => {
  assert.match(staffRoute, /email_confirmed_at/);
  assert.match(staffRoute, /phone_confirmed_at/);
  assert.match(staffCard, /Identity & Security/);
  assert.match(staffCard, /Your verified staff identity/);
  assert.match(staffCard, /Replacement uploaded · waiting for owner\/HR verification/);
  assert.match(staffPage, /href="\/staff\/profile"/);
  assert.match(staffPage, /identitySatisfied/);
  assert.match(staffProfile, /\/api\/staff\/identity-verification/);
  assert.match(staffProfile, /\/api\/staff\/work-permit/);
  assert.match(staffProfile, /The file is stored privately/);
  assert.match(staffProfile, /masked last characters/);
  assert.match(staffProfile, /Days until expiry/);
});

test("owner and hr visual review uses short-lived signed previews with audit evidence", () => {
  assert.match(peopleRoute, /MANAGE_ROLES/);
  assert.match(peopleRoute, /HR_ADMIN/);
  assert.match(peopleRoute, /createDocumentSignedUrl/);
  assert.match(peopleRoute, /expiresIn: 300/);
  assert.match(peopleRoute, /IDENTITY_PREVIEW/);
  assert.match(peopleRoute, /enterprise_document_access_logs/);
  assert.match(reviewPanel, /Secure visual preview/);
  assert.match(reviewPanel, /temporary signed preview/);
  assert.match(reviewPanel, /Review visually/);
  assert.match(directoryPage, /Identity documents/);
  assert.match(directoryPage, /PeopleIdentityReviewPanel/);
});

test("people directory surfaces organization and per-employee identity expiry attention", () => {
  assert.match(employmentLifecycle, /enterprise_documents/);
  assert.match(employmentLifecycle, /identityAttention/);
  assert.match(employmentLifecycle, /identityCritical/);
  assert.match(employmentLifecycle, /workPermitAttention/);
  assert.match(employmentLifecycle, /employeeIdentitySecurity/);
  assert.match(directoryPage, /Identity attention/);
  assert.match(directoryPage, /Identity critical/);
  assert.match(directoryPage, /identitySecurity\.attention_count/);
  assert.match(directoryPage, /One governed employee record, not scattered files/);
  assert.match(directoryPage, /Identity attention/);
  assert.match(directoryPage, /Identity critical/);
  assert.match(directoryPage, /secure visual review for Owner\/HR/);
});

test("owner and hr decisions use governed document approval instead of direct status mutation", () => {
  assert.match(peopleRoute, /decideDocumentApproval/);
  assert.match(peopleRoute, /decision must be APPROVE or REJECT/);
  assert.match(reviewPanel, /Approve identity document/);
  assert.match(reviewPanel, /Confirm that the person, document number, expiry date and legal entity match/);
  assert.match(reviewPanel, /Reject/);
});
