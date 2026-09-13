import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  getFinancePermissionGrantById,
  getFinanceRoleAssignmentById,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

const REQUIRED_PERMISSION = "finance.permissions.view";
const text = (value) => String(value ?? "").trim();

export const manifest = defineCapability({
  domain: "finance",
  capability: "finance_access",
  action: "read",
  name: "Read Finance access evidence",
  description: "Read exact Finance role-assignment or permission-grant evidence after a governed security mutation.",
  permissions: [REQUIRED_PERMISSION],
  events: [],
  tags: ["finance", "security", "permissions", "verification"],
  transactional: false,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      assignment_id: { type: "string" },
      permission_grant_id: { type: "string" },
      user_id: { type: "string" },
      role_id: { type: "string" },
      permission_key: { type: "string" },
    },
    additionalProperties: false,
  },
});

export function validate({ context, payload = {} }) {
  if (!text(context?.organizationId)) throw new Error("organization_id required");
  if (!text(payload.assignment_id) && !text(payload.permission_grant_id)) {
    throw new Error("assignment_id or permission_grant_id required");
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}
export async function execute({ context, payload = {} }) {
  const organizationId = text(context.organizationId);

  if (text(payload.assignment_id)) {
    const assignment = await getFinanceRoleAssignmentById({
      organizationId,
      assignmentId: text(payload.assignment_id),
    });
    if (!assignment) throw new Error("Finance role assignment not found");
    return { success: true, assignment, rows: [assignment] };
  }

  const grant = await getFinancePermissionGrantById({
    organizationId,
    permissionGrantId: text(payload.permission_grant_id),
  });
  if (!grant) throw new Error("Finance permission grant not found");
  return { success: true, grant, rows: [grant] };
}

export default { manifest, validate, authorize, execute };
