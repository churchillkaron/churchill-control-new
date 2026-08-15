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

const runtime = requireFile(
  "workforce calendar runtime exists",
  "lib/people/workforce/workforceCalendarRuntime.js"
);
const api = requireFile(
  "workforce calendar API exists",
  "app/api/people/workforce/calendar/route.js"
);
const page = requireFile(
  "workforce calendar workspace exists",
  "app/(system)/workspace/[organizationId]/people/calendar/page.jsx"
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
const migration = requireFile(
  "workforce calendar migration aligned",
  "supabase/migrations/20260815105629_workforce_calendar_public_holiday_convergence.sql"
);

requireText("runtime loads entity calendar", runtime, "loadWorkforceCalendar");
requireText("runtime creates calendar day", runtime, "createWorkforceCalendarDay");
requireText("runtime cancels without deleting", runtime, "cancelWorkforceCalendarDay");
requireText("runtime exposes public holiday map", runtime, "loadPublicHolidayMap");
requireText("manager API uses calendar runtime", api, "createWorkforceCalendarDay");
requireText("manager API scopes active legal entities", api, '.from("legal_entities")');
requireText("workspace calls calendar API", page, "/api/people/workforce/calendar");
requireText("workspace supports public holiday", page, 'value="PUBLIC_HOLIDAY"');
requireText("workspace supports organization closure", page, 'value="ORGANIZATION_CLOSURE"');
requireText("workspace supports working day override", page, 'value="WORKING_DAY_OVERRIDE"');
requireText("People registry exposes workforce calendar", registry, 'route: "/people/calendar"');

requireText("reconciliation consumes workforce calendar", reconciliation, "loadWorkforceCalendar");
requireText("reconciliation resolves legal entity", reconciliation, "resolvePayrollEntityId");
requireText("reconciliation keeps explicit attendance precedence", reconciliation, "attendanceClassification || (publicHoliday ? \"PUBLIC_HOLIDAY\" : \"\")");
requireText("reconciliation uses configured holiday pay policy", reconciliation, "public_holiday_counts_as_worked");
requireText("reconciliation freshness includes calendar cancellation", reconciliation, "day.cancelled_at");
requireText("reconciliation reports public holiday schedules", reconciliation, "publicHolidayScheduleIds");

requireText("generator consumes workforce calendar", generator, "loadWorkforceCalendar");
requireText("generator uses entity scoped calendar", generator, "entityId,");
requireText("generator applies public holiday overlay", generator, "publicHolidayByDate");
requireText("generator uses configured holiday pay policy", generator, "public_holiday_counts_as_worked");
requireText("generator reports public holiday count", generator, "publicHolidayCount");

requireText("calendar table exists", migration, "workforce_calendar_days");
requireText("calendar is legal entity scoped", migration, "workforce_calendar_days_entity_fkey");
requireText("calendar supports public holiday", migration, "PUBLIC_HOLIDAY");
requireText("calendar supports organization closure", migration, "ORGANIZATION_CLOSURE");
requireText("calendar supports working day override", migration, "WORKING_DAY_OVERRIDE");
requireText("calendar evidence is immutable", migration, "prevent_workforce_calendar_day_core_mutation");
requireText("calendar cancellation preserves history", migration, "status in ('ACTIVE','CANCELLED')");
requireText("calendar RLS enabled", migration, "enable row level security");
requireText("calendar functions use security invoker", migration, /security\s+invoker/i);
requireText("direct authenticated calendar writes revoked", migration, "revoke insert, update, delete on public.workforce_calendar_days from anon, authenticated");

const forbiddenSecurityDefiner = /security\s+definer/i.test(migration);
checks.push({ name: "calendar migration avoids SECURITY DEFINER", ok: !forbiddenSecurityDefiner });

const forbiddenHardcodedHoliday = [runtime, reconciliation, generator].some((text) =>
  /Thailand.*holiday|Songkran|Christmas Day|New Year.?s Day/i.test(text)
);
checks.push({ name: "calendar logic has no hardcoded jurisdiction holiday dates", ok: !forbiddenHardcodedHoliday });

const forbiddenAutoSalaryDeduction = [runtime, reconciliation, generator].some((text) =>
  /monthly_salary\s*[-=].*(holiday|absence)|holiday.*monthly_salary/i.test(text)
);
checks.push({ name: "public holiday lifecycle does not auto-deduct monthly salary", ok: !forbiddenAutoSalaryDeduction });

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nWORKFORCE CALENDAR AUDIT FAILED: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`\nWORKFORCE CALENDAR AUDIT PASSED: ${checks.length} checks`);
}
