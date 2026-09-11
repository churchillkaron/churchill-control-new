import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, maximum = 4000) { return String(value ?? "").trim().slice(0, maximum); }
function date(value) { const v = text(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }

export function createProjectsCreateCapability() {
  const manifest = defineCapability({
    domain: "projects", capability: "projects", action: "create",
    description: "Create an entity-scoped business project using the canonical Projects table.",
    permissions: [], events: ["projects.project.created"], tags: ["projects", "project", "create"],
    transactional: true, aiEnabled: false, operatorEnabled: true, operatorMode: "write",
    operatorAutoExecute: false, operatorRequiresConfirmation: true, risk: "medium", contextScope: "entity",
    operatorVerification: { capability_key: "projects.projects.read", payload_from_result: { project_id: ["project.id"] }, derivation: "declared_result_bound_record_verifier" },
    inputSchema: {
      type: "object", required: ["code", "name"],
      properties: { code: { type: "string" }, name: { type: "string" }, description: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" } },
      additionalProperties: false,
    },
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("PROJECT_CALLER_REQUEST_REQUIRED");
    if (!text(context.entityId, 160)) throw new Error("PROJECT_ENTITY_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "PROJECT_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    if (text(access.user?.id,160) !== text(context.actor?.id,160)) { const error = new Error("PROJECT_ACTOR_MISMATCH"); error.status = 403; throw error; }
    const code = text(payload.code,160); const name = text(payload.name,500);
    if (!code || !name) throw new Error("PROJECT_CODE_AND_NAME_REQUIRED");
    const result = await supabaseAdmin.rpc("create_project_atomic", {
      p_organization_id: context.organizationId, p_entity_id: context.entityId, p_code: code, p_name: name,
      p_description: text(payload.description,4000) || null, p_start_date: date(payload.start_date), p_end_date: date(payload.end_date),
    });
    if (result.error) throw result.error;
    return { success: true, ...result.data };
  }
  return { manifest, execute };
}

export default createProjectsCreateCapability;
