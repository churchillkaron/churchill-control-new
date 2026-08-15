import fs from "node:fs";

const checks = [];
const read = (path) => fs.readFileSync(path, "utf8");
const requireFile = (name, path) => {
  const ok = fs.existsSync(path);
  checks.push({ name, ok });
  return ok ? read(path) : "";
};
const requireText = (name, text, pattern) => {
  const ok = typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
  checks.push({ name, ok });
};

const runtime = requireFile("availability runtime exists", "lib/people/workforce/workforceAvailabilityRuntime.js");
const staffApi = requireFile("staff availability API exists", "app/api/staff/availability/route.js");
const staffPage = requireFile("staff availability page exists", "app/(system)/staff/availability/page.jsx");
const staffLayout = requireFile("staff layout exists", "app/(system)/staff/layout.jsx");
const scheduleApi = requireFile("scheduling API exists", "app/api/people/workforce/schedules/route.js");
const migration = requireFile("availability migration exists", "supabase/migrations/20260815103608_workforce_staff_availability_convergence.sql");

requireText("runtime evaluates scheduling availability", runtime, "evaluateScheduleAvailability");
requireText("runtime loads organization time context", runtime, "resolveOrganizationTimeContext");
requireText("runtime uses organization-local date", runtime, "localDateString");
requireText("runtime owns weekly pattern replacement", runtime, "replaceStaffAvailabilityPattern");
requireText("runtime owns dated exceptions", runtime, "createAvailabilityException");
requireText("runtime can cancel exceptions", runtime, "cancelAvailabilityException");
requireText("staff API resolves authenticated staff", staffApi, "resolveAuthenticatedStaffContext");
requireText("staff API replaces own pattern", staffApi, 'action === "replace_pattern"');
requireText("staff API creates exception", staffApi, 'action === "create_exception"');
requireText("staff API cancels exception", staffApi, 'action !== "cancel_exception"');
requireText("staff UI states availability is not leave", staffPage, "formal leave or sickness must still be submitted through Requests");
requireText("staff UI exposes recurring weekly pattern", staffPage, "Weekly Pattern");
requireText("staff UI exposes date exception", staffPage, "Date Exception");
requireText("staff UI surfaces existing roster conflicts", staffPage, "Existing roster conflicts");
requireText("staff navigation exposes availability", staffLayout, 'href: "/staff/availability"');
requireText("scheduling loads availability", scheduleApi, "loadAvailabilityForScheduleRange");
requireText("scheduling evaluates batch conflicts", scheduleApi, "availabilityConflictsForRows");
requireText("scheduling blocks silent conflict publish", scheduleApi, "SCHEDULE_AVAILABILITY_CONFLICT");
requireText("scheduling accepts explicit override reason", scheduleApi, "availabilityOverrideReason");
requireText("scheduling stores override actor", scheduleApi, "availability_override_by_staff_id");
requireText("scheduling stores override timestamp", scheduleApi, "availability_override_at");
requireText("scheduling stores override reason", scheduleApi, "availability_override_reason");
requireText("scheduling GET surfaces current conflicts", scheduleApi, "availabilityConflict");
requireText("patterns table exists", migration, "staff_availability_patterns");
requireText("exceptions table exists", migration, "staff_availability_exceptions");
requireText("migration has schedule override evidence", migration, "availability_override_reason");
requireText("availability tables have RLS", migration, "enable row level security");
requireText("pattern replacement RPC is service-role only", migration, "grant execute on function public.replace_staff_availability_pattern");
requireText("migration uses security invoker", migration, /security invoker/i);

checks.push({ name: "availability migration never uses SECURITY DEFINER", ok: !/security\s+definer/i.test(migration) });
checks.push({ name: "availability runtime is not payroll coupled", ok: !/from\s+["']@\/lib\/payroll|monthly_salary|salary_deduction/i.test(runtime) });
checks.push({ name: "availability runtime does not hardcode Bangkok", ok: !/Asia\/Bangkok/i.test(runtime) });
checks.push({ name: "availability UI has no fake sample rows", ok: !/fake|mock data|sample staff/i.test(staffPage) });

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
if (failed.length) {
  console.error(`\nWORKFORCE AVAILABILITY AUDIT FAILED: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\nWORKFORCE AVAILABILITY AUDIT PASSED: ${checks.length} checks`);
}
