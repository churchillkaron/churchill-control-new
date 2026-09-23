import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/(system)/staff/layout.jsx", import.meta.url), "utf8");
const quickUpload = fs.readFileSync(new URL("../app/api/staff/quick-upload/route.js", import.meta.url), "utf8");
const uploadPage = fs.readFileSync(new URL("../app/(system)/staff/documents/upload/page.jsx", import.meta.url), "utf8");
const migrationPreview = fs.readFileSync(new URL("../app/api/staff/migration-preview/route.js", import.meta.url), "utf8");
const migrationRun = fs.readFileSync(new URL("../app/api/staff/migration-run/route.js", import.meta.url), "utf8");
const aiFeed = fs.readFileSync(new URL("../app/api/staff/ai-feed/route.js", import.meta.url), "utf8");
const intakeRoute = fs.readFileSync(new URL("../app/api/staff/intake/route.js", import.meta.url), "utf8");
const intakeRuntime = fs.readFileSync(new URL("../lib/people/intake/StaffIntakeReviewRuntime.js", import.meta.url), "utf8");
const intakePolicy = fs.readFileSync(new URL("../lib/people/intake/StaffIntakeDestinationPolicy.js", import.meta.url), "utf8");
const intakePage = fs.readFileSync(new URL("../app/(system)/staff/intake/page.jsx", import.meta.url), "utf8");
const intakePreview = fs.readFileSync(new URL("../app/api/staff/intake/[assignmentId]/preview/route.js", import.meta.url), "utf8");
const navigationRuntime = fs.readFileSync(new URL("../lib/people/portal/StaffPortalNavigationRuntime.js", import.meta.url), "utf8");
const intakeMigration = fs.readFileSync(new URL("../supabase/migrations/20260920105422_staff_intelligent_intake_assignments.sql", import.meta.url), "utf8");
const uploadSecurity = fs.readFileSync(new URL("../lib/people/security/StaffUploadSecurity.js", import.meta.url), "utf8");
const identityRuntime = fs.readFileSync(new URL("../lib/people/workforce/StaffIdentityVerificationRuntime.js", import.meta.url), "utf8");
const workPermitRuntime = fs.readFileSync(new URL("../lib/people/workforce/StaffWorkPermitRuntime.js", import.meta.url), "utf8");
const profileUpload = fs.readFileSync(new URL("../app/api/staff/upload-profile-picture/route.js", import.meta.url), "utf8");

test("mobile bottom navigation reserves the exact center for one-tap camera capture", () => {
  assert.match(layout, /grid-cols-5/);
  assert.match(layout, /type="button"[\s\S]{0,180}aria-label="Open camera and upload"/);
  assert.match(layout, /onClick=\{\(\) => cameraInputRef\.current\?\.click\(\)\}/);
  assert.match(layout, /capture="environment"/);
  assert.match(layout, /\/api\/staff\/quick-upload/);
  assert.match(layout, /cameraState\.uploading \? "Saving" : "Camera"/);
  assert.doesNotMatch(layout, /<label[\s\S]{0,180}aria-label="Open camera and upload"/);
});

test("staff uploads verify file signatures before private storage", () => {
  assert.match(uploadSecurity, /STAFF_UPLOAD_CONTENT_TYPE_MISMATCH/);
  assert.match(uploadSecurity, /"%PDF-"/);
  assert.match(uploadSecurity, /"RIFF"/);
  assert.match(uploadSecurity, /"WEBP"/);
  assert.match(quickUpload, /assertStaffUploadSignature/);
  assert.match(identityRuntime, /assertStaffUploadSignature/);
  assert.match(workPermitRuntime, /assertStaffUploadSignature/);
  assert.match(profileUpload, /assertStaffUploadSignature/);
});

test("identical staff captures are idempotently reused before storage or classification", () => {
  assert.match(quickUpload, /fileChecksum/);
  assert.match(quickUpload, /checksum_sha256/);
  assert.match(quickUpload, /findExistingStaffCapture/);
  assert.match(quickUpload, /reused: true/);
  assert.match(quickUpload, /reused: false/);
  assert.doesNotMatch(quickUpload, /duplicate: true/);
  assert.doesNotMatch(quickUpload, /duplicate: false/);
  assert.match(layout, /Already received/);
  const reuseIndex = quickUpload.indexOf("findExistingStaffCapture({");
  const createIndex = quickUpload.indexOf("const created = await createControlledDocument");
  const classifyIndex = quickUpload.indexOf("ServiceExecutionRuntime.execute({");
  assert.ok(reuseIndex >= 0 && createIndex > reuseIndex && classifyIndex > reuseIndex);
});

