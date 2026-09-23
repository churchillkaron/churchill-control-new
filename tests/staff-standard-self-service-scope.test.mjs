import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const availability = fs.readFileSync(new URL("../app/api/staff/availability/route.js", import.meta.url), "utf8");
const availabilityRuntime = fs.readFileSync(new URL("../lib/people/workforce/workforceAvailabilityRuntime.js", import.meta.url), "utf8");
const requests = fs.readFileSync(new URL("../app/api/staff/workforce-requests/route.js", import.meta.url), "utf8");
const requestRuntime = fs.readFileSync(new URL("../lib/people/workforce/workforceRequestRuntime.js", import.meta.url), "utf8");
const acknowledge = fs.readFileSync(new URL("../app/api/staff/payroll/acknowledge/route.js", import.meta.url), "utf8");
const dispute = fs.readFileSync(new URL("../app/api/staff/payroll/dispute/route.js", import.meta.url), "utf8");
const acknowledgeRuntime = fs.readFileSync(new URL("../lib/payroll/consolidation/acknowledgePayrollRecord.js", import.meta.url), "utf8");
const disputeRuntime = fs.readFileSync(new URL("../lib/payroll/consolidation/disputePayrollRecord.js", import.meta.url), "utf8");
const staffRuntime = fs.readFileSync(new URL("../app/api/staff/runtime/route.js", import.meta.url), "utf8");
const staffSearch = fs.readFileSync(new URL("../app/api/staff/search/route.js", import.meta.url), "utf8");
const staffRoute = fs.readFileSync(new URL("../app/api/staff/route.js", import.meta.url), "utf8");
const staffRuntimeRoute = fs.readFileSync(new URL("../app/api/staff/runtime/route.js", import.meta.url), "utf8");
const workdayProjection = fs.readFileSync(new URL("../lib/people/portal/StaffBrowserWorkdayProjection.js", import.meta.url), "utf8");
const exceptionProjection = fs.readFileSync(new URL("../lib/people/portal/StaffClockInExceptionProjection.js", import.meta.url), "utf8");
const exceptionRoute = fs.readFileSync(new URL("../app/api/staff/clock-in-exception/route.js", import.meta.url), "utf8");
const requestProjection = fs.readFileSync(new URL("../lib/people/portal/StaffWorkforceRequestProjection.js", import.meta.url), "utf8");
const availabilityProjection = fs.readFileSync(new URL("../lib/people/portal/StaffAvailabilityProjection.js", import.meta.url), "utf8");


test("staff availability is authenticated-self scoped for reads and mutations", () => {
  assert.match(availability, /resolveAuthenticatedStaffContext/);
  assert.match(availability, /staffId: context\.staff\.id/);
  assert.match(availabilityRuntime, /\.eq\("staff_id", staffId\)/);
  assert.match(availabilityRuntime, /p_staff_id: staff\.id/);
  assert.match(availabilityRuntime, /created_by_staff_id: staff\.id/);
});

test("staff workforce requests bind cancellation, swap response and schedules to the authenticated employee", () => {
  assert.match(requests, /resolveAuthenticatedStaffContext/);
  assert.match(requestRuntime, /\.eq\("requester_staff_id", staffId\)/);
  assert.match(requestRuntime, /\.eq\("target_staff_id", staffId\)/);
  assert.match(requestRuntime, /\.eq\("staff_id", staff\.id\)/);
  assert.match(requestRuntime, /\.eq\("staff_id", staffId\)/);
});

test("staff self-service rejects retroactive and overlapping workforce requests", () => {
  assert.match(requestRuntime, /TIME_OFF_PAST_DATE/);
  assert.match(requestRuntime, /TIME_OFF_REQUEST_OVERLAP/);
  assert.match(requestRuntime, /\.in\("status", \["PENDING", "APPROVED"\]\)/);
  assert.match(requestRuntime, /SHIFT_SWAP_PAST_SHIFT/);
  assert.match(requestRuntime, /resolveOrganizationTimeContext/);
  assert.match(availabilityRuntime, /AVAILABILITY_BACKDATE_FORBIDDEN/);
  assert.match(availabilityRuntime, /AVAILABILITY_EXCEPTION_PAST_DATE/);
  assert.match(availabilityRuntime, /resolveOrganizationTimeContext/);
});

