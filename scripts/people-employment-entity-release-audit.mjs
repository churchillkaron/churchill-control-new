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
  entityResolver:
    "lib/platform/runtime/resolveActiveLegalEntitySelection.js",
  sessionEntityApi: "app/api/session/entity/route.js",
  sessionBootstrap: "app/api/session/bootstrap/route.js",
  businessContext: "app/providers/BusinessContextProvider.jsx",
  workspaceTopBar: "components/workspace/WorkspaceTopBar.jsx",
  organizationRuntime: "lib/hooks/useOrganizationRuntime.js",
  directoryApi: "app/api/people/directory/route.js",
  compensationApi: "app/api/people/compensation/route.js",
  compensationPage:
    "app/(system)/workspace/[organizationId]/people/compensation/page.jsx",
  readiness: "lib/payroll/readiness/buildPayrollReadiness.js",
  readinessApi: "app/api/payroll/readiness/route.js",
  calculation: "lib/payroll/consolidation/generateMonthlyPayroll.js",
  reconciliation:
    "lib/payroll/consolidation/loadPayrollAttendanceReconciliation.js",
  paymentBatch: "lib/payroll/payments/preparePayrollPaymentBatch.js",
  paymentApi: "app/api/payroll/payments/route.js",
  paymentPage:
    "app/(system)/workspace/[organizationId]/people/payroll/payments/page.jsx",
  previewApi: "app/api/payroll/preview/route.js",
  previewPage:
    "app/(system)/workspace/[organizationId]/people/payroll/preview/page.jsx",
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

const entityResolver = read("entityResolver");
assertContains(
  entityResolver,
  [
    'ACTIVE_ENTITY_COOKIE = "avantiqo_active_entity_id"',
    "readActiveEntityId",
    "loadActiveLegalEntities",
    "resolveActiveLegalEntitySelection",
    'source: "explicit"',
    'source: "session"',
    'source: "default"',
    'source: "single"',
    "multiple active legal entities",
  ],
  "Global legal entity resolver"
);

const sessionEntityApi = read("sessionEntityApi");
assertContains(
  sessionEntityApi,
  [
    'avantiqo_active_entity_id',
    '.from("legal_entities")',
    '.eq("organization_id", context.organizationId)',
    '.eq("is_active", true)',
    "response.cookies.set",
  ],
  "Legal entity session API"
);

const sessionBootstrap = read("sessionBootstrap");
assertContains(
  sessionBootstrap,
  [
    'avantiqo_active_entity_id',
    "entities",
    "is_default_accounting_entity",
  ],
  "Workspace bootstrap legal entity context"
);

const businessContext = read("businessContext");
assertContains(
  businessContext,
  [
    "entities:",
    "data.entities",
    "entity:",
  ],
  "Business context legal entities"
);

const workspaceTopBar = read("workspaceTopBar");
assertContains(
  workspaceTopBar,
  [
    "EntitySelector",
    'fetch("/api/session/entity"',
    "businessContext?.entities",
    "<EntitySelector entity={entity} entities={entities} />",
    "window.location.reload()",
  ],
  "Global Header legal entity selector"
);

const organizationRuntime = read("organizationRuntime");
assertContains(
  organizationRuntime,
  [
    "const entity = context?.entity || null",
    "entity,",
    "entities:",
    "entityId: resolveId(entity",
    "legalEntityId: resolveId(entity",
  ],
  "Organization runtime legal entity context"
);

const directoryApi = read("directoryApi");
assertContains(
  directoryApi,
  [
    "loadEmployeeDirectoryWithEmployment",
    "createEmployeeWithEmployment",
    "setEmployeeActiveWithEmployment",
    'ACTIVE_ENTITY_COOKIE = "avantiqo_active_entity_id"',
    "resolveEntityId(request",
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

const compensationPage = read("compensationPage");
assertContains(
  compensationPage,
  [
    "useOrganizationRuntime",
    "runtime.entityId",
    "/api/people/compensation?entityId=",
    "entityId,",
    "selected payroll legal entity",
  ],
  "Compensation active entity UI"
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

const readinessApi = read("readinessApi");
assertContains(
  readinessApi,
  [
    "resolveActiveLegalEntitySelection",
    'url.searchParams.get("entityId")',
    "entityId: requestedEntityId",
    "entityId: entity.id",
  ],
  "Payroll readiness active entity boundary"
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
    "resolveActiveLegalEntitySelection",
    'url.searchParams.get("entityId")',
    "entityId: requestedEntityId",
    "matchingPaymentMethods",
    "methodCurrency === entityCurrency",
    "methodCountry === entityCountry",
    "entities,",
    "entityId: body?.entityId || null",
    "entityId: entity.id",
  ],
  "Payroll payment API legal entity selection"
);

const paymentPage = read("paymentPage");
assertContains(
  paymentPage,
  [
    "useOrganizationRuntime",
    "runtime.entityId",
    "/api/payroll/payments?entityId=",
    "entityId,",
  ],
  "Payroll payment active entity UI"
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

const previewPage = read("previewPage");
assertContains(
  previewPage,
  [
    "useOrganizationRuntime",
    "runtime.entityId",
    "entityId,",
  ],
  "Payroll preview active entity UI"
);

const generateApi = read("generateApi");
assertContains(
  generateApi,
  [
    "loadEmploymentCohort",
    "employmentCohort.staffIds",
    '.in("staff_id", employmentCohort.staffIds)',
    "resolveActiveLegalEntitySelection",
    "entityId: body?.entityId || null",
  ],
  "Payroll generation active entity boundary"
);

const governanceApi = read("governanceApi");
assertContains(
  governanceApi,
  [
    "resolveActiveLegalEntitySelection",
    'url.searchParams.get("entityId")',
    '.eq("entity_id", entity.id)',
    "entity,",
    "entities,",
    "record?.entity_id",
    "record.entity_id}:${record.staff_id}:${record.payroll_month}",
    "entityId: record.entity_id",
    "entityId: target.entityId",
    "employmentAssignmentId",
  ],
  "Payroll governance legal entity selection"
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
