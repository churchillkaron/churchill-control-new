import { executeBatchedAutonomousCodeMissionWithDeterministicConvergence } from "./CodeAIWorkPackageDeterministicConvergenceRuntime.js";

export const CODE_AI_DEVELOPER_IMPLEMENTATION_CONTRACT = "AVANTIQO_CODE_AI_DEVELOPER_IMPLEMENTATION_V1";

function text(value, maximum = 12000) { return String(value ?? "").trim().slice(0, maximum); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

const PATH_PATTERN = /\b((?:app|components|lib|tests|scripts|workers)\/[A-Za-z0-9_./@()\[\]-]+\.(?:cjs|css|js|jsx|json|md|mjs|sql|ts|tsx|yml|yaml))\b/gi;
const MUTATION_SIGNAL = /\b(?:add|change|create|edit|fix|implement|modify|refactor|remove|replace|rewrite|update|wire)\b/i;
const BROAD_SIGNAL = /\b(?:architecture|architectural|entire\s+repository|whole\s+repository|across\s+the\s+platform|research|compare\s+approaches|benchmark|redesign|replatform|migration\s+strategy|multi[- ]system)\b/i;
const NO_DEPLOY_SIGNAL = /\bdo\s+not\s+(?:commit|deploy)|\bno\s+(?:commit|deploy)\b/i;

export function resolveCodeAIDeveloperImplementationRequest(objective) {
  const source = text(objective, 12000);
  const paths = unique([...source.matchAll(PATH_PATTERN)].map((match) => match[1])).slice(0, 8);
  const mutationRequested = MUTATION_SIGNAL.test(source);
  const broad = BROAD_SIGNAL.test(source);
  return {
    contract: "AVANTIQO_CODE_AI_DEVELOPER_IMPLEMENTATION_REQUEST_V1",
    eligible: paths.length > 0 && mutationRequested && !broad,
    allowed_edit_paths: paths,
    mutation_requested: mutationRequested,
    broad_or_strategic: broad,
    explicit_no_commit_or_deploy: NO_DEPLOY_SIGNAL.test(source),
    authorization_effect: "NONE",
  };
}

export async function runCodeAIDeveloperImplementation({
  context = {},
  objective,
  repository_url,
  ref = "main",
  organization_id,
  device_id,
  device_session_id,
  mission_id = null,
  reasoning_call_budget = 12,
  timeout_ms = 360000,
  resume_state = null,
} = {}) {
  const request = resolveCodeAIDeveloperImplementationRequest(objective);
  if (!request.eligible) throw new Error("CODE_AI_DEVELOPER_IMPLEMENTATION_REQUEST_NOT_ELIGIBLE");
  const organizationId = text(organization_id || context.organizationId, 160);
  const deviceId = text(device_id, 160);
  const sessionId = text(device_session_id, 160);
  if (!organizationId || !deviceId || !sessionId) throw new Error("CODE_AI_DEVELOPER_IMPLEMENTATION_DEVICE_SESSION_REQUIRED");

  const evidencePath = request.allowed_edit_paths.find((path) => !path.startsWith("tests/")) || request.allowed_edit_paths[0] || null;
  const hasNodeTestFile = request.allowed_edit_paths.some((path) => path.endsWith(".test.mjs"));
  const testRuntimeGuidance = hasNodeTestFile
    ? "This repository verifies .test.mjs files directly with Node. Use import test from \"node:test\" and import assert from \"node:assert/strict\". Do not use Jest globals such as describe, it, expect, jest, beforeEach or afterEach unless loaded repository evidence explicitly proves Jest is configured for the authoritative verifier."
    : null;
  const result = await executeBatchedAutonomousCodeMissionWithDeterministicConvergence({
    context,
    objective: text(objective, 9000),
    objective_context: {
      owner_objective: text(objective, 9000),
      organization_id: organizationId,
      workspace_target: "DEVICE",
      device_id: deviceId,
      device_session_id: sessionId,
      mission_id: text(mission_id, 240) || null,
      evidence_path_1: evidencePath,
      allowed_edit_paths: request.allowed_edit_paths,
      implementation_required: true,
      adaptive_reasoning_budget_applied: true,
      test_runtime_guidance: testRuntimeGuidance,
      completion_criterion_1: "Implement only the requested bounded developer change in the allowed edit paths.",
      completion_criterion_2: "Run fresh deterministic verification after the final source mutation.",
      completion_criterion_3: "Review the final diff and leave commit/deploy authority unused.",
    },
    repository_url,
    ref,
    resume_state,
    reasoning_call_budget,
    timeout_ms,
  });

  return {
    ...result,
    developer_implementation: {
      contract: CODE_AI_DEVELOPER_IMPLEMENTATION_CONTRACT,
      direct_bounded_lane: true,
      allowed_edit_paths: request.allowed_edit_paths,
      required_evidence_path: evidencePath,
      shared_device_session_preserved: true,
      strategic_council_skipped: true,
      commit_authority: false,
      deploy_authority: false,
    },
  };
}

export default Object.freeze({
  contract: CODE_AI_DEVELOPER_IMPLEMENTATION_CONTRACT,
  resolveRequest: resolveCodeAIDeveloperImplementationRequest,
  run: runCodeAIDeveloperImplementation,
});
