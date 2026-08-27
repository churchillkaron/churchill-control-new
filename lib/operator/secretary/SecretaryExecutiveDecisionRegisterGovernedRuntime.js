import {
  readSecretaryExecutiveDecision,
  supersedeSecretaryExecutiveDecision,
} from "@/lib/operator/secretary/SecretaryExecutiveDecisionRegisterRuntime";
import { createHash } from "node:crypto";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DECISION_REGISTER_GOVERNED_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function normalizedIso(value) {
  const parsed = Date.parse(text(value, 180));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export async function supersedeSecretaryExecutiveDecisionGoverned({ context, payload = {} } = {}) {
  const decisionId = text(payload.decision_id || payload.decisionId, 120);
  const supersedesVersionId = text(payload.supersedes_version_id || payload.supersedesVersionId, 120);
  const replacementText = text(payload.replacement_decision_text || payload.replacementDecisionText, 20000);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const decidedAt = normalizedIso(payload.decided_at || payload.decidedAt);
  if (decisionId && supersedesVersionId && replacementText && evidenceId && decidedAt) {
    const read = await readSecretaryExecutiveDecision({ context, payload: { decision_id: decisionId } });
    const decision = read.decision || {};
    const current = decision.current_version || null;
    const old = list(decision.versions).find((row) => row.version_id === supersedesVersionId) || null;
    const exactReplay = decision.state === "CURRENT"
      && current
      && current.evidence_id === evidenceId
      && current.decided_at === decidedAt
      && current.decision_text_sha256 === sha256(replacementText)
      && old?.state === "SUPERSEDED"
      && old?.superseded_by_version_id === current.version_id
      && old?.supersession_evidence_id === evidenceId;
    if (exactReplay) {
      return {
        status: "superseded",
        contract: CONTRACT,
        underlying_contract: read.contract,
        decision,
        replay_safe: true,
        stale_supersession_fenced: true,
        decision_inferred: false,
        decision_made_by_secretary: false,
        decision_authority_created: false,
        approval_authority_delegated: false,
        binding_authority_delegated: false,
        platform_permissions_mutated: false,
        external_authority_used: false,
      };
    }
  }
  const result = await supersedeSecretaryExecutiveDecision({ context, payload });
  return {
    ...result,
    contract: CONTRACT,
    underlying_contract: result.contract,
  };
}

export default Object.freeze({ supersede: supersedeSecretaryExecutiveDecisionGoverned });
