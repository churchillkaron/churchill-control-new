import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  reconciliation: "lib/payroll/consolidation/loadPayrollAttendanceReconciliation.js",
  generator: "lib/payroll/consolidation/generateMonthlyPayroll.js",
  reviewer: "lib/payroll/consolidation/reviewAttendancePenalty.js",
  recalculator: "lib/payroll/consolidation/recalculatePayrollRecord.js",
  scheduleApi: "app/api/people/workforce/schedules/route.js",
  freshnessMigration:
    "supabase/migrations/20260813044651_workforce_schedule_mutation_freshness.sql",
  statusMigration:
    "supabase/migrations/20260813054525_workforce_schedule_status_convergence.sql",
  deleteGuardMigration:
    "supabase/migrations/20260813060210_workforce_schedule_delete_guard.sql",
});

const ACTIVE_SOURCE_ROOTS = Object.freeze(["app", "lib", "components"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing Workforce/Payroll release file: ${relativePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} is missing a required reconciliation contract`);
  }
}

function requireNoMatch(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`${label} contains a forbidden reconciliation contract`);
  }
}

function collectSourceFiles(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];

  const files = [];
  const stack = [absoluteRoot];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }

      files.push(path.relative(ROOT, absolutePath));
    }
  }

  return files;
}

function assertNoScheduleHardDeletes() {
  const sourceFiles = ACTIVE_SOURCE_ROOTS.flatMap(collectSourceFiles);
  const supabaseHardDelete =
    /\.from\(\s*["']staff_schedules["']\s*\)[\s\S]{0,800}?\.delete\s*\(/;
  const sqlHardDelete = /\bdelete\s+from\s+(?:public\.)?staff_schedules\b/i;
  const violations = [];

  for (const relativePath of sourceFiles) {
    const fileSource = read(relativePath);

    if (supabaseHardDelete.test(fileSource) || sqlHardDelete.test(fileSource)) {
      violations.push(relativePath);
    }
  }

  if (violations.length) {
    throw new Error(
      `Workforce schedules are append/mutate history. Hard delete is forbidden; use status CANCELLED so payroll freshness remains observable. Violations: ${violations.join(", ")}`
    );
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
);

assertNoScheduleHardDeletes();

requireMatch(
  source.reconciliation,
  /\.from\("staff_schedules"\)[\s\S]*?\.select\("id,staff_id,shift_date,start_time,end_time,status,created_at,updated_at"\)[\s\S]*?\.gte\("shift_date", range\.start\)[\s\S]*?\.lt\("shift_date", range\.end\)/,
  "Payroll attendance reconciliation schedule query",
);
requireNoMatch(
  source.reconciliation,
  /\.from\("staff_schedules"\)[\s\S]{0,500}?\.eq\("status",\s*"PUBLISHED"\)/,
  "Payroll attendance reconciliation schedule query",
);
requireMatch(
  source.reconciliation,
  /const schedules = scheduleRows\.filter\([\s\S]*?status[\s\S]*?PUBLISHED/,
  "Payroll attendance reconciliation published-schedule filter",
);
requireMatch(
  source.reconciliation,
  /scheduleRows\.flatMap\(\(schedule\) => \[schedule\.created_at, schedule\.updated_at\]\)/,
  "Payroll attendance reconciliation freshness watermark",
);
requireMatch(
  source.reconciliation,
  /export function isPayrollAttendanceSnapshotStale/,
  "Payroll attendance stale-snapshot guard",
);
requireMatch(
  source.reconciliation,
  /if \(status === "ABSENT"\)[\s\S]{0,120}?missedShifts \+= 1/,
  "Payroll attendance absence classification",
);
requireMatch(
  source.reconciliation,
  /payrollSettings\?\.\[policyKey\] === true[\s\S]{0,180}?creditedHours \+= scheduleHours/,
  "Payroll attendance credited-leave policy",
);

const deleteHandler = source.scheduleApi.slice(
  source.scheduleApi.indexOf("export async function DELETE"),
);
requireMatch(
  deleteHandler,
  /\.from\("staff_schedules"\)[\s\S]{0,400}?\.update\(\{[\s\S]{0,220}?status:\s*"CANCELLED"/,
  "Workforce schedule cancellation lifecycle",
);
requireMatch(
  deleteHandler,
  /\.select\("id,status,updated_at"\)/,
  "Workforce schedule cancellation freshness response",
);
requireNoMatch(
  deleteHandler,
  /\.from\("staff_schedules"\)[\s\S]{0,250}?\.delete\(\)/,
  "Workforce schedule cancellation lifecycle",
);
requireMatch(
  source.scheduleApi,
  /const commonUpdate = \{[\s\S]{0,300}?status:\s*"PUBLISHED"/,
  "Workforce schedule republish lifecycle",
);

requireMatch(
  source.freshnessMigration,
  /add column if not exists updated_at timestamptz/,
  "Workforce schedule freshness migration",
);
requireMatch(
  source.freshnessMigration,
  /alter column updated_at set default now\(\)[\s\S]*?alter column updated_at set not null/,
  "Workforce schedule freshness migration",
);
requireMatch(
  source.freshnessMigration,
  /create trigger staff_schedules_set_updated_at[\s\S]*?before update on public\.staff_schedules[\s\S]*?execute function public\.set_updated_at\(\)/,
  "Workforce schedule freshness trigger",
);

requireMatch(
  source.statusMigration,
  /alter column status drop default/,
  "Workforce schedule status default retirement",
);
requireMatch(
  source.statusMigration,
  /add constraint staff_schedules_status_canonical[\s\S]*?status is not null[\s\S]*?status in \('PUBLISHED', 'CANCELLED'\)[\s\S]*?not valid/,
  "Workforce schedule canonical-status constraint",
);
requireNoMatch(
  source.statusMigration,
  /update\s+(?:public\.)?staff_schedules\b|alter\s+table[\s\S]*?validate\s+constraint\s+staff_schedules_status_canonical/i,
  "Workforce legacy schedule status preservation",
);

requireMatch(
  source.deleteGuardMigration,
  /create or replace function public\.prevent_staff_schedule_hard_delete\(\)[\s\S]*?returns trigger[\s\S]*?raise exception[\s\S]*?CANCELLED instead/,
  "Workforce schedule database hard-delete guard",
);
requireMatch(
  source.deleteGuardMigration,
  /create trigger staff_schedules_prevent_delete[\s\S]*?before delete on public\.staff_schedules[\s\S]*?execute function public\.prevent_staff_schedule_hard_delete\(\)/,
  "Workforce schedule database delete trigger",
);
requireNoMatch(
  source.deleteGuardMigration,
  /security\s+definer/i,
  "Workforce schedule delete guard privilege boundary",
);
requireMatch(
  source.deleteGuardMigration,
  /revoke execute on function public\.prevent_staff_schedule_hard_delete\(\) from public[\s\S]*?from anon[\s\S]*?from authenticated/,
  "Workforce schedule delete guard execution grants",
);

requireMatch(
  source.generator,
  /\.from\("staff_schedules"\)[\s\S]{0,300}?\.eq\("status",\s*"PUBLISHED"\)/,
  "Monthly payroll published-schedule calculation",
);
requireMatch(
  source.generator,
  /const unresolvedAttendanceReviewRequired =\s*attendanceReconciliation\.unresolvedSchedules > 0/,
  "Monthly payroll unresolved-attendance review",
);
requireMatch(
  source.generator,
  /const approvedHours = Number\([\s\S]{0,180}?workedHours \+ attendanceReconciliation\.creditedHours/,
  "Monthly payroll credited-hours calculation",
);
requireMatch(
  source.generator,
  /attendancePenalty:\s*latenessPenalty\.amount/,
  "Monthly payroll controlled lateness deduction",
);
requireNoMatch(
  source.generator,
  /absence[_A-Za-z]*deduction|missed[_A-Za-z]*shift[_A-Za-z]*deduction|missedShifts\s*\*\s*(?:profile|hourly|salary|rate)/i,
  "Monthly payroll absence deductions",
);

for (const [label, file] of [
  ["Payroll manager review", source.reviewer],
  ["Payroll recalculation", source.recalculator],
]) {
  requireMatch(
    file,
    /PAYROLL_ATTENDANCE_CLASSIFICATION_REQUIRED/,
    `${label} unresolved-attendance guard`,
  );
  requireMatch(
    file,
    /isPayrollAttendanceSnapshotStale/,
    `${label} stale-attendance guard`,
  );
}

requireMatch(
  source.reviewer,
  /PAYROLL_ATTENDANCE_RECALCULATION_REQUIRED/,
  "Payroll manager review stale-attendance response",
);
requireMatch(
  source.recalculator,
  /PAYROLL_RECALCULATION_NOT_REQUIRED/,
  "Payroll recalculation freshness guard",
);
requireMatch(
  source.recalculator,
  /PAYROLL_STATUS\.RECALCULATED/,
  "Payroll recalculation lifecycle",
);

console.log(
  "Workforce/Payroll reconciliation release audit passed: database-enforced schedule history, canonical schedule statuses, no active schedule hard deletes, schedule mutation freshness, attendance classification, credited leave, stale-payroll blocking, controlled lateness, and no automatic absence deduction are intact.",
);
