import fs from "node:fs";

const checks = [];
const read = (path) => fs.readFileSync(path, "utf8");
const requireText = (name, text, pattern) => {
  const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
  checks.push({ name, ok });
};
const requireFile = (name, path) => {
  const ok = fs.existsSync(path);
  checks.push({ name, ok });
  return ok ? read(path) : "";
};

const runtime = requireFile(
  "workforce request runtime exists",
  "lib/people/workforce/workforceRequestRuntime.js"
);
const staffApi = requireFile(
  "staff workforce request API exists",
  "app/api/staff/workforce-requests/route.js"
);
const managerApi = requireFile(
  "manager workforce request API exists",
  "app/api/people/workforce/requests/route.js"
);
const staffPage = requireFile(
  "staff request portal exists",
  "app/(system)/staff/requests/page.jsx"
);
const staffLayout = requireFile(
  "staff portal request navigation exists",
  "app/(system)/staff/layout.jsx"
);
const managerPage = requireFile(
  "manager request workspace exists",
  "app/(system)/workspace/[organizationId]/people/requests/page.jsx"
);
const schedulingLayout = requireFile(
  "scheduling workforce context exists",
  "app/(system)/workspace/[organizationId]/people/scheduling/layout.jsx"
);
const registry = requireFile(
  "People registry exists",
  "lib/people/registry/peopleWorkspaceRegistry.js"
);
const reconciliation = requireFile(
  "payroll attendance reconciliation exists",
  "lib/payroll/consolidation/loadPayrollAttendanceReconciliation.js"
);
const generator = requireFile(
  "payroll generator exists",
  "lib/payroll/consolidation/generateMonthlyPayroll.js"
);
const lifecycleMigration = requireFile(
  "workforce request lifecycle migration aligned",
  "supabase/migrations/20260815072910_workforce_time_off_shift_swap_lifecycle.sql"
);
const rosterGuardMigration = requireFile(
  "approved time-off roster guard migration aligned",
  "supabase/migrations/20260815073203_workforce_approved_time_off_roster_guard.sql"
);
const overlapMigration = requireFile(
  "time-off overlap guard migration aligned",
  "supabase/migrations/20260815073624_workforce_time_off_overlap_guard.sql"
);

requireText("runtime owns time-off creation", runtime, "createTimeOffRequest");
requireText("runtime owns shift-swap creation", runtime, "createShiftSwapRequest");
requireText("target accepts before manager", runtime, '"PENDING_MANAGER"');
requireText("swap rejects schedule evidence", runtime, "SCHEDULE_EVIDENCE_LOCKED");
requireText("manager swap uses atomic RPC", runtime, 'rpc("approve_staff_shift_swap_atomic"');
requireText("approved time off loader exists", runtime, "loadApprovedTimeOffForRange");
requireText("staff API supports time off", staffApi, 'action === "request_time_off"');
requireText("staff API supports shift swaps", staffApi, 'action === "request_shift_swap"');
requireText("staff target can respond", staffApi, 'action === "respond_shift_swap"');
requireText("manager API reviews time off", managerApi, 'kind === "time_off"');
requireText(
  "manager API accepts shift-swap review kind",
  managerApi,
  '["time_off", "shift_swap"].includes(kind)'
);
requireText(
  "manager API routes swaps to canonical review runtime",
  managerApi,
  "reviewShiftSwapRequest"
);
requireText("staff page submits time off", staffPage, 'action: "request_time_off"');
requireText("staff page submits swaps", staffPage, 'action: "request_shift_swap"');
requireText("staff page accepts incoming swap", staffPage, 'decision: "ACCEPT"');
requireText("staff navigation links requests", staffLayout, 'href: "/staff/requests"');
requireText("staff navigation links earnings", staffLayout, 'href: "/staff/earnings"');
requireText("manager page approves requests", managerPage, 'decision, notes');
requireText("scheduling context reads request API", schedulingLayout, "/api/people/workforce/requests");
requireText("scheduling shows pending leave", schedulingLayout, 'label="Pending leave"');
requireText("scheduling shows approved leave", schedulingLayout, 'label="Approved leave"');
requireText("scheduling shows open swaps", schedulingLayout, 'label="Open swaps"');
requireText("scheduling links manager review", schedulingLayout, "people/requests");
requireText("People registry exposes requests", registry, 'route: "/people/requests"');

requireText("reconciliation loads canonical approved time off", reconciliation, "loadApprovedTimeOffForRange");
requireText("reconciliation freshness includes leave review", reconciliation, "request.reviewed_at");
requireText("reconciliation credits leave through policy", reconciliation, "ATTENDANCE_CREDIT_POLICY");
requireText("payroll generator loads canonical approved time off", generator, "loadApprovedTimeOffForRange");
requireText("payroll generator passes approved time off to reconciliation", generator, "approvedTimeOff: memberApprovedTimeOff");
requireText("payroll generator keeps configured leave policy", generator, "approved_leave_counts_as_worked");

requireText("time-off table exists", lifecycleMigration, "staff_time_off_requests");
requireText("shift-swap table exists", lifecycleMigration, "staff_shift_swap_requests");
requireText("request deletion blocked", lifecycleMigration, "prevent_staff_workforce_request_delete");
requireText("request functions are security invoker", lifecycleMigration, /security invoker/);
requireText("request tables have RLS", lifecycleMigration, "enable row level security");
requireText("atomic swap approval exists", lifecycleMigration, "approve_staff_shift_swap_atomic");
requireText("atomic swap checks shift evidence", lifecycleMigration, "staff_shifts");
requireText("atomic swap checks attendance evidence", lifecycleMigration, "staff_attendance");
requireText("roster guard blocks approved leave", rosterGuardMigration, "prevent_schedule_over_approved_time_off");
requireText("roster guard is security invoker", rosterGuardMigration, "security invoker");
requireText("overlapping leave guard exists", overlapMigration, "prevent_overlapping_staff_time_off_requests");
requireText("overlap guard covers pending and approved", overlapMigration, "r.status in ('PENDING', 'APPROVED')");

const forbiddenSecurityDefiner = [lifecycleMigration, rosterGuardMigration, overlapMigration]
  .some((text) => /security\s+definer/i.test(text));
checks.push({ name: "no workforce request migration uses SECURITY DEFINER", ok: !forbiddenSecurityDefiner });

const forbiddenAutoSalaryDeduction = [runtime, reconciliation, generator].some((text) =>
  /monthly_salary\s*[-=].*(absent|leave)|absence.*monthly_salary/i.test(text)
);
checks.push({ name: "leave lifecycle does not auto-deduct monthly salary", ok: !forbiddenAutoSalaryDeduction });

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nWORKFORCE REQUEST LIFECYCLE AUDIT FAILED: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\nWORKFORCE REQUEST LIFECYCLE AUDIT PASSED: ${checks.length} checks`);
}
