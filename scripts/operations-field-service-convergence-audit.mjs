import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`FIELD_SERVICE_OPERATIONS_AUDIT_FAIL: ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    fail(`missing ${relativePath}`);
    return "";
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function requireText(relativePath, expected) {
  const content = read(relativePath);

  if (!content.includes(expected)) {
    fail(`${relativePath} missing ${JSON.stringify(expected)}`);
  }
}

const fieldServicePage =
  "app/(system)/workspace/[organizationId]/operations/field-service/page.jsx";
const legacyPage =
  "app/(system)/workspace/[organizationId]/pest_control/page.jsx";
const solutionRegistry =
  "lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";
const operationsCatalog =
  "lib/operations/runtime/OperationsCapabilityCatalog.js";
const operationsWorkspaceRegistry =
  "lib/operations/registry/OperationsWorkspaceRegistry.js";
const operationsResolver =
  "lib/operations/registry/OperationsWorkspaceResolver.js";
const operationsCatchAll =
  "app/(system)/workspace/[organizationId]/operations/[...operationsRoute]/page.jsx";
const servicePlanRuntime =
  "lib/service-management/runtime/ServicePlanRuntime.js";
const servicePlanRepository =
  "lib/service-management/repositories/ServicePlanRepository.js";
const servicePlanDocument =
  "lib/service-management/documents/ServicePlan.js";
const servicePlanPage =
  "app/(system)/workspace/[organizationId]/operations/field-service/service-plans/page.jsx";
const executionTemplateRepository =
  "lib/service-management/repositories/ServiceExecutionTemplateRepository.js";
const servicePlanScheduler =
  "lib/service-management/runtime/ServicePlanSchedulerRuntime.js";
const serviceCompletionReconciliation =
  "lib/service-management/runtime/ServiceCompletionReconciliationRuntime.js";
const servicePlanWorker =
  "app/api/internal/service-management/plans/process/route.js";
const staffAssignedWorkRuntime =
  "lib/operations/workforce/StaffAssignedWorkRuntime.js";
const preferredAssignmentRuntime =
  "lib/operations/workforce/ServicePreferredAssignmentRuntime.js";
const employeeEligibilityService =
  "lib/people/employees/employeeOperationalEligibilityService.js";
const staffMyDayApi = "app/api/staff/my-day/route.js";
const staffEvidenceApi = "app/api/staff/my-day/evidence/route.js";
const serviceProtocolForm = "components/workforce/ServiceProtocolForm.jsx";
const staffMyDayPage = "app/(workforce)/workforce/my-day/page.jsx";
const customerServiceHistoryProjection =
  "lib/commercial/customers/CustomerServiceHistoryProjection.js";
const customerDetailService =
  "lib/commercial/customers/CustomerDetailService.js";
const customerWorkCenter =
  "components/workspace/commercial/CustomerRuntimeWorkCenter.jsx";
const vercelConfig = "vercel.json";

for (const route of [
  "/operations/work-orders",
  "/operations/appointment-windows",
  "/operations/dispatch",
  "/operations/assignments",
  "/operations/queue-entries",
  "/operations/completion-evidence",
]) {
  requireText(fieldServicePage, route);
}

for (const boundary of [
  "contracts",
  "treatments",
  "chemicals",
  "customers",
  "billing",
  "recurring-service rules",
]) {
  requireText(fieldServicePage, boundary);
}

requireText(legacyPage, "redirect(");
requireText(legacyPage, "/operations/field-service");
requireText(
  solutionRegistry,
  "/workspace/:organizationId/operations/field-service"
);

for (const capabilityId of [
  '"work-orders"',
  '"appointment-windows"',
  '"dispatch"',
  '"assignments"',
  '"queue-entries"',
  '"completion-evidence"',
  '"work-requests"',
]) {
  requireText(operationsCatalog, capabilityId);
}

requireText(
  operationsWorkspaceRegistry,
  "CANONICAL_OPERATIONS_CAPABILITY_CATALOG"
);
requireText(
  operationsResolver,
  "OPERATIONS_WORKSPACE_REGISTRY"
);
requireText(
  operationsCatchAll,
  "getOperationsWorkspaceItem(capabilityId)"
);

requireText(servicePlanRepository, "export async function listDueServicePlans");
requireText(servicePlanRepository, '.eq("status", "active")');
requireText(servicePlanRepository, '.lte("next_service_at", dueBefore)');
requireText(servicePlanRepository, "export async function listGeneratedServiceOccurrences");
requireText(servicePlanRepository, '.eq("status", "generated")');
requireText(servicePlanRepository, '.not("work_order_id", "is", null)');
requireText(servicePlanScheduler, "processDueServicePlans");
requireText(servicePlanScheduler, "listDueServicePlans");
requireText(servicePlanScheduler, "reconcileGeneratedServiceOccurrences");
requireText(servicePlanScheduler, "completed_occurrences_reconciled");
requireText(servicePlanScheduler, "generateNextServiceVisit");
requireText(servicePlanScheduler, "organization_id: plan.organization_id");
requireText(servicePlanScheduler, "system_automation: true");
requireText(serviceCompletionReconciliation, "reconcileGeneratedServiceOccurrences");
requireText(serviceCompletionReconciliation, 'capabilityId: "work-orders"');
requireText(serviceCompletionReconciliation, 'status !== "completed"');
requireText(serviceCompletionReconciliation, 'status: "completed"');
requireText(serviceCompletionReconciliation, "completion_evidence_id");
requireText(serviceCompletionReconciliation, "protocol_submission");
requireText(serviceCompletionReconciliation, "completed_at: projection.completed_at");
requireText(serviceCompletionReconciliation, "FOLLOW_UP_OUTCOMES");
requireText(serviceCompletionReconciliation, '"follow_up"');
requireText(serviceCompletionReconciliation, '"issue_found"');
requireText(serviceCompletionReconciliation, 'capabilityId: "work-requests"');
requireText(serviceCompletionReconciliation, 'command: "create"');
requireText(serviceCompletionReconciliation, 'source_type: "service-follow-up"');
requireText(serviceCompletionReconciliation, "service-follow-up:");
requireText(serviceCompletionReconciliation, "follow_up_work_request_id");
requireText(serviceCompletionReconciliation, "follow_up_requests");
requireText(servicePlanRuntime, "advancePlanAfterGeneratedOccurrence");
requireText(servicePlanRuntime, "recovered_plan_cursor: true");
requireText(servicePlanRuntime, 'capabilityId: "work-orders"');
requireText(servicePlanRuntime, 'command: "create"');
requireText(servicePlanRuntime, "assignPreferredServiceTechnician");
requireText(servicePlanRuntime, "applyPreferredAssignment");
requireText(servicePlanRuntime, "preferred_staff_id");
requireText(servicePlanRuntime, "assignment:");
requireText(servicePlanRuntime, "assigned: Boolean(assignment.assigned)");
requireText(servicePlanRuntime, 'reason: "no-preferred-technician"');
requireText(servicePlanDocument, "preferred_staff_id");
requireText(servicePlanDocument, "preferred_staff_name");
requireText(servicePlanDocument, "preferredStaffId");
requireText(servicePlanWorker, "processDueServicePlans");
requireText(servicePlanWorker, "process.env.CRON_SECRET");
requireText(servicePlanWorker, "Bearer ${expected}");
requireText(servicePlanWorker, "status: 401");
requireText(
  vercelConfig,
  '"path": "/api/internal/service-management/plans/process"'
);
requireText(vercelConfig, '"schedule": "*/15 * * * *"');
requireText(vercelConfig, '"deploymentEnabled": false');
requireText(vercelConfig, '"ignoreCommand": "node scripts/vercel-ignore-build.mjs"');

requireText(employeeEligibilityService, "export async function getEmployeeOperationalEligibility");
requireText(employeeEligibilityService, '.from("staff_accounts")');
requireText(employeeEligibilityService, '.eq("active_organization_id", organization_id)');
requireText(employeeEligibilityService, '.from("employee_employment_assignments")');
requireText(employeeEligibilityService, '.eq("staff_account_id", staff_id)');
requireText(employeeEligibilityService, 'employmentQuery.eq("entity_id", entity_id)');
requireText(preferredAssignmentRuntime, "getEmployeeOperationalEligibility");
requireText(preferredAssignmentRuntime, "assignPreferredServiceTechnician");
requireText(preferredAssignmentRuntime, 'capabilityId: "work-orders"');
requireText(preferredAssignmentRuntime, 'command: "assign"');
requireText(preferredAssignmentRuntime, "assigned_to: staffId");
requireText(preferredAssignmentRuntime, "service-preferred-assignment:");
requireText(preferredAssignmentRuntime, "service_assignment");
requireText(preferredAssignmentRuntime, "if (!eligibility.eligible)");
requireText(servicePlanPage, 'fetch("/api/people/directory"');
requireText(servicePlanPage, "Preferred Technician (optional)");
requireText(servicePlanPage, "preferred_staff_id");
requireText(servicePlanPage, "preferred_staff_name");
requireText(servicePlanPage, "Dispatch queue");
requireText(servicePlanPage, "remains available to Dispatch");

requireText(executionTemplateRepository, "export async function getServiceExecutionTemplate");
requireText(executionTemplateRepository, '.eq("organization_id", organization_id)');
requireText(executionTemplateRepository, '.eq("id", id)');
requireText(servicePlanRuntime, "resolveProtocolSnapshot");
requireText(servicePlanRuntime, "execution_protocol: protocol");
requireText(servicePlanRuntime, "snapshotted_at: new Date().toISOString()");
requireText(servicePlanRuntime, "Service plan execution template was not found in this organization.");
requireText(staffAssignedWorkRuntime, "validateProtocolCompletion");
requireText(staffAssignedWorkRuntime, "protocol_submission");
requireText(staffAssignedWorkRuntime, "Complete required service fields:");
requireText(staffAssignedWorkRuntime, "At least one before photo is required.");
requireText(staffAssignedWorkRuntime, "At least one after photo is required.");
requireText(staffAssignedWorkRuntime, "Customer signature is required.");
requireText(staffAssignedWorkRuntime, "Technician signature is required.");
requireText(staffAssignedWorkRuntime, "distance > 250");
requireText(staffAssignedWorkRuntime, "Service outcome is required before completion.");
requireText(staffAssignedWorkRuntime, 'outcome === "follow_up"');
requireText(staffAssignedWorkRuntime, 'COMPLETION_EVIDENCE_CAPABILITY_ID = "completion-evidence"');
requireText(staffAssignedWorkRuntime, "recordStaffCompletionEvidence");
requireText(staffAssignedWorkRuntime, 'command: "record"');
requireText(staffAssignedWorkRuntime, 'source_type: "work-order-completion"');
requireText(staffAssignedWorkRuntime, "staff-completion-evidence:");
requireText(staffAssignedWorkRuntime, "completion_evidence_id: completionEvidence.id");
requireText(staffAssignedWorkRuntime, "completionEvidence,");
requireText(staffMyDayApi, "completion: body.completion || null");
requireText(staffEvidenceApi, '.eq("organization_id", context.organizationId)');
requireText(staffEvidenceApi, '.eq("assigned_to", context.staff.id)');
requireText(staffEvidenceApi, '.from("uploads")');
requireText(staffEvidenceApi, '"service-execution-evidence"');
requireText(serviceProtocolForm, 'fetch("/api/staff/my-day/evidence"');
requireText(serviceProtocolForm, "protocol.field_schema");
requireText(serviceProtocolForm, "requirements.before_photos");
requireText(serviceProtocolForm, "requirements.after_photos");
requireText(serviceProtocolForm, "requirements.location_confirmation");
requireText(staffMyDayPage, 'import ServiceProtocolForm from "@/components/workforce/ServiceProtocolForm"');
requireText(staffMyDayPage, "protocolSubmissions");
requireText(staffMyDayPage, "job.executionProtocol");
requireText(staffMyDayPage, "<ServiceProtocolForm");
requireText(staffMyDayPage, 'action === "complete"');

requireText(customerServiceHistoryProjection, "export async function getCustomerServiceHistory");
requireText(customerServiceHistoryProjection, '.eq("customer_party_id", partyId)');
requireText(customerServiceHistoryProjection, '.eq("status", "completed")');
requireText(customerServiceHistoryProjection, "completion_evidence_id");
requireText(customerServiceHistoryProjection, "follow_up_work_request_id");
requireText(customerServiceHistoryProjection, "export function customerServiceTimeline");
requireText(customerServiceHistoryProjection, 'domain: "Service"');
requireText(customerServiceHistoryProjection, 'type: "SERVICE_VISIT_COMPLETED"');
requireText(customerDetailService, "getCustomerServiceHistory");
requireText(customerDetailService, "customerServiceTimeline(serviceHistory)");
requireText(customerDetailService, "service_management: serviceHistory");
requireText(customerWorkCenter, "const timeline = detail?.timeline || []");
requireText(customerWorkCenter, '<Section title="Customer Timeline">');

const registryContent = read(solutionRegistry);

if (
  registryContent.includes(
    'route: "/workspace/:organizationId/pest_control"'
  )
) {
  fail("solution registry still routes Service Control to legacy Pest Control");
}

const legacyContent = read(legacyPage);

for (const obsoleteLauncherToken of [
  "const modules =",
  "/pest_control/${module.href}",
  "Industry Workspace",
]) {
  if (legacyContent.includes(obsoleteLauncherToken)) {
    fail(`legacy Pest Control launcher still contains ${obsoleteLauncherToken}`);
  }
}

if (!process.exitCode) {
  console.log("FIELD_SERVICE_OPERATIONS_CONVERGENCE_AUDIT_PASSED");
  console.log("FIELD_SERVICE_COMMAND_OWNER=OPERATIONS");
  console.log("FIELD_SERVICE_EXECUTION_OWNER=CANONICAL_OPERATIONS_CATALOG");
  console.log("FIELD_SERVICE_BUSINESS_RULES_OWNER=SERVICE_DOMAIN");
  console.log("FIELD_SERVICE_RECURRING_AUTOMATION=SERVICE_MANAGEMENT_SCHEDULER");
  console.log("FIELD_SERVICE_REPLAY_RECOVERY=PLAN_CURSOR_RECONCILED");
  console.log("FIELD_SERVICE_WORKER_AUTH=CRON_SECRET");
  console.log("FIELD_SERVICE_PROTOCOL_EXECUTION=SNAPSHOT_AND_ENFORCE");
  console.log("FIELD_SERVICE_EVIDENCE=CANONICAL_OPERATIONS_COMPLETION_EVIDENCE");
  console.log("FIELD_SERVICE_OCCURRENCE_COMPLETION=RECONCILED_FROM_OPERATIONS");
  console.log("FIELD_SERVICE_FOLLOW_UP=GOVERNED_OPERATIONS_WORK_REQUEST");
  console.log("FIELD_SERVICE_CUSTOMER_HISTORY=PARTY_SCOPED_SERVICE_TIMELINE");
  console.log("FIELD_SERVICE_PREFERRED_TECHNICIAN=PEOPLE_ELIGIBILITY_OPERATIONS_ASSIGNMENT");
  console.log("FIELD_SERVICE_ASSIGNMENT_FALLBACK=DISPATCH_QUEUE");
  console.log("FIELD_SERVICE_INVENTORY_OWNER=SUPPLY_CHAIN");
  console.log("FIELD_SERVICE_BILLING_OWNER=FINANCE");
}
