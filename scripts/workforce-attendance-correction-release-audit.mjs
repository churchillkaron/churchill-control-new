import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  runtime: "lib/people/workforce/attendanceCorrectionRuntime.js",
  attendanceApi: "app/api/people/workforce/attendance/route.js",
  attendancePage:
    "app/(system)/workspace/[organizationId]/people/attendance/page.jsx",
  reconciliation:
    "lib/payroll/consolidation/loadPayrollAttendanceReconciliation.js",
  generator: "lib/payroll/consolidation/generateMonthlyPayroll.js",
  correctionMigration:
    "supabase/migrations/20260815065422_workforce_attendance_correction_evidence.sql",
  rawEvidenceMigration:
    "supabase/migrations/20260815065614_workforce_raw_clock_evidence_immutability.sql",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing attendance correction release file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} is missing a required attendance correction contract`);
  }
}

function requireNoMatch(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`${label} contains a forbidden attendance correction contract`);
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
);

requireMatch(
  source.runtime,
  /export async function loadAttendanceCorrections/,
  "Attendance correction loader",
);
requireMatch(
  source.runtime,
  /export function applyEffectiveShiftCorrections[\s\S]*?raw_clock_in:[\s\S]*?raw_clock_out:[\s\S]*?clock_in: correction\.corrected_clock_in[\s\S]*?clock_out: correction\.corrected_clock_out/,
  "Attendance raw/effective projection",
);
requireMatch(
  source.runtime,
  /export async function createAttendanceCorrection[\s\S]*?correction_reason:[\s\S]*?approved_by_staff_id:[\s\S]*?approved_at:/,
  "Attendance manager correction evidence",
);
requireMatch(
  source.runtime,
  /correctedWorkedMinutes[\s\S]*?correctedOvertimeMinutes[\s\S]*?correctedLateMinutes[\s\S]*?correctedIsLate/,
  "Attendance corrected derived evidence",
);
requireMatch(
  source.runtime,
  /Corrected clock-in must remain on workforce business date/,
  "Attendance correction business-date guard",
);
requireNoMatch(
  source.runtime,
  /\.from\("staff_shifts"\)[\s\S]{0,500}?\.update\s*\(/,
  "Attendance correction raw shift mutation",
);
requireNoMatch(
  source.runtime,
  /\.from\("staff_attendance"\)[\s\S]{0,500}?\.update\s*\(/,
  "Attendance correction raw attendance mutation",
);

requireMatch(
  source.attendanceApi,
  /action === "correct_shift_time"[\s\S]*?createAttendanceCorrection\(/,
  "Attendance correction API action",
);
requireMatch(
  source.attendanceApi,
  /action === "adjust_lateness"[\s\S]*?ATTENDANCE_CORRECTION_REQUIRED/,
  "Legacy lateness mutation retirement",
);
requireMatch(
  source.attendanceApi,
  /loadAttendanceCorrections\([\s\S]*?applyEffectiveShiftCorrections\(/,
  "Attendance effective evidence query",
);
requireMatch(
  source.attendanceApi,
  /correctableShifts:\s*shifts\.filter\(correctionEligibleShift\)/,
  "Attendance correction eligibility projection",
);
requireNoMatch(
  source.attendanceApi,
  /action === "adjust_lateness"[\s\S]{0,2200}?\.update\(\{[\s\S]{0,180}?late_minutes:/,
  "Legacy raw lateness rewrite",
);

requireMatch(
  source.attendancePage,
  /Worked Shift Corrections/,
  "Attendance correction manager workspace",
);
requireMatch(
  source.attendancePage,
  /Raw clock[\s\S]*?Effective for payroll/,
  "Attendance raw/effective visual separation",
);
requireMatch(
  source.attendancePage,
  /"correct_shift_time"[\s\S]*?correctedClockInLocal[\s\S]*?correctedClockOutLocal[\s\S]*?reason/,
  "Attendance correction UI payload",
);
requireMatch(
  source.attendancePage,
  /Raw clock evidence was preserved and payroll will use the approved effective time/,
  "Attendance correction confirmation semantics",
);
requireNoMatch(
  source.attendancePage,
  /"adjust_lateness"/,
  "Attendance legacy lateness editor",
);

requireMatch(
  source.correctionMigration,
  /create table if not exists public\.staff_attendance_corrections/,
  "Attendance correction document",
);
requireMatch(
  source.correctionMigration,
  /raw_clock_in timestamptz not null[\s\S]*?raw_clock_out timestamptz not null[\s\S]*?corrected_clock_in timestamptz not null[\s\S]*?corrected_clock_out timestamptz not null/,
  "Attendance immutable raw/corrected snapshots",
);
requireMatch(
  source.correctionMigration,
  /supersedes_correction_id[\s\S]*?unique \(supersedes_correction_id\)/,
  "Attendance correction revision chain",
);
requireMatch(
  source.correctionMigration,
  /create or replace function public\.validate_staff_attendance_correction\(\)[\s\S]*?security invoker[\s\S]*?pg_advisory_xact_lock/,
  "Attendance correction concurrency validator",
);
requireMatch(
  source.correctionMigration,
  /raw snapshot must equal immutable shift evidence/,
  "Attendance correction raw snapshot database guard",
);
requireMatch(
  source.correctionMigration,
  /create trigger staff_attendance_corrections_prevent_mutation[\s\S]*?before update or delete/,
  "Attendance correction append-only database trigger",
);
requireMatch(
  source.correctionMigration,
  /alter table public\.staff_attendance_corrections enable row level security/,
  "Attendance correction RLS",
);
requireMatch(
  source.correctionMigration,
  /for insert[\s\S]*?can_manage_organization\(organization_id\)/,
  "Attendance correction manager organization policy",
);
requireNoMatch(
  source.correctionMigration,
  /security\s+definer/i,
  "Attendance correction privilege escalation",
);

requireMatch(
  source.rawEvidenceMigration,
  /new\.clock_in is distinct from old\.clock_in[\s\S]*?Raw shift clock-in evidence is immutable/,
  "Raw shift clock-in immutability",
);
requireMatch(
  source.rawEvidenceMigration,
  /old\.clock_out is not null[\s\S]*?new\.clock_out is distinct from old\.clock_out[\s\S]*?Completed raw shift evidence is immutable/,
  "Raw shift completed evidence immutability",
);
requireMatch(
  source.rawEvidenceMigration,
  /new\.late_minutes is distinct from old\.late_minutes[\s\S]*?Raw shift lateness evidence is immutable/,
  "Raw shift lateness immutability",
);
requireMatch(
  source.rawEvidenceMigration,
  /new\.actual_start is distinct from old\.actual_start[\s\S]*?Raw attendance clock-in evidence is immutable/,
  "Raw attendance clock-in immutability",
);
requireMatch(
  source.rawEvidenceMigration,
  /old\.actual_end is not null[\s\S]*?new\.actual_end is distinct from old\.actual_end[\s\S]*?Raw attendance clock-out evidence is immutable/,
  "Raw attendance completed evidence immutability",
);
requireNoMatch(
  source.rawEvidenceMigration,
  /security\s+definer/i,
  "Raw clock evidence privilege escalation",
);

requireMatch(
  source.reconciliation,
  /loadAttendanceCorrections[\s\S]*?applyEffectiveShiftCorrections/,
  "Payroll readiness effective attendance evidence",
);
requireMatch(
  source.reconciliation,
  /corrections\.flatMap\([\s\S]*?correction\.created_at[\s\S]*?correction\.approved_at/,
  "Payroll correction freshness watermark",
);
requireMatch(
  source.reconciliation,
  /correctionCount:\s*corrections\.length/,
  "Payroll readiness correction projection",
);

requireMatch(
  source.generator,
  /loadAttendanceCorrections[\s\S]*?applyEffectiveShiftCorrections/,
  "Monthly payroll effective attendance evidence",
);
requireMatch(
  source.generator,
  /const shifts = effectiveRawShifts\.filter\(payrollEligibleShift\)/,
  "Monthly payroll corrected shift source",
);
requireMatch(
  source.generator,
  /hoursBetween\(shift\.clock_in, shift\.clock_out\)/,
  "Monthly payroll effective worked time",
);
requireMatch(
  source.generator,
  /sum \+ Number\(shift\.overtime_minutes \|\| 0\)/,
  "Monthly payroll effective overtime",
);
requireMatch(
  source.generator,
  /classifiedLateShifts[\s\S]*?shift\.late_minutes/,
  "Monthly payroll effective lateness",
);
requireNoMatch(
  source.generator,
  /absence[_A-Za-z]*deduction|missed[_A-Za-z]*shift[_A-Za-z]*deduction|missedShifts\s*\*\s*(?:profile|hourly|salary|rate)/i,
  "Monthly payroll automatic absence deduction",
);

console.log(
  "Workforce attendance correction release audit passed: raw shift and attendance clock evidence is database-immutable, manager corrections are append-only and organization-scoped, raw/effective evidence is visible, payroll consumes the latest approved correction, correction timestamps stale prior payroll calculations, and no automatic absence deduction was introduced.",
);
