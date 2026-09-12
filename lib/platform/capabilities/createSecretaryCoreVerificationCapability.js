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

export function createSecretaryImportantDateEventVerificationCapability() {
  const manifest = defineCapability({
    domain: "platform", capability: "secretary_important_date_event", action: "read",
    description: "Read one exact persisted Secretary important-date registration history event for authoritative mutation verification.",
    permissions: [], events: [], tags: ["platform", "secretary", "verification", "read"], transactional: false, aiEnabled: false,
    operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false, contextScope: "organization", risk: "low",
    inputSchema: {
      type: "object",
      required: ["party_id", "date_id", "evidence_id", "payload_sha256"],
      properties: { party_id: { type: "string" }, date_id: { type: "string" }, evidence_id: { type: "string" }, payload_sha256: { type: "string" } },
      additionalProperties: false,
    },
  });
  async function execute({ context, payload = {} }) {
    const organizationId = text(context?.organizationId);
    const partyId = text(payload.party_id);
    const dateId = text(payload.date_id);
    const evidenceId = text(payload.evidence_id);
    const payloadSha = text(payload.payload_sha256);
    if (!organizationId || !partyId || !dateId || !evidenceId || !payloadSha) throw new Error("SECRETARY_IMPORTANT_DATE_VERIFICATION_SCOPE_REQUIRED");
    const { data, error } = await supabaseAdmin.from("secretary_contact_profiles").select("metadata").eq("organization_id", organizationId).eq("party_id", partyId).maybeSingle();
    if (error) throw error;
    const register = data?.metadata?.important_date_stewardship_v1;
    const history = Array.isArray(register?.history) ? register.history : [];
    const event = history.find((item) => text(item?.event) === "IMPORTANT_DATE_REGISTERED" && text(item?.date_id) === dateId && text(item?.evidence_id) === evidenceId && text(item?.payload_sha256) === payloadSha) || null;
    return {
      contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
      state: event ? "COMPLETED" : "NOT_COMPLETED",
      authoritative_server_evidence: true, exact_business_scope_matched: true,
      business_effect_observed: Boolean(event), business_effect_absent: !event, safe_to_retry: !event,
      record: event, locator_key: "date_id", locator: dateId,
    };
  }
  return { manifest, execute };
}

