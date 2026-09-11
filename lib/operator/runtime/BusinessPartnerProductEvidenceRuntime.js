import { createHmac, createSecretKey, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const BUSINESS_PARTNER_PRODUCT_EVIDENCE_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_PRODUCT_EVIDENCE_V1";

const TABLE = "business_partner_product_evidence";
const LEARNING_ORG_ENV = "AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID";
const ACTIVE_KEY_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const CODE_RE = /^[A-Za-z][A-Za-z0-9._:-]{0,159}$/;

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function code(value, fallback = "unknown") {
  const normalized = text(value, 160).replace(/[^A-Za-z0-9._:-]+/g, "_");
  return CODE_RE.test(normalized) ? normalized : fallback;
}

function authenticityKeyring() {
  const activeId = text(process.env[ACTIVE_KEY_ENV], 80);
  const raw = text(process.env[KEYRING_ENV], 32000);
  if (!activeId || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const keys = new Map();
    for (const [id, value] of Object.entries(parsed)) {
      const keyId = text(id, 80);
      const hex = text(value, 128).toLowerCase();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(keyId)) return null;
      if (!/^(?:[a-f0-9]{64}|[a-f0-9]{128})$/.test(hex)) return null;
      keys.set(keyId, createSecretKey(Buffer.from(hex, "hex")));
    }
    if (!keys.has(activeId)) return null;
    return { active_id: activeId, active_key: keys.get(activeId), keys };
  } catch {
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function evidenceAuthenticityPayload(row = {}) {
  return {
    learning_organization_id: text(row.learning_organization_id, 160),
    source_organization_fingerprint: text(row.source_organization_fingerprint, 64),
    event_fingerprint: text(row.event_fingerprint, 64),
    mission_family: text(row.mission_family, 160),
    knowledge_domain: text(row.knowledge_domain, 160),
    capability_family: text(row.capability_family, 160),
    lifecycle_state: text(row.lifecycle_state, 80),
    friction_class: text(row.friction_class, 120),
    failure_mode_code: text(row.failure_mode_code, 160) || null,
    capability_count: Number(row.capability_count || 0),
    external_wait_used: row.external_wait_used === true,
    recovery_used: row.recovery_used === true,
    business_effect_verified: row.business_effect_verified === true,
    key_id: text(row.key_id, 80),
    observed_at: text(row.observed_at, 80),
  };
}

function evidenceMac(key, row) {
  return createHmac("sha256", key)
    .update(`${BUSINESS_PARTNER_PRODUCT_EVIDENCE_CONTRACT}\u0000row-authenticity\u0000`)
    .update(stableJson(evidenceAuthenticityPayload(row)))
    .digest("hex");
}

function validEvidenceMac(row, keyring) {
  const key = keyring?.keys?.get(text(row.key_id, 80));
  const actual = text(row.evidence_mac, 64).toLowerCase();
  if (!key || !/^[a-f0-9]{64}$/.test(actual)) return false;
  const expected = evidenceMac(key, row);
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function hmac(secret, domain, value) {
  return createHmac("sha256", secret)
    .update(`${BUSINESS_PARTNER_PRODUCT_EVIDENCE_CONTRACT}\u0000${domain}\u0000${text(value, 4000)}`)
    .digest("hex");
}

function capabilityParts(key) {
  const [domain, capability] = text(key, 300).split(".");
  return {
    domain: code(domain, "platform"),
    capability: code(capability, "unknown"),
  };
}

function missionStructure(payload = {}) {
  const steps = list(payload.steps);
  const capabilityKeys = steps.map((step) => text(step?.capability_key, 300)).filter(Boolean);
  const businessKey = capabilityKeys.find((key) => !key.startsWith("platform.")) || capabilityKeys[0] || "platform.operator_mission.execute";
  const parts = capabilityParts(businessKey);
  return {
    mission_family: code(`${parts.domain}.${parts.capability}`, "platform.operator_mission"),
    knowledge_domain: parts.domain,
    capability_family: parts.capability,
    capability_count: new Set(capabilityKeys).size,
    contains_external_wait: steps.some((step) => Boolean(step?.wait_for_external)),
  };
}

function classifyMissionResult(result = {}) {
  const status = text(result.status, 60).toLowerCase();
  const pause = text(result.pause_reason, 60).toLowerCase();
  if (status === "completed") return { lifecycle_state: "COMPLETED", friction_class: "NONE" };
  if (status === "blocked") return { lifecycle_state: "BLOCKED", friction_class: "PRODUCT_OR_RUNTIME_BLOCKER" };
  if (status === "paused" && pause === "verification") return { lifecycle_state: "PAUSED", friction_class: "VERIFICATION_FRICTION" };
  if (status === "paused" && pause === "external") return { lifecycle_state: "PAUSED", friction_class: "WAITING_EXTERNAL" };
  if (status === "paused" && pause === "approval") return { lifecycle_state: "PAUSED", friction_class: "APPROVAL_GATE" };
  if (status === "paused" && pause === "confirmation") return { lifecycle_state: "PAUSED", friction_class: "CONFIRMATION_GATE" };
  return { lifecycle_state: code(status.toUpperCase(), "UNKNOWN"), friction_class: "OTHER" };
}

async function writeEvidence({ sourceOrganizationId, runId, currentStepId = null, structure, lifecycle, failureCode = null, recoveryUsed = false, businessEffectVerified = false }) {
  const learningOrganizationId = text(process.env[LEARNING_ORG_ENV], 160);
  const keyring = authenticityKeyring();
  if (!learningOrganizationId) return { written: false, status: "LEARNING_ORGANIZATION_NOT_CONFIGURED" };
  if (!keyring) return { written: false, status: "AUTHENTICITY_KEYRING_NOT_CONFIGURED" };
  if (!text(sourceOrganizationId, 160) || !text(runId, 240)) return { written: false, status: "SOURCE_SCOPE_NOT_AVAILABLE" };

  const organizationFingerprint = hmac(keyring.active_key, "organization", sourceOrganizationId);
  const eventFingerprint = hmac(
    keyring.active_key,
    "event",
    [sourceOrganizationId, runId, currentStepId || "-", lifecycle.lifecycle_state, lifecycle.friction_class, failureCode || "-"].join("|"),
  );
  const observedAt = new Date().toISOString();
  const row = {
    learning_organization_id: learningOrganizationId,
    source_organization_fingerprint: organizationFingerprint,
    event_fingerprint: eventFingerprint,
    mission_family: structure.mission_family,
    knowledge_domain: structure.knowledge_domain,
    capability_family: structure.capability_family,
    lifecycle_state: lifecycle.lifecycle_state,
    friction_class: lifecycle.friction_class,
    failure_mode_code: failureCode ? code(failureCode, "RUNTIME_FAILURE") : null,
    capability_count: Number(structure.capability_count || 0),
    external_wait_used: structure.contains_external_wait === true || lifecycle.friction_class === "WAITING_EXTERNAL",
    recovery_used: recoveryUsed === true,
    business_effect_verified: businessEffectVerified === true,
    key_id: keyring.active_id,
    metadata: {
      contract: BUSINESS_PARTNER_PRODUCT_EVIDENCE_CONTRACT,
      structural_only: true,
      customer_private_content_included: false,
      customer_identifiers_included: false,
      raw_mission_text_included: false,
      raw_payload_included: false,
      raw_output_included: false,
      raw_reasoning_included: false,
      authorization_effect: "NONE",
      product_authority: "NONE",
      automatic_engineering_authority: false,
    },
    observed_at: observedAt,
  };
  row.evidence_mac = evidenceMac(keyring.active_key, row);
  const result = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: "learning_organization_id,event_fingerprint", ignoreDuplicates: true }).select("id").maybeSingle();
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code)) return { written: false, status: "PRODUCT_EVIDENCE_SCHEMA_NOT_DEPLOYED" };
    throw result.error;
  }
  return { written: Boolean(result.data?.id), status: result.data?.id ? "STRUCTURAL_EVIDENCE_WRITTEN" : "DUPLICATE_STRUCTURAL_EVIDENCE_IGNORED" };
}

