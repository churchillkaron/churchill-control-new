import {
  rankOperatorCapabilities,
} from "./OperatorCapabilityMatcher";

function text(value) {
  return String(value ?? "").trim();
}

function mode(value) {
  return text(value).toLowerCase();
}

function isAction(entry) {
  return !["read", "navigate"].includes(mode(entry?.capability?.mode));
}

function isMaterial(entry) {
  return (
    Number(entry?.score || 0) >= 0.18 ||
    Number(entry?.phrase_affinity || 0) >= 0.55 ||
    Number(entry?.primary_coverage || 0) >= 0.35
  );
}

export function routeOperatorCognition({
  message,
  source = "text",
  capabilities = [],
} = {}) {
  const clean = text(message).replace(/\s+/g, " ");
  if (!clean) return { path: "fast", reason: "LIGHTWEIGHT_TURN" };
  if (clean.length > 360) return { path: "deep", reason: "COMPLEX_TURN" };

  const ranked = rankOperatorCapabilities({
    message: clean,
    capabilities,
    limit: 8,
  });
  const material = ranked.filter(isMaterial);
  const actions = material.filter(isAction);

  if (
    actions.some((entry) =>
      entry.capability?.requires_confirmation === true ||
      entry.capability?.transactional === true ||
      ["high", "critical"].includes(mode(entry.capability?.risk)),
    )
  ) {
    return { path: "deep", reason: "REGISTERED_GOVERNED_ACTION" };
  }

  if (actions.length > 1) {
    return { path: "deep", reason: "MULTI_REGISTERED_ACTION" };
  }

  if (actions.length === 1 && Number(actions[0].score || 0) >= 0.3) {
    return { path: "deep", reason: "REGISTERED_ACTION" };
  }

  return {
    path: "fast",
    reason: text(source).toLowerCase() === "voice"
      ? "FAST_EXECUTIVE_VOICE"
      : "FAST_EXECUTIVE_TURN",
  };
}

export default routeOperatorCognition;