test("shift-swap coworker picker does not expose coworker email addresses", () => {
  assert.match(requests, /select\("id,name,role,position,department"\)/);
  assert.doesNotMatch(requests, /select\("id,name,email,role,position,department"\)/);
});

test("general staff directory search is management-only and cannot enumerate coworker email", () => {
  assert.match(staffSearch, /STAFF_DIRECTORY_ROLES/);
  assert.match(staffSearch, /STAFF_DIRECTORY_SEARCH_FORBIDDEN/);
  assert.match(staffSearch, /select\("id,name,role,position,department,profile_picture,party_id"\)/);
  assert.match(staffSearch, /\.ilike\("name"/);
  assert.doesNotMatch(staffSearch, /email\.ilike/);
  assert.doesNotMatch(staffSearch, /profile_picture,email,party_id/);
  assert.doesNotMatch(staffSearch, /organizationId: context\.organizationId/);
});

test("payroll acknowledgement and disputes can touch only the authenticated employee payroll record", () => {
  assert.match(acknowledge, /staffId: staff\.id/);
  assert.match(dispute, /staffId: staff\.id/);
  assert.match(acknowledge, /return NextResponse\.json\(\{ success: true \}\)/);
  assert.match(dispute, /return NextResponse\.json\(\{ success: true \}\)/);
  assert.match(acknowledge, /staffApiErrorResponse\(error, "Unable to acknowledge payroll"\)/);
  assert.match(dispute, /staffApiErrorResponse\(error, "Unable to dispute payroll"\)/);
  assert.doesNotMatch(acknowledge, /success: true, result/);
  assert.doesNotMatch(dispute, /success: true, result/);
  assert.match(acknowledgeRuntime, /\.eq\("staff_id", staffId\)/);
  assert.match(disputeRuntime, /\.eq\("staff_id", staffId\)/);
  assert.match(acknowledgeRuntime, /Payroll record not found for staff member/);
  assert.match(disputeRuntime, /Payroll record not found for staff member/);
  assert.match(acknowledgeRuntime, /employee_dispute\.is\.null,dispute_resolved\.eq\.true/);
  assert.match(acknowledgeRuntime, /PAYROLL_ACKNOWLEDGEMENT_CONFLICT/);
  assert.match(disputeRuntime, /employee_acknowledged\.is\.null,employee_acknowledged\.eq\.false/);
  assert.match(disputeRuntime, /PAYROLL_DISPUTE_CONFLICT/);
});


test("staff availability browser responses omit ownership and audit internals", () => {
  assert.match(availability, /projectStaffAvailability\(availability\)/);
  assert.doesNotMatch(availabilityProjection, /staff_id/);
  assert.doesNotMatch(availabilityProjection, /party_id/);
  assert.doesNotMatch(availabilityProjection, /created_by_staff_id/);
  assert.doesNotMatch(availabilityProjection, /organization_id/);
  assert.doesNotMatch(availability, /organizationId: context\.organizationId,\s*result/);
});

test("staff Requests forms expose accessible names for every primary control", () => {
  const page = fs.readFileSync(new URL("../app/(system)/staff/requests/page.jsx", import.meta.url), "utf8");
  for (const label of [
    "Leave type",
    "Attendance classification",
    "Time off start date",
    "Time off end date",
    "Time off reason",
    "Shift to swap",
    "Coworker for shift swap",
    "Shift swap reason",
  ]) {
    assert.match(page, new RegExp(`aria-label="${label}"`));
  }
});

test("staff workforce-request responses omit party, reviewer, entity and organization internals", () => {
  assert.match(requests, /projectStaffWorkforceRequestLists\(requests\)/);
  assert.match(requests, /projectStaffWorkforceMutation\(action, result\)/);
  assert.doesNotMatch(requestProjection, /requester_party_id/);
  assert.doesNotMatch(requestProjection, /target_party_id/);
  assert.doesNotMatch(requestProjection, /reviewed_by_staff_id/);
  assert.doesNotMatch(requestProjection, /reviewed_by_party_id/);
  assert.doesNotMatch(requestProjection, /entity_id/);
  assert.doesNotMatch(requestProjection, /organization_id/);
});

test("staff clock-in exception responses hide internal approval actor and reference ids", () => {
  assert.match(exceptionRoute, /projectStaffClockInExceptionState/);
  assert.match(exceptionRoute, /projectStaffClockInExceptionRequest/);
  assert.match(staffRuntimeRoute, /projectStaffClockInExceptionState/);
  assert.doesNotMatch(exceptionProjection, /referenceId/);
  assert.doesNotMatch(exceptionProjection, /requestedBy/);
  assert.doesNotMatch(exceptionProjection, /approvedBy/);
  assert.doesNotMatch(exceptionProjection, /rejectedBy/);
});

test("staff Home explains unscheduled clock-in without showing manager-exception guidance when no shift is scheduled", () => {
  const home = fs.readFileSync(new URL("../app/(system)/staff/page.jsx", import.meta.url), "utf8");
  assert.match(home, /records an unscheduled shift for manager approval/);
  assert.match(home, /!runtime\?\.shiftActive && schedule && \(requirements\.passkeyRequired \|\| requirements\.gpsRequired\)/);
});

test("staff browser workday responses never expose raw GPS or internal shift evidence", () => {
  assert.match(staffRoute, /projectStaffSchedule\(workday\.schedule\)/);
  assert.match(staffRoute, /projectStaffShift\(workday\.openShift\)/);
  assert.match(staffRoute, /projectStaffShiftResult\(result\)/);
  assert.match(staffRuntimeRoute, /projectStaffSchedule\(workday\.schedule\)/);
  assert.match(staffRuntimeRoute, /projectStaffShift\(workday\.openShift\)/);
  assert.doesNotMatch(workdayProjection, /clock_in_latitude/);
  assert.doesNotMatch(workdayProjection, /clock_in_longitude/);
  assert.doesNotMatch(workdayProjection, /clock_in_accuracy_meters/);
  assert.doesNotMatch(workdayProjection, /clock_in_distance_meters/);
  assert.doesNotMatch(workdayProjection, /metadata/);
});

test("staff runtime and root staff endpoint expose only minimal personal staff summaries", () => {
  const staffRoute = fs.readFileSync(new URL("../app/api/staff/route.js", import.meta.url), "utf8");
  assert.match(staffRuntime, /staff: \{/);
  assert.match(staffRuntime, /name: staff\.name/);
  assert.match(staffRuntime, /department: staff\.department/);
  assert.doesNotMatch(staffRuntime, /profile_picture: staff\.profile_picture/);
  assert.doesNotMatch(staffRuntime, /email: staff\.email/);
  assert.doesNotMatch(staffRuntime, /party_id: staff\.party_id/);
  assert.doesNotMatch(staffRuntime, /membership: context\.membership/);
  assert.doesNotMatch(staffRuntime, /permissions: context\.permissions/);
  assert.doesNotMatch(staffRuntime, /staff,\s*membership:/);
  assert.match(staffRoute, /staff: \{[\s\S]{0,500}profile_picture: context\.staff\.profile_picture/);
  assert.match(staffRoute, /name: context\.staff\.name/);
  assert.match(staffRoute, /department: context\.staff\.department/);
  assert.doesNotMatch(staffRoute, /staff: context\.staff,\s*timezone:/);
});