export async function recordBusinessPartnerMissionProductEvidence({ context = {}, payload = {}, result = {}, observation_token = null } = {}) {
  try {
    const missionState = object(result.mission_state);
    const resume = object(object(result.resume_payload).resume);
    const runId = text(missionState.run_id || resume.run_id || observation_token, 240);
    const failure = object(result.failure_evidence);
    const structure = missionStructure(payload);
    const lifecycle = classifyMissionResult(result);
    return await writeEvidence({
      sourceOrganizationId: context.organizationId || context.organization_id,
      runId,
      currentStepId: result.current_step_id || missionState.current_step_id || null,
      structure,
      lifecycle,
      failureCode: failure.error_code || result.reason || null,
      recoveryUsed: result.recovery_used === true,
      businessEffectVerified: lifecycle.lifecycle_state === "COMPLETED",
    });
  } catch (error) {
    return { written: false, status: "PRODUCT_EVIDENCE_WRITE_FAILED", reason: code(error?.code || error?.message, "WRITE_FAILED") };
  }
}

export async function recordBusinessPartnerCancellationProductEvidence({ organizationId, run = {} } = {}) {
  try {
    const structure = missionStructure({ steps: run.planned_steps });
    return await writeEvidence({
      sourceOrganizationId: organizationId,
      runId: run.run_id,
      currentStepId: run.current_step_id || null,
      structure,
      lifecycle: { lifecycle_state: "CANCELLED", friction_class: "HUMAN_ABANDONMENT" },
      failureCode: null,
      recoveryUsed: false,
      businessEffectVerified: false,
    });
  } catch (error) {
    return { written: false, status: "PRODUCT_EVIDENCE_WRITE_FAILED", reason: code(error?.code || error?.message, "WRITE_FAILED") };
  }
}


