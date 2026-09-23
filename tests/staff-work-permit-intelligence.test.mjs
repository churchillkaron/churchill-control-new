import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/people/workforce/StaffWorkPermitRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/workspace/compliance/work-permits/route.js", import.meta.url), "utf8");
const fastRead = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastReadIndex.js", import.meta.url), "utf8");
const complianceDomain = fs.readFileSync(new URL("../lib/compliance/runtime/ComplianceDomainRuntime.js", import.meta.url), "utf8");
const semantics = fs.readFileSync(new URL("../lib/intelligence/runtime/AvantiqoBusinessReadTimeSemanticsRuntime.js", import.meta.url), "utf8");
const setup = fs.readFileSync(new URL("../components/staff/StaffActivationSetup.jsx", import.meta.url), "utf8");
const reviewRoute = fs.readFileSync(new URL("../app/api/people/workforce/work-permit-verification/route.js", import.meta.url), "utf8");
const reviewPage = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/people/work-permit-verification/page.jsx", import.meta.url), "utf8");
const identityReviewPage = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/people/identity-verification/page.jsx", import.meta.url), "utf8");
const reviewMigration = fs.readFileSync(new URL("../supabase/migrations/20260920115852_staff_work_permit_atomic_review.sql", import.meta.url), "utf8");

test("work permit upload binds to exactly one current legal employer", () => {
  assert.match(runtime, /employee_employment_assignments/);
  assert.match(runtime, /\.eq\("staff_account_id", staffId\)/);
  assert.match(runtime, /\.eq\("status", "ACTIVE"\)/);
  assert.match(runtime, /active\.length !== 1/);
  assert.match(runtime, /WORK_PERMIT_EMPLOYER_AMBIGUOUS/);
  assert.match(runtime, /WORK_PERMIT_EMPLOYER_REQUIRED/);
  assert.match(runtime, /legal_entities/);
  assert.match(runtime, /entityId: employment\.entity\.id/);
});

test("uploaded permit records exact staff, legal entity, assignment and expiry", () => {
  assert.match(runtime, /ownerStaffId: staff\.id/);
  assert.match(runtime, /employment_assignment_id: employment\.assignment\.id/);
  assert.match(runtime, /legal_entity_id: employment\.entity\.id/);
  assert.match(runtime, /legal_entity_name: employment\.entity\.legal_name/);
  assert.match(runtime, /expiry_date: normalizedExpiry/);
  assert.match(runtime, /WORK_PERMIT_EXPIRY_REQUIRED/);
  assert.match(runtime, /documentNumber: permitNo/);
});

test("work permit creates a staff-owned entity-scoped compliance obligation with renewal monitoring", () => {
  assert.match(runtime, /from\("compliance_obligations"\)\.insert/);
  assert.match(runtime, /obligation_type: "PERMIT"/);
  assert.match(runtime, /entity_id: employment\.entity\.id/);
  assert.match(runtime, /owner_staff_id: staff\.id/);
  assert.match(runtime, /enterprise_document_id: documentId/);
  assert.match(runtime, /expiry_date: expiryDate/);
  assert.match(runtime, /renewal_lead_days: DEFAULT_RENEWAL_LEAD_DAYS/);
  assert.match(runtime, /DEFAULT_RENEWAL_LEAD_DAYS = 60/);
  assert.match(runtime, /intelligence_visible: true/);
});

test("Business Partner and Intelligence have a canonical work-permit read", () => {
  assert.match(fastRead, /compliance\.work_permits\.read/);
  assert.match(fastRead, /expiring work permits/);
  assert.match(complianceDomain, /capability: "work_permits"/);
  assert.match(complianceDomain, /\/api\/workspace\/compliance\/work-permits/);
  assert.match(route, /listOrganizationWorkPermitCompliance/);
  assert.match(route, /expiringSoon/);
  assert.match(route, /expired/);
  assert.match(semantics, /compliance\.work_permits\.read/);
  assert.match(semantics, /CURRENT_COMPLIANCE_AND_EXPIRY_STATE/);
});

test("staff UI shows employer and requires expiry only when permit is supplied", () => {
  assert.match(setup, /Legal employer/);
  assert.match(setup, /workPermit\.legalEntity/);
  assert.match(setup, /disabled=\{Boolean\(busy\) \|\| !workPermitExpiry\}/);
  assert.match(setup, /renewal monitoring 60 days before expiry/);
  assert.match(setup, />Optional</);
});

test("staff-facing work permit status hides controlled-document and compliance identifiers", () => {
  const start = runtime.indexOf("function publicStatus(");
  const end = runtime.indexOf("async function latest(", start);
  const publicStatus = runtime.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(publicStatus, /documentId:/);
  assert.doesNotMatch(publicStatus, /employmentAssignmentId:/);
  assert.doesNotMatch(publicStatus, /complianceObligationId:/);
  assert.match(runtime, /legalEmployerSummary/);
  assert.match(runtime, /legal_name: entity\.legal_name/);
  assert.match(runtime, /display_name: entity\.display_name/);
  assert.match(runtime, /country: entity\.country/);
});

test("work permit review is management-only, private-previewed and atomic with compliance state", () => {
  assert.match(reviewRoute, /STAFF_WORK_PERMIT_REVIEW_DENIED/);
  assert.match(reviewRoute, /loadWorkPermitReviewQueue/);
  assert.match(reviewRoute, /createWorkPermitReviewSignedUrl/);
  assert.match(reviewRoute, /reviewStaffWorkPermit/);
  assert.match(runtime, /expiresIn: 180/);
  assert.match(runtime, /review_staff_work_permit_atomic/);
  assert.match(runtime, /reviewStatus === "VERIFIED"/);
  assert.match(runtime, /reviewStatus === "REJECTED"/);
  assert.match(reviewPage, /Verify permit/);
  assert.match(reviewPage, /Open private permit/);
  assert.match(reviewPage, /Work permits remain optional for Staff Portal activation/);
  assert.match(identityReviewPage, /people\/work-permit-verification/);
  assert.match(reviewMigration, /security invoker/);
  assert.match(reviewMigration, /revoke execute on function public\.review_staff_work_permit_atomic.*from public/);
  assert.match(reviewMigration, /revoke execute on function public\.review_staff_work_permit_atomic.*from authenticated/);
  assert.match(reviewMigration, /grant execute on function public\.review_staff_work_permit_atomic.*to service_role/);
  assert.match(reviewMigration, /for update/);
  assert.match(reviewMigration, /a newer work permit exists/);
  assert.match(reviewMigration, /expired work permit cannot be approved as current/);
  assert.match(reviewMigration, /v_obligation_status := case when v_decision = 'APPROVE' then 'ACTIVE' else 'CANCELLED' end/);
});
