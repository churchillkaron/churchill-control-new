export const BUSINESS_PARTNER_HUMAN_GATE_RECOVERY_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_HUMAN_GATE_RECOVERY_V1";

const text = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const APPROVAL = /APPROVAL/;
const CONFIRMATION = /CONFIRMATION/;
const CREDENTIAL = /CREDENTIAL|OAUTH|TOKEN|API[_ ]?KEY|LOGIN|RECONNECT|REAUTH|CONNECTION_REQUIRED/;
const WALLET = /WALLET|BALANCE|PREPAID|BILLING|FUNDING|QUOTA/;
const ACCESS = /PERMISSION|AUTHORIZ|UNAUTHORIZED|FORBIDDEN|ACCESS/;
const ENTITY = /ENTITY_CONTEXT|LEGAL_ENTITY|SELECTED_ENTITY/;
const RESOLVED_REPLY = /^(done|done now|i did it|fixed|fixed now|connected|reconnected|authorized|authorised|topped up|top up done|funded|permission granted|access granted|selected|selected now|ready|continue|try again|retry|yes)$/i;

function kindFrom(detail) {
  if (APPROVAL.test(detail)) return "APPROVAL";
  if (CONFIRMATION.test(detail)) return "CONFIRMATION";
  if (CREDENTIAL.test(detail)) return "CREDENTIAL_OR_RECONNECT";
  if (WALLET.test(detail)) return "WALLET_OR_BILLING";
  if (ACCESS.test(detail)) return "PERMISSION_OR_ACCESS";
  if (ENTITY.test(detail)) return "ENTITY_CONTEXT";
  return null;
}

function humanInstruction(kind) {
  if (kind === "CREDENTIAL_OR_RECONNECT") return "Complete the required connection or credential setup, then tell me when it is done. Do not paste passwords, tokens, API keys, or secrets into this chat.";
  if (kind === "WALLET_OR_BILLING") return "Complete the required wallet funding or billing step, then tell me when it is done.";
  if (kind === "PERMISSION_OR_ACCESS") return "Have the required access or permission granted, then tell me when it is done.";
  if (kind === "ENTITY_CONTEXT") return "Select the required legal entity or business context, then tell me when it is done.";
  return null;
}

export function createBusinessPartnerHumanGateRecoveryState({ classification, reason, configurationRecovery = {}, recovery = {} } = {}) {
  const normalized = text(classification, 120).toUpperCase();
  const configurationStatus = text(object(configurationRecovery).status, 120).toUpperCase();
  const detail = [reason, object(recovery).failure_evidence?.error_code, configurationStatus]
    .map((value) => text(value, 800).toUpperCase()).filter(Boolean).join(" ");
  const eligibleClassification = normalized === "HUMAN_GATE" ||
    (normalized === "CONFIGURATION_OR_EXTERNAL" && ["HUMAN_CREDENTIAL_REQUIRED", "GOVERNANCE_REQUIRED"].includes(configurationStatus));
  if (!eligibleClassification) return null;
  const kind = kindFrom(detail);
  if (!kind || kind === "APPROVAL" || kind === "CONFIRMATION") return null;
  const capability = object(recovery.capability);
  if (!text(capability.key, 300)) return null;
  return {
    contract: BUSINESS_PARTNER_HUMAN_GATE_RECOVERY_CONTRACT,
    status: "AWAITING_HUMAN_RESOLUTION",
    gate_kind: kind,
    blocker_reason: text(reason, 800) || null,
    capability_key: text(capability.key, 300),
    mutation_completion_proven: false,
    pre_mutation_gate_required: true,
    human_instruction: humanInstruction(kind),
    resume_authorized: false,
    authorization_effect: "NONE",
    secrets_requested: false,
    prior_confirmation_reused: false,
    prior_approval_reused: false,
  };
}

export function humanGateResolutionReply(message) {
  return RESOLVED_REPLY.test(text(message, 240));
}

export function authorizeBusinessPartnerHumanGateReinspection(state = {}) {
  const current = object(state);
  if (text(current.contract, 160) !== BUSINESS_PARTNER_HUMAN_GATE_RECOVERY_CONTRACT ||
      text(current.status, 120) !== "AWAITING_HUMAN_RESOLUTION" ||
      current.pre_mutation_gate_required !== true || current.mutation_completion_proven !== false) {
    return { authorized: false, status: "REINSPECTION_NOT_AUTHORIZED", authorization_effect: "NONE" };
  }
  return {
    ...current,
    status: "READY_FOR_GOVERNED_REINSPECTION",
    resume_authorized: true,
    authorization_effect: "SAME_ACTION_ONLY",
    prior_confirmation_reused: false,
    prior_approval_reused: false,
    human_resolution_claim_is_evidence_only: true,
  };
}

export default { createBusinessPartnerHumanGateRecoveryState, humanGateResolutionReply, authorizeBusinessPartnerHumanGateReinspection };
