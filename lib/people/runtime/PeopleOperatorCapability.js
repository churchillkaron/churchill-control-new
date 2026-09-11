import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { createEmployeeWithEmployment } from "@/lib/people/employees/employeeEmploymentLifecycleService";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

const MANAGE_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","MANAGER","HR_ADMIN"]);
function text(value, maximum = 4000) { return String(value ?? "").trim().slice(0, maximum); }
function role(value) { return text(value, 80).toUpperCase(); }
function date(value) { const v = text(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }

export function createPeopleEmployeeCreateCapability() {
  const manifest = defineCapability({
    domain: "people", capability: "employees", action: "create",
    description: "Create an employee directory record with an entity-scoped legal-employer assignment. Does not provision portal access, authentication, payroll or compensation.",
    permissions: [], events: ["people.employee.created"], tags: ["people","employee","directory","employment"],
    transactional: true, aiEnabled: false, operatorEnabled: true, operatorMode: "write",
    operatorAutoExecute: false, operatorRequiresConfirmation: true, risk: "high", contextScope: "entity",
    operatorVerification: { capability_key: "people.employees.read", payload_from_result: { staff_id: ["employee.id"] }, derivation: "declared_result_bound_record_verifier" },
    inputSchema: {
      type: "object", required: ["name","email"],
      properties: { name: { type: "string" }, email: { type: "string" }, position: { type: "string" }, department: { type: "string" }, effective_from: { type: "string" } },
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("PEOPLE_EMPLOYEE_CALLER_REQUEST_REQUIRED");
    if (!text(context.entityId,160)) throw new Error("PEOPLE_EMPLOYEE_ENTITY_REQUIRED");
    const auth = await resolveAuthenticatedStaffContext({ request: context.callerRequest });
    if (!auth?.success) { const error = new Error(auth?.error || "PEOPLE_EMPLOYEE_ACCESS_REQUIRED"); error.status = auth?.status || 403; throw error; }
    if (text(auth.organizationId,160) !== text(context.organizationId,160)) { const error = new Error("PEOPLE_EMPLOYEE_ORGANIZATION_MISMATCH"); error.status = 403; throw error; }
    if (text(auth.staff?.id,160) !== text(context.actor?.staffId || context.actor?.staff_id || context.actor?.staffAccountId || context.actor?.staff_account_id,160)) { const error = new Error("PEOPLE_EMPLOYEE_ACTOR_MISMATCH"); error.status = 403; throw error; }
    if (!MANAGE_ROLES.has(role(auth.role || auth.staff?.role))) { const error = new Error("PEOPLE_EMPLOYEE_MANAGEMENT_PERMISSION_REQUIRED"); error.status = 403; throw error; }
    const name = text(payload.name,500); const email = text(payload.email,320).toLowerCase();
    if (!name || !email) throw new Error("PEOPLE_EMPLOYEE_NAME_AND_EMAIL_REQUIRED");
    const result = await createEmployeeWithEmployment({
      organizationId: context.organizationId, name, email,
      position: text(payload.position,200) || null, department: text(payload.department,200) || null,
      entityId: context.entityId, effectiveFrom: date(payload.effective_from), actingStaffId: auth.staff.id,
    });
    return { success: true, employee: result.staff, party: result.party, employment: result.employment, entity: result.entity, portal_access_created: false, compensation_created: false };
  }
  return { manifest, execute };
}

export default createPeopleEmployeeCreateCapability;
