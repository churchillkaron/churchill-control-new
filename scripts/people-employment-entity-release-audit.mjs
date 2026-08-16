import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  migration:
    "supabase/migrations/20260816050136_people_employment_entity_convergence.sql",
  employmentService:
    "lib/people/employees/employmentAssignmentService.js",
  lifecycleService:
    "lib/people/employees/employeeEmploymentLifecycleService.js",
  directoryApi: "app/api/people/directory/route.js",
  compensationApi: "app/api/people/compensation/route.js",
  readiness: "lib/payroll/readiness/buildPayrollReadiness.js",
  calculation: "lib/payroll/consolidation/generateMonthlyPayroll.js",
  reconciliation:
    "lib/payroll/consolidation/loadPayrollAttendanceReconciliation.js",
  paymentBatch: "lib/payroll/payments/preparePayrollPaymentBatch.js",
  paymentApi: "app/api/payroll/payments/route.js",
  previewApi: "app/api/payroll/preview/route.js",
  generateApi: "app/api/payroll/generate/route.js",
  governanceApi: "app/api/payroll/governance/route.js",
  payrollControl:
    "app/(system)/workspace/[organizationId]/people/payroll/page.jsx",
  payrollSetup:
    "app/(system)/workspace/[organizationId]/administration/onboarding/payroll/page.jsx",
};

function read(key) {
  const file = path.join(root, files[key]);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required People employment file: ${files[key]}`);
  }
  return fs.readFileSync(file, "utf8");
}

function assertContains(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${label} missing required contract: ${value}`);
    }
  }
}

function assertNotContains(source, values, label) {
  for (const value of values) {
    if (source.includes(value)) {
      throw new Error(`${label} contains forbidden contract: ${value}`);
    }
  }
}

const migration = read("migration");
assertContains(
  migration,
  [
    "create table if not exists public.employee_employment_assignments",
    "prevent_employee_employment_assignment_overlap",
    "assign_employee_employment_entity_atomic",
    "end_employee_employment_assignment_atomic",
    "alter table public.employee_employment_assignments enable row level security",
    "revoke insert, update, delete on public.employee_employment_assignments from anon, authenticated",
    "grant select, insert, update on public.employee_employment_assignments to service_role",
    "security invoker",
    "COMPENSATION_BACKFILL",
  ],
  "Employment migration"
);
assertNotContains(migration, ["security definer"], "Employment migration");

const employmentService = read("employmentService");
assertContains(
  employmentService,
  [
    "loadEmploymentAssignmentsForPeriod",
    "loadEmploymentCohort",
    "fullPeriodStaffIds",
    "partialPeriodStaffIds",
    "assign_employee_employment_entity_atomic",
    "end_employee_employment_assignment_atomic",
  ],
  "Employment service"
);

const lifecycleService = read("lifecycleService");
assertContains(
  lifecycleService,
  [
    "loadEmployeeDirectoryWithEmployment",
    "createEmployeeWithEmployment",
    "setEmployeeActiveWithEmployment",
    "transferEmployeeLegalEntity",
    "multiple active legal entities",
    "first day of a month",
  ],
  "Employee lifecycle"
);

const directoryApi = read("directoryApi");
assertContains(
  directoryApi,
  [
    "loadEmployeeDirectoryWithEmployment",
    "createEmployeeWithEmployment",
    "setEmployeeActiveWithEmployment",
    'action === "transfer_entity"',
  ],
  "Employee Directory API"
);

const compensationApi = read("compensationApi");
assertContains(
  compensationApi,
  [
    "loadEmploymentCohort",
    "loadEmploymentAssignmentsForPeriod",
    "assertEmploymentAssignment",
    "EMPLOYMENT_ASSIGNMENT_REQUIRED",
    "employmentCohort.staff",
  ],
  "Compensation API"
);

