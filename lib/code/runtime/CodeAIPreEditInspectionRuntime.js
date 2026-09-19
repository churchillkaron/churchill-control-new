import { selectCodeAIDependencyAwareVerifiers } from "./CodeAIDependencyAwareVerifierSelectionRuntime.js";

export const CODE_AI_PRE_EDIT_INSPECTION_CONTRACT =
  "AVANTIQO_CODE_AI_PRE_EDIT_INSPECTION_V1";

const TEST_PATH = /(^|\/)(?:__tests__|tests?|specs?|e2e)(\/|$)|\.(?:test|spec)\.[^/]+$/i;
const API_UI_PATH = /(^|\/)(?:app\/api|api|routes?|controllers?|handlers?|components?|ui|pages?|views?|screens?)(\/|$)/i;
const SERVICE_PATH = /(^|\/)(?:services?|runtime|workers?|repositories?|providers?)(\/|$)/i;
const MAX_REQUIRED_PATHS = 4;

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function unique(values) {
  return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))];
}
function changedPaths(state = {}) {
  return new Set(unique([
    ...list(state?.files_changed),
    ...list(state?.source_changes).map((entry) => entry?.path),
  ]));
}
function pathWeight(path) {
  if (API_UI_PATH.test(path)) return 16;
  if (SERVICE_PATH.test(path)) return 10;
  return 4;
}

export function planCodeAIPreEditInspection({ state = {}, verifier_selection = null } = {}) {
  const changed = changedPaths(state);
  const selection = verifier_selection || selectCodeAIDependencyAwareVerifiers({ state });
  const candidates = [];
  for (const verifier of list(selection?.candidates)) {
    const base = Number(verifier?.score || 0);
    const chain = list(verifier?.dependency_chain);
    chain.forEach((edge, index) => {
      const path = text(edge?.consumer, 1200);
      if (!path || TEST_PATH.test(path) || changed.has(path)) return;
      candidates.push({
        path,
        score: base + pathWeight(path) - (index * 3),
        reason: `Observed blast-radius consumer on the path to ${text(verifier?.path, 1200)}.`,
        dependency_depth: index + 1,
        verifier_path: text(verifier?.path, 1200) || null,
      });
    });
  }
  const best = new Map();
  for (const candidate of candidates) {
    const prior = best.get(candidate.path);
    if (!prior || candidate.score > prior.score) best.set(candidate.path, candidate);
  }
  const required = [...best.values()]
    .sort((a, b) => b.score - a.score || a.dependency_depth - b.dependency_depth || a.path.localeCompare(b.path))
    .slice(0, MAX_REQUIRED_PATHS);
  return {
    contract: CODE_AI_PRE_EDIT_INSPECTION_CONTRACT,
    required: required.length > 0,
    required_paths: required.map((item) => item.path),
    inspections: required,
    max_required_paths: MAX_REQUIRED_PATHS,
    current_head_revalidation_required: true,
    durable_prompt_evidence_required: true,
    mutation_blocked_until_required_paths_loaded: required.length > 0,
    historical_patch_replay_allowed: false,
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export function formatCodeAIPreEditInspectionForObjective(value = {}) {
  const required = list(value?.inspections);
  if (!required.length) return null;
  return [
    "PRE-EDIT BLAST-RADIUS INSPECTION (DETERMINISTIC):",
    ...required.map((item) => `- inspect ${text(item.path, 1200)} before mutation: ${text(item.reason, 1000)}`),
    "These are compatibility evidence obligations, not edit targets. Keep them loaded in the reasoning context before the first mutation and revalidate against current repository evidence.",
  ].join("\n");
}

export const CodeAIPreEditInspectionRuntime = Object.freeze({
  contract: CODE_AI_PRE_EDIT_INSPECTION_CONTRACT,
  plan: planCodeAIPreEditInspection,
  formatForObjective: formatCodeAIPreEditInspectionForObjective,
  max_required_paths: MAX_REQUIRED_PATHS,
});

export default CodeAIPreEditInspectionRuntime;