test("staff quick camera upload is private and self-scoped", () => {
  assert.match(quickUpload, /resolveAuthenticatedStaffContext/);
  assert.match(quickUpload, /createControlledDocument/);
  assert.match(quickUpload, /classification: "RESTRICTED"/);
  assert.match(quickUpload, /ownerStaffId: context\.staff\.id/);
  assert.match(quickUpload, /referenceType: "STAFF"/);
  assert.doesNotMatch(quickUpload, /getPublicUrl/);
});

test("staff quick upload uses Avantiqo-owned document vision with no paid fallback", () => {
  assert.match(quickUpload, /provider_id: "avantiqo-image"/);
  assert.match(quickUpload, /local_only: true/);
  assert.match(quickUpload, /paid_fallback_allowed: false/);
  assert.match(quickUpload, /SAVED_UNCLASSIFIED/);
  assert.doesNotMatch(quickUpload, /provider_id: "openai"/);
});

test("staff quick upload classifies and routes to bounded business destinations", () => {
  assert.match(quickUpload, /ROUTING_DESTINATIONS/);
  assert.match(quickUpload, /ACCOUNTING/);
  assert.match(quickUpload, /HOUSEKEEPING/);
  assert.match(quickUpload, /MAINTENANCE/);
  assert.match(quickUpload, /SUPPLY_CHAIN/);
  assert.match(quickUpload, /FIELD_SERVICE/);
  assert.match(quickUpload, /workflowFromEvidence/);
  assert.match(quickUpload, /SUPPLIER_INVOICE/);
  assert.match(quickUpload, /HOUSEKEEPING_EVIDENCE/);
  assert.match(quickUpload, /staff_capture_routing/);
  assert.match(quickUpload, /autoMutationAllowed: false/);
  assert.match(quickUpload, /requiresHumanReview/);
  assert.match(layout, /routed to \$\{destination\} for review/);
});

test("staff routing converges on the canonical ERP attachment router and matcher", () => {
  assert.match(quickUpload, /routeAnalyzedAttachment/);
  assert.match(quickUpload, /matchAnalyzedAttachmentToBusiness/);
  assert.match(quickUpload, /ERP_REGISTRY/);
  assert.match(quickUpload, /routing = normalizeRouting\(classification, universalDestination\)/);
  assert.match(quickUpload, /routingAuthority: universalDestination\?\.status === "DESTINATION_RESOLVED"/);
  assert.match(quickUpload, /"ERP_REGISTRY"/);
  assert.match(quickUpload, /"STAFF_CLASSIFIER_FALLBACK"/);
  assert.match(quickUpload, /universal_destination: universalDestination/);
  assert.match(quickUpload, /business_match: businessMatch/);
  assert.match(quickUpload, /handoff_status: "AWAITING_ROUTING_REVIEW"/);
  assert.match(intakeRuntime, /patch\.handoff_status = "READY_FOR_DESTINATION_REVIEW"/);
});

test("staff quick upload returns only the mobile confirmation contract", () => {
  assert.match(quickUpload, /reused: true/);
  assert.match(quickUpload, /reused: false/);
  assert.match(quickUpload, /classificationStatus/);
  assert.match(quickUpload, /destinationLabel/);
  assert.match(quickUpload, /workflow/);
  assert.doesNotMatch(quickUpload, /documentId: existingCapture\.document\.id/);
  assert.doesNotMatch(quickUpload, /entityId: existingCapture\.document\.entity_id/);
  assert.doesNotMatch(quickUpload, /documentId,\s*private:/);
  assert.doesNotMatch(quickUpload, /classification:\s*classification,/);
  assert.doesNotMatch(quickUpload, /classificationError,/);
  assert.doesNotMatch(quickUpload, /routingQueueStatus,/);
  assert.match(quickUpload, /result: classification/);
});

test("intelligent intake creates a durable review ledger and never grants browser direct table access", () => {
  assert.match(intakeMigration, /create table if not exists public\.staff_intake_assignments/);
  assert.match(intakeMigration, /enable row level security/);
  assert.match(intakeMigration, /revoke all on table public\.staff_intake_assignments from anon, authenticated/);
  assert.match(quickUpload, /persistRoutingAssignment/);
  assert.match(quickUpload, /destination: "MANAGER"/);
  assert.match(quickUpload, /routingQueueStatus = "QUEUE_FAILED"/);
});

test("staff intake browser payload hides internal document and reviewer identifiers", () => {
  assert.match(intakeRuntime, /projectStaffIntakeAssignment/);
  assert.match(intakeRuntime, /return \(result\.data \|\| \[\]\)\.map\(projectStaffIntakeAssignment\)/);
  const start = intakeRuntime.indexOf("function projectStaffIntakeAssignment(");
  const end = intakeRuntime.indexOf("export async function listStaffIntakeAssignments", start);
  const projection = intakeRuntime.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(projection, /organization_id/);
  assert.doesNotMatch(projection, /entity_id/);
  assert.doesNotMatch(projection, /enterprise_document_id/);
  assert.doesNotMatch(projection, /uploader_staff_id/);
  assert.doesNotMatch(projection, /reviewed_by_staff_id/);
  assert.doesNotMatch(projection, /assigned_staff_id/);
  assert.doesNotMatch(projection, /record_id/);
  assert.doesNotMatch(intakePage, /item\.enterprise_document_id/);
  assert.doesNotMatch(intakePage, /record_id/);
  assert.match(intakeRoute, /return NextResponse\.json\(\{ success: true \}\)/);
});

