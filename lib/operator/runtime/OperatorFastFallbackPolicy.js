function text(value) { return String(value ?? "").trim(); }

export function fastConversationalLowConfidenceRequiresDeep({ parsed, intent, currentStateEvidenceRequired = false } = {}) {
  const confidence = Number(parsed?.confidence ?? 0);
  if (!Number.isFinite(confidence)) return true;
  if (confidence >= 0.55) return false;
  const conversationalOnly =
    ["answer", "plan"].includes(String(intent || "").toLowerCase()) &&
    currentStateEvidenceRequired !== true &&
    !text(parsed?.execution?.capability_key || parsed?.capability_key) &&
    !text(parsed?.navigation?.target_id || parsed?.navigation_target_id);
  return !conversationalOnly || confidence < 0.3;
}

export default fastConversationalLowConfidenceRequiresDeep;