const readiness = read("readiness");
assertContains(
  readiness,
  [
    "loadEmploymentCohort",
    "employmentCohort.staff",
    "employmentCohort.assignments",
    "partialPeriodStaffIds",
    "EMPLOYMENT_PERIOD_UNSUPPORTED",
    "method.country",
    "method.currency",
  ],
  "Payroll readiness"
);
assertNotContains(
  readiness,
  [
    '.from("staff_accounts")\n      .select("id,name,email,role,department,position,party_id")\n      .eq("active_organization_id", organizationId)',
  ],
  "Payroll readiness"
);

const calculation = read("calculation");
assertContains(
  calculation,
  [
    "loadEmploymentCohort",
    "full-month legal-entity employment assignments",
    "entityStaffIds.has",
    '.from("orders")',
    '.eq("entity_id", entityId)',
  ],
  "Payroll calculation"
);

const reconciliation = read("reconciliation");
assertContains(
  reconciliation,
  [
    "loadEmploymentAssignmentsForPeriod",
    "full-month legal-employer assignment",
    "employmentAssignments.flatMap",
    "assignment.updated_at",
    "employmentAssignmentId",
  ],
  "Payroll attendance reconciliation"
);

const paymentBatch = read("paymentBatch");
assertContains(
  paymentBatch,
  [
    '.from("legal_entities")',
    '.eq("id", entityId)',
    '.eq("organization_id", organizationId)',
    '.eq("is_active", true)',
    '.from("organization_payment_config")',
    "configCurrency === currency",
    "configCountry === country",
    "legal entity jurisdiction",
  ],
  "Payroll payment batch"
);

const paymentApi = read("paymentApi");
assertContains(
  paymentApi,
  [
    "loadActiveEntities",
    "requestedEntityId",
    'url.searchParams.get("entityId")',
    "entities.find((item) => item.id === requested)",
    "multiple active legal entities",
    "matchingPaymentMethods",
    "methodCurrency === entityCurrency",
    "methodCountry === entityCountry",
    "entities,",
    "requestedEntityId: body?.entityId || null",
    "entityId: entity.id",
  ],
  "Payroll payment API legal entity selection"
);

const previewApi = read("previewApi");
assertContains(
  previewApi,
  [
    "loadEmploymentCohort",
    "employmentCohort.staffIds",
    '.in("staff_id", employmentCohort.staffIds)',
  ],
  "Payroll preview API"
);

const generateApi = read("generateApi");
assertContains(
  generateApi,
  [
    "loadEmploymentCohort",
    "employmentCohort.staffIds",
    '.in("staff_id", employmentCohort.staffIds)',
  ],
  "Payroll generation API"
);

const governanceApi = read("governanceApi");
assertContains(
  governanceApi,
  [
    "record?.entity_id",
    "record.entity_id}:${record.staff_id}:${record.payroll_month}",
    "entityId: record.entity_id",
    "entityId: target.entityId",
    "employmentAssignmentId",
  ],
  "Payroll governance reconciliation"
);

const payrollControl = read("payrollControl");
assertContains(
  payrollControl,
  [
    "EMPLOYMENT_PERIOD_UNSUPPORTED",
    "Review legal employer",
    'peopleRoute(organizationId, "/directory")',
    "legal-employer scope",
  ],
  "Payroll Control legal employer remediation"
);

const payrollSetup = read("payrollSetup");
assertContains(
  payrollSetup,
  [
    "readiness.lifecycleBlockers",
    "requiredBlockers",
    "EMPLOYMENT_PERIOD_UNSUPPORTED",
    "Review legal employer",
    "BANK_DETAILS_MISSING",
    "ACCOUNTING_PERIOD_NOT_OPEN",
    "PAYROLL_POSTING_RULES_MISSING",
    "Payment Readiness",
    'peopleRoute(organizationId, "/directory")',
    'peopleRoute(organizationId, "/payroll/payments")',
    'financeRoute(organizationId, "/fiscal-periods")',
    'financeRoute(organizationId, "/posting-rules")',
  ],
  "Payroll Setup lifecycle visibility"
);

console.log("PEOPLE EMPLOYMENT ENTITY RELEASE AUDIT PASSED");