export async function recordBusinessPartnerRepairProductEvidence({ context = {}, failed_action = {}, repair_result = {}, failure_code = null } = {}) {
  try {
    const failed = object(failed_action);
    const failedCapability = object(failed.capability);
    const capabilityKey = text(
      failedCapability.key ||
      (failedCapability.domain && failedCapability.capability && failedCapability.action
        ? `${failedCapability.domain}.${failedCapability.capability}.${failedCapability.action}`
        : null) ||
      failed.capability_key,
      300,
    );
    const parts = capabilityParts(capabilityKey || "platform.unknown.execute");
    const structure = {
      mission_family: code(`${parts.domain}.${parts.capability}`, "platform.unknown"),
      knowledge_domain: parts.domain,
      capability_family: parts.capability,
      capability_count: 1,
      contains_external_wait: false,
    };
    const verified = repair_result.engineering_verified === true;
    const released = repair_result.production_deploy_performed === true || repair_result.activation_verified === true;
    return await writeEvidence({
      sourceOrganizationId: context.organizationId || context.organization_id,
      runId: text(repair_result.execution_key || repair_result.status || failure_code, 240) || `repair:${capabilityKey}`,
      currentStepId: null,
      structure,
      lifecycle: {
        lifecycle_state: released ? "REPAIR_RELEASED" : verified ? "REPAIR_VERIFIED" : "REPAIR_ATTEMPTED",
        friction_class: "PRODUCT_DEFECT_REPAIR",
      },
      failureCode: failure_code || null,
      recoveryUsed: true,
      businessEffectVerified: false,
    });
  } catch (error) {
    return { written: false, status: "PRODUCT_EVIDENCE_WRITE_FAILED", reason: code(error?.code || error?.message, "WRITE_FAILED") };
  }
}

