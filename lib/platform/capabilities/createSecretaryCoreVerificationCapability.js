import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();
const CONFIG = Object.freeze({
  secretary_calendar_event: { table: "secretary_calendar_events", key: "event_id", column: "id" },
  secretary_contact: { table: "secretary_contact_profiles", key: "party_id", column: "party_id" },
  secretary_task: { table: "secretary_tasks", key: "task_id", column: "id" },
  secretary_follow_up: { table: "secretary_follow_ups", key: "follow_up_id", column: "id" },
  secretary_settings: { table: "secretary_settings", key: "organization_id", column: "organization_id" },
  secretary_job_record: { table: "secretary_jobs", key: "job_id", column: "id" },
  secretary_meeting_coordination_record: { table: "secretary_meeting_coordinations", key: "coordination_id", column: "id" },
  secretary_outbound_call_request: { table: "secretary_outbound_call_requests", key: "request_id", column: "id" },
});

export function createSecretaryWorkingPreferenceVerificationCapability() {
  const manifest = defineCapability({
    domain: "platform", capability: "secretary_working_preference_record", action: "read",
    description: "Read one exact persisted Secretary working-preference history event for authoritative mutation verification.",
    permissions: [], events: [], tags: ["platform", "secretary", "verification", "read"], transactional: false, aiEnabled: false,
    operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false, contextScope: "organization", risk: "low",
    inputSchema: { type: "object", required: ["domain", "key", "entry_id"], properties: { domain: { type: "string" }, key: { type: "string" }, entry_id: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    const organizationId = text(context?.organizationId); const domain = text(payload.domain).toUpperCase(); const key = text(payload.key); const entryId = text(payload.entry_id);
    if (!organizationId || !domain || !key || !entryId) throw new Error("SECRETARY_WORKING_PREFERENCE_VERIFICATION_SCOPE_REQUIRED");
    const { data, error } = await supabaseAdmin.from("secretary_settings").select("metadata").eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    const register = data?.metadata?.executive_working_preferences_v1;
    const history = Array.isArray(register?.history) ? register.history : [];
    const event = history.find((item) => text(item?.entry_id) === entryId && text(item?.domain).toUpperCase() === domain && text(item?.key) === key) || null;
    return { contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1", state: event ? "COMPLETED" : "NOT_COMPLETED", authoritative_server_evidence: true, exact_business_scope_matched: true, business_effect_observed: Boolean(event), business_effect_absent: !event, safe_to_retry: !event, record: event, locator_key: "entry_id", locator: entryId };
  }
  return { manifest, execute };
}

export function createSecretaryCoreVerificationCapability(capability) {
  const config = CONFIG[capability];
  if (!config) throw new Error(`SECRETARY_VERIFIER_UNSUPPORTED:${capability}`);
  const manifest = defineCapability({
    domain: "platform", capability, action: "read",
    description: `Read one exact ${capability} record for authoritative Secretary mutation verification.`,
    permissions: [], events: [], tags: ["platform", "secretary", "verification", "read"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, contextScope: "organization", risk: "low",
    inputSchema: { type: "object", required: [config.key], properties: { [config.key]: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    const organizationId = text(context?.organizationId);
    const locator = text(payload[config.key]);
    if (!organizationId || !locator) throw new Error("SECRETARY_VERIFICATION_SCOPE_REQUIRED");
    if (config.key === "organization_id" && locator !== organizationId) throw new Error("SECRETARY_VERIFICATION_SCOPE_MISMATCH");
    let query = supabaseAdmin.from(config.table).select("*").eq("organization_id", organizationId);
    if (config.column !== "organization_id") query = query.eq(config.column, locator);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return {
      contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
      state: data ? "COMPLETED" : "NOT_COMPLETED",
      authoritative_server_evidence: true, exact_business_scope_matched: true,
      business_effect_observed: Boolean(data), business_effect_absent: !data, safe_to_retry: !data,
      record: data || null, locator_key: config.key, locator,
    };
  }
  return { manifest, execute };
}

export default createSecretaryCoreVerificationCapability;
