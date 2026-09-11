import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);

export function createProjectVerificationReadCapability() {
  const manifest = defineCapability({
    domain: "projects", capability: "projects", action: "read",
    description: "Read one exact entity-scoped project for deterministic post-action verification.",
    permissions: [], events: [], tags: ["projects", "project", "read", "verification"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope: "entity",
    inputSchema: { type: "object", required: ["project_id"], properties: { project_id: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("PROJECT_READ_CALLER_REQUEST_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "PROJECT_READ_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    const projectId = text(payload.project_id, 160);
    if (!projectId || !text(context.entityId, 160)) throw new Error("PROJECT_READ_SCOPE_REQUIRED");
    const result = await supabaseAdmin.from("projects").select("*")
      .eq("organization_id", access.organizationId).eq("entity_id", context.entityId).eq("id", projectId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) { const error = new Error("PROJECT_NOT_FOUND"); error.status = 404; throw error; }
    return { success: true, project: result.data, project_id: result.data.id };
  }
  return { manifest, execute };
}
export default createProjectVerificationReadCapability;