export async function readBusinessPartnerProductEvidenceSummary({ days = 30, limit = 40 } = {}) {
  const learningOrganizationId = text(process.env[LEARNING_ORG_ENV], 160);
  const keyring = authenticityKeyring();
  if (!learningOrganizationId) return { status: "NOT_CONFIGURED", patterns: [], authorization_effect: "NONE" };
  if (!keyring) return { status: "AUTHENTICITY_KEYRING_NOT_CONFIGURED", patterns: [], authorization_effect: "NONE" };
  const since = new Date(Date.now() - Math.max(1, Math.min(180, Number(days) || 30)) * 86400000).toISOString();
  const response = await supabaseAdmin
    .from(TABLE)
    .select("learning_organization_id,source_organization_fingerprint,event_fingerprint,mission_family,knowledge_domain,capability_family,lifecycle_state,friction_class,failure_mode_code,capability_count,recovery_used,external_wait_used,business_effect_verified,key_id,evidence_mac,observed_at")
    .eq("learning_organization_id", learningOrganizationId)
    .gte("observed_at", since)
    .order("observed_at", { ascending: false })
    .limit(5000);
  if (response.error) {
    if (["42P01", "PGRST205"].includes(response.error.code)) return { status: "SCHEMA_NOT_DEPLOYED", patterns: [], authorization_effect: "NONE" };
    return { status: "READ_FAILED", patterns: [], authorization_effect: "NONE" };
  }

  const validRows = (response.data || []).filter((row) => validEvidenceMac(row, keyring));
  const invalidEvidenceRowCount = (response.data || []).length - validRows.length;
  const grouped = new Map();
  for (const row of validRows) {
    const key = [row.mission_family, row.friction_class, row.failure_mode_code || "-"].join("|");
    const current = grouped.get(key) || {
      mission_family: row.mission_family,
      knowledge_domain: row.knowledge_domain,
      capability_family: row.capability_family,
      friction_class: row.friction_class,
      failure_mode_code: row.failure_mode_code || null,
      occurrences: 0,
      organizations: new Set(),
      recovered_count: 0,
      external_wait_count: 0,
      verified_success_count: 0,
    };
    current.occurrences += 1;
    current.organizations.add(row.source_organization_fingerprint);
    if (row.recovery_used) current.recovered_count += 1;
    if (row.external_wait_used) current.external_wait_count += 1;
    if (row.business_effect_verified) current.verified_success_count += 1;
    grouped.set(key, current);
  }

  const allPatterns = [...grouped.values()]
    .map((item) => ({
      mission_family: item.mission_family,
      knowledge_domain: item.knowledge_domain,
      capability_family: item.capability_family,
      friction_class: item.friction_class,
      failure_mode_code: item.failure_mode_code,
      occurrences: item.occurrences,
      distinct_organization_count: item.organizations.size,
      recovered_count: item.recovered_count,
      external_wait_count: item.external_wait_count,
      verified_success_count: item.verified_success_count,
    }))
    .sort((a, b) => b.distinct_organization_count - a.distinct_organization_count || b.occurrences - a.occurrences);
  const patterns = allPatterns
    .filter((item) => item.occurrences >= 3 && item.distinct_organization_count >= 2)
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 40)));

  return {
    contract: BUSINESS_PARTNER_PRODUCT_EVIDENCE_CONTRACT,
    status: "STRUCTURAL_AGGREGATES_ONLY",
    window_days: Math.max(1, Math.min(180, Number(days) || 30)),
    patterns,
    authenticated_row_count: validRows.length,
    raw_structural_pattern_count: allPatterns.length,
    eligible_prioritization_pattern_count: patterns.length,
    minimum_occurrences_for_product_prioritization: 3,
    minimum_distinct_organizations_for_product_prioritization: 2,
    single_organization_cannot_steer_product_priority: true,
    invalid_evidence_row_count: invalidEvidenceRowCount,
    database_only_writer_cannot_forge_valid_evidence_without_server_key: true,
    raw_customer_content_included: false,
    customer_identifiers_included: false,
    organization_ids_included: false,
    product_authority: "NONE",
    automatic_engineering_authority: false,
    authorization_effect: "NONE",
  };
}

export const BusinessPartnerProductEvidenceRuntime = Object.freeze({
  contract: BUSINESS_PARTNER_PRODUCT_EVIDENCE_CONTRACT,
  recordMission: recordBusinessPartnerMissionProductEvidence,
  recordCancellation: recordBusinessPartnerCancellationProductEvidence,
  recordRepair: recordBusinessPartnerRepairProductEvidence,
  readSummary: readBusinessPartnerProductEvidenceSummary,
});