export function createSecretaryTravelDocumentEventVerificationCapability() {
  const manifest = defineCapability({
    domain: "platform", capability: "secretary_travel_document_event", action: "read",
    description: "Read one exact persisted Secretary travel-document readiness history event for authoritative mutation verification.",
    permissions: [], events: [], tags: ["platform", "secretary", "verification", "read"], transactional: false, aiEnabled: false,
    operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false, contextScope: "organization", risk: "low",
    inputSchema: {
      type: "object", required: ["job_id", "event", "evidence_id", "payload_sha256"],
      properties: { job_id: { type: "string" }, event: { type: "string" }, evidence_id: { type: "string" }, payload_sha256: { type: "string" } }, additionalProperties: false,
    },
  });
  async function execute({ context, payload = {} }) {
    const organizationId = text(context?.organizationId);
    const jobId = text(payload.job_id);
    const eventName = text(payload.event);
    const evidenceId = text(payload.evidence_id);
    const payloadSha = text(payload.payload_sha256);
    if (!organizationId || !jobId || !eventName || !evidenceId || !payloadSha) throw new Error("SECRETARY_TRAVEL_DOCUMENT_EVENT_VERIFICATION_SCOPE_REQUIRED");
    const { data, error } = await supabaseAdmin.from("secretary_jobs").select("metadata").eq("organization_id", organizationId).eq("id", jobId).maybeSingle();
    if (error) throw error;
    if (!data) {
      return { contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1", state: "UNCERTAIN", authoritative_server_evidence: true, exact_business_scope_matched: true, business_effect_observed: false, business_effect_absent: false, safe_to_retry: false, record: null, locator_key: "job_id", locator: jobId };
    }
    const ledger = data?.metadata?.travel_document_readiness_v1;
    const history = Array.isArray(ledger?.history) ? ledger.history : [];
    const exact = history.find((item) => text(item?.event) === eventName && text(item?.evidence_id) === evidenceId && text(item?.payload_sha256) === payloadSha) || null;
    const conflictingEvidence = history.find((item) => text(item?.evidence_id) === evidenceId && (text(item?.event) !== eventName || text(item?.payload_sha256) !== payloadSha)) || null;
    const historyMayBeTruncated = history.length >= 500;
    const definitelyAbsent = !exact && !conflictingEvidence && !historyMayBeTruncated;
    return {
      contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
      state: exact ? "COMPLETED" : definitelyAbsent ? "NOT_COMPLETED" : "UNCERTAIN",
      authoritative_server_evidence: true, exact_business_scope_matched: true,
      business_effect_observed: Boolean(exact), business_effect_absent: definitelyAbsent, safe_to_retry: definitelyAbsent,
      record: exact, conflicting_record: conflictingEvidence, history_may_be_truncated: historyMayBeTruncated, locator_key: "job_id", locator: jobId,
    };
  }
  return { manifest, execute };
}

export function createSecretaryCalendarProtectionVerificationCapability() {
  const manifest = defineCapability({
    domain: "platform", capability: "secretary_calendar_protection", action: "read",
    description: "Read one exact Secretary calendar protection by its deterministic protection key for authoritative mutation verification.",
    permissions: [], events: [], tags: ["platform", "secretary", "verification", "calendar", "read"], transactional: false, aiEnabled: false,
    operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false, contextScope: "organization", risk: "low",
    inputSchema: { type: "object", required: ["owner_party_id", "protection_key", "evidence_id"], properties: { owner_party_id: { type: "string" }, protection_key: { type: "string" }, evidence_id: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    const organizationId = text(context?.organizationId);
    const ownerPartyId = text(payload.owner_party_id);
    const protectionKey = text(payload.protection_key);
    const evidenceId = text(payload.evidence_id);
    if (!organizationId || !ownerPartyId || !protectionKey || !evidenceId) throw new Error("SECRETARY_CALENDAR_PROTECTION_VERIFICATION_SCOPE_REQUIRED");
    const { data, error } = await supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("owner_party_id", ownerPartyId)
      .eq("source", "secretary_calendar_stewardship")
      .contains("metadata", { secretary_calendar_stewardship: true, protection_key: protectionKey, evidence_id: evidenceId })
      .limit(2);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const exact = rows.length === 1 ? rows[0] : null;
    const definitelyAbsent = rows.length === 0;
    return {
      contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
      state: exact ? "COMPLETED" : definitelyAbsent ? "NOT_COMPLETED" : "UNCERTAIN",
      authoritative_server_evidence: true, exact_business_scope_matched: true,
      business_effect_observed: Boolean(exact), business_effect_absent: definitelyAbsent, safe_to_retry: definitelyAbsent,
      record: exact, duplicate_match_count: rows.length > 1 ? rows.length : 0, locator_key: "protection_key", locator: protectionKey,
    };
  }
  return { manifest, execute };
}

export function createSecretaryCalendarProtectionReleaseVerificationCapability() {
  const manifest = defineCapability({
    domain: "platform", capability: "secretary_calendar_protection_release", action: "read",
    description: "Verify one exact Secretary calendar protection release from persisted release evidence.",
    permissions: [], events: [], tags: ["platform", "secretary", "verification", "calendar", "read"], transactional: false, aiEnabled: false,
    operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false, contextScope: "organization", risk: "low",
    inputSchema: { type: "object", required: ["event_id", "evidence_id", "released_at"], properties: { event_id: { type: "string" }, evidence_id: { type: "string" }, released_at: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    const organizationId = text(context?.organizationId);
    const eventId = text(payload.event_id);
    const evidenceId = text(payload.evidence_id);
    const releasedAt = text(payload.released_at);
    if (!organizationId || !eventId || !evidenceId || !releasedAt) throw new Error("SECRETARY_CALENDAR_PROTECTION_RELEASE_VERIFICATION_SCOPE_REQUIRED");
    const { data, error } = await supabaseAdmin.from("secretary_calendar_events").select("*").eq("organization_id", organizationId).eq("id", eventId).maybeSingle();
    if (error) throw error;
    if (!data) {
      return { contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1", state: "UNCERTAIN", authoritative_server_evidence: true, exact_business_scope_matched: true, business_effect_observed: false, business_effect_absent: false, safe_to_retry: false, record: null, locator_key: "event_id", locator: eventId };
    }
    const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata : {};
    const isProtection = data.source === "secretary_calendar_stewardship" && data.event_type === "BLOCK" && metadata.secretary_calendar_stewardship === true;
    const exact = isProtection && data.status === "CANCELLED" && text(metadata.release_evidence_id) === evidenceId && text(metadata.released_at) === releasedAt;
    const conflictingRelease = isProtection && data.status === "CANCELLED" && !exact;
    const definitelyAbsent = isProtection && data.status !== "CANCELLED";
    return {
      contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
      state: exact ? "COMPLETED" : definitelyAbsent ? "NOT_COMPLETED" : "UNCERTAIN",
      authoritative_server_evidence: true, exact_business_scope_matched: isProtection,
      business_effect_observed: exact, business_effect_absent: definitelyAbsent, safe_to_retry: definitelyAbsent,
      record: data, conflicting_release: conflictingRelease, locator_key: "event_id", locator: eventId,
    };
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
