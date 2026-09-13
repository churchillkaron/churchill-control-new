import crypto from "node:crypto";

const CONTRACT = "CREATIVE_STILL_CONVERSATION_CONTINUITY_V1";

function text(value, maximum = 1600) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value, maximum = 8) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 500)).filter(Boolean).slice(0, maximum)
    : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function continuityKey(objective) {
  const stable = text(objective, 2000).toLowerCase();
  if (!stable) return null;
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 24);
}
export function buildCreativeStillConversationContinuity({
  request = "",
  project_state = {},
} = {}) {
  const state = object(project_state);
  const durableObjective = text(state.objective, 2000);
  const currentRequest = text(request, 2000);
  const constraints = list(state.constraints);
  const decisions = list(state.decisions);
  const progress = text(state.progress_summary, 1200);
  const nextStep = text(state.next_step, 800);
  const objective = durableObjective || currentRequest;

  const workingParts = [];
  if (durableObjective) workingParts.push(`Active creative objective: ${durableObjective}`);
  if (constraints.length) workingParts.push(`Constraints: ${constraints.join(" | ")}`);
  if (decisions.length) workingParts.push(`Accepted decisions: ${decisions.join(" | ")}`);
  if (progress) workingParts.push(`Current direction: ${progress}`);
  if (nextStep) workingParts.push(`Recorded next step: ${nextStep}`);
  if (currentRequest) workingParts.push(`Current requested change: ${currentRequest}`);

  return Object.freeze({
    contract: CONTRACT,
    continuity_key: continuityKey(objective),
    active: Boolean(durableObjective),
    objective,
    current_request: currentRequest || null,
    constraints,
    decisions,
    progress_summary: progress || null,
    next_step: nextStep || null,
    working_context: workingParts.join("\n").slice(0, 6000),
  });
}

export const CreativeStillConversationContinuityRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildCreativeStillConversationContinuity,
});

export default CreativeStillConversationContinuityRuntime;