test("intake review and navigation share one server authorization policy", () => {
  assert.match(intakeRoute, /resolveAuthenticatedStaffContext/);
  assert.match(intakePolicy, /FULL_ACCESS_ROLES/);
  assert.match(intakePolicy, /"SUPER_ADMIN"/);
  assert.match(intakePolicy, /ROLE_DESTINATIONS/);
  assert.match(intakeRuntime, /allowedDestinationsByPolicy/);
  assert.match(intakeRuntime, /STAFF_INTAKE_REVIEW_FORBIDDEN/);
  assert.match(intakeRuntime, /destination_key/);
  assert.match(navigationRuntime, /canReviewStaffIntake/);
  assert.match(navigationRuntime, /reviewOnly: true/);
  assert.doesNotMatch(navigationRuntime, /INTAKE_REVIEW_ROLES/);
});

test("staff intake preview is short-lived and reuses reviewer authorization", () => {
  assert.match(intakePreview, /getStaffIntakeAssignmentForReview/);
  assert.match(intakePreview, /createDocumentSignedUrl/);
  assert.match(intakePreview, /expiresIn: 180/);
  assert.match(intakePreview, /NextResponse\.redirect/);
  assert.match(intakePage, /Preview/);
  assert.match(intakePage, /\/api\/staff\/intake\/\$\{item\.id\}\/preview/);
});

test("staff intake page exposes review actions but not automatic domain mutation", () => {
  assert.match(intakePage, /Assign to me/);
  assert.match(intakePage, /Approve routing/);
  assert.match(intakePage, /Mark handled/);
  assert.match(intakeRuntime, /ROUTING_APPROVED/);
  assert.match(intakeRuntime, /\["PENDING_REVIEW", "ASSIGNED", "ROUTING_APPROVED"\]/);
  assert.match(intakeRuntime, /patch\.handoff_status = "COMPLETED"/);
  assert.match(intakeRuntime, /STAFF_INTAKE_STATE_CONFLICT/);
  assert.match(intakeRuntime, /STAFF_INTAKE_ASSIGNMENT_CONFLICT/);
  assert.match(intakeRuntime, /\.eq\("status", found\.status\)/);
  assert.match(intakeRuntime, /new Set\(\["ROUTING_APPROVED"\]\)/);
  assert.match(intakePage, /Reject/);
  assert.match(intakePage, /human review/);
  assert.doesNotMatch(intakePage, /\/api\/finance/);
  assert.doesNotMatch(intakePage, /\/api\/operations\/housekeeping/);
});

test("Documents upload page converges onto the governed staff quick-upload route", () => {
  assert.match(uploadPage, /\/api\/staff\/quick-upload/);
  assert.doesNotMatch(uploadPage, /\/api\/assets\/upload-file/);
  assert.doesNotMatch(uploadPage, /\/api\/intake\/classify/);
  assert.match(uploadPage, /stored privately as a controlled staff document/);
});

test("legacy staff migration HTTP endpoints are retired", () => {
  assert.match(migrationPreview, /STAFF_MIGRATION_HTTP_RETIRED/);
  assert.match(migrationRun, /STAFF_MIGRATION_HTTP_RETIRED/);
  assert.doesNotMatch(migrationPreview, /previewStaffPartyMigration/);
  assert.doesNotMatch(migrationRun, /migrateStaffAccountsToParty/);
});

test("staff AI feed is organization-and-self scoped owned intelligence with bounded browser output", () => {
  assert.match(aiFeed, /resolveAuthenticatedStaffContext/);
  assert.match(aiFeed, /\.eq\("organization_id", context\.organizationId\)/);
  assert.match(aiFeed, /\.eq\("staff_id", context\.staff\.id\)/);
  assert.match(aiFeed, /memory_value/);
  assert.doesNotMatch(aiFeed, /memory_type,summary/);
  assert.match(aiFeed, /JSON\.stringify\(memoryEvidence\)/);
  assert.match(aiFeed, /parsed\.slice\(0, 6\)/);
  assert.match(aiFeed, /title: String\(item\?\.title/);
  assert.match(aiFeed, /message: String\(item\?\.message/);
  assert.match(aiFeed, /provider_id: "avantiqo-intelligence"/);
  assert.doesNotMatch(aiFeed, /body\.staffId/);
  assert.doesNotMatch(aiFeed, /provider_id:\s*"openai"/);
});
