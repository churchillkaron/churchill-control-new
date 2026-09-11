import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","MANAGER","HR_ADMIN"]);
const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);

export function createPeopleEmployeeVerificationReadCapability() {
  const manifest = defineCapability({
    domain: "people", capability: "employees", action: "read",
    description: "Read one exact employee and current entity employment assignment for deterministic post-action verification.",
    permissions: [], events: [], tags: ["people", "employees", "employment", "read", "verification"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope: "entity",
    inputSchema: { type: "object", required: ["staff_id"], properties: { staff_id: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("PEOPLE_EMPLOYEE_READ_CALLER_REQUEST_REQUIRED");
    const auth = await resolveAuthenticatedStaffContext({ request: context.callerRequest });
    if (!auth?.success || text(auth.organizationId, 160) !== text(context.organizationId, 160)) throw new Error("PEOPLE_EMPLOYEE_READ_ACCESS_REQUIRED");
    if (!MANAGE_ROLES.has(text(auth.role || auth.staff?.role, 80).toUpperCase())) throw new Error("PEOPLE_EMPLOYEE_MANAGEMENT_PERMISSION_REQUIRED");
    const staffId = text(payload.staff_id, 160); const entityId = text(context.entityId, 160);
    if (!staffId || !entityId) throw new Error("PEOPLE_EMPLOYEE_READ_SCOPE_REQUIRED");
    const [staffResult, employmentResult] = await Promise.all([
      supabaseAdmin.from("staff_accounts").select("*").eq("organization_id", context.organizationId).eq("id", staffId).maybeSingle(),
      supabaseAdmin.from("employee_employment_assignments").select("*").eq("organization_id", context.organizationId).eq("entity_id", entityId).eq("staff_id", staffId).is("effective_to", null).maybeSingle(),
    ]);
    if (staffResult.error) throw staffResult.error; if (employmentResult.error) throw employmentResult.error;
    if (!staffResult.data || !employmentResult.data) { const error = new Error("EMPLOYEE_OR_EMPLOYMENT_NOT_FOUND"); error.status = 404; throw error; }
    return { success: true, employee: staffResult.data, employment: employmentResult.data, staff_id: staffResult.data.id };
  }
  return { manifest, execute };
}
export default createPeopleEmployeeVerificationReadCapability;
