import crypto from "node:crypto";

import { CodeWorkspaceRuntime } from "./CodeWorkspaceRuntime.js";
import { consumePendingCodeAIOwnerStopAtSafeBoundary } from "./CodeAIOwnerInterventionRuntime.js";
import { publishCodeAILiveProgress } from "./CodeAILiveProgressRuntime.js";

export const CODE_AI_DEVELOPER_VERIFICATION_CONTRACT = "AVANTIQO_CODE_AI_DEVELOPER_VERIFICATION_V1";

function text(value, maximum = 4000) { return String(value ?? "").trim().slice(0, maximum); }
function list(value) { return Array.isArray(value) ? value : []; }

const FILE_PATTERN = /\b((?:app|components|lib|tests|scripts|workers)\/[A-Za-z0-9_./@()\[\]-]+\.(?:cjs|css|js|jsx|json|md|mjs|sql|ts|tsx|yml|yaml))\b/i;
const VERIFY_ONLY_SIGNAL = /\b(?:make\s+no\s+(?:source\s+)?changes?|no\s+(?:source\s+)?changes?|do\s+not\s+(?:change|modify|edit)|verify\s+only|verification[- ]only|read[- ]only)\b/i;
const MUTATION_SIGNAL = /\b(?:fix|change|modify|edit|implement|repair|refactor|add|remove|replace|rewrite|create)\b/i;

export function resolveCodeAIDeveloperVerificationRequest(objective) {
  const source = text(objective, 9000);
  const filePath = source.match(FILE_PATTERN)?.[1] || null;
  const nodeCheck = /\bnode\s+--check\b/i.test(source);
  const explicitNoMutation = VERIFY_ONLY_SIGNAL.test(source);
  const mutationRequested = MUTATION_SIGNAL.test(source.replace(/(?:make\s+no\s+(?:source\s+)?changes?|no\s+(?:source\s+)?changes?|do\s+not\s+(?:change|modify|edit))/gi, ""));
  const eligible = Boolean(filePath && nodeCheck && !mutationRequested);
  const extension = filePath?.split(".").pop()?.toLowerCase() || "";
  const nodeCheckCompatible = ["js", "mjs", "cjs"].includes(extension);
  const command = eligible ? (nodeCheckCompatible ? "node" : "npx") : null;
  const args = eligible
    ? (nodeCheckCompatible ? ["--check", filePath] : ["eslint", "--no-warn-ignored", filePath])
    : [];
  return {
    contract: "AVANTIQO_CODE_AI_DEVELOPER_VERIFICATION_REQUEST_V1",
    eligible,
    file_path: filePath,
    requested_verifier: nodeCheck ? "node --check" : null,
    effective_verifier: nodeCheckCompatible ? "node --check" : "eslint",
    command,
    args,
    explicit_no_mutation: explicitNoMutation,
    mutation_requested: mutationRequested,
    authorization_effect: "NONE",
  };
}

async function progress(context, state, event) {
  return publishCodeAILiveProgress({ context, state, event }).catch(() => null);
}

async function ownerStopBoundary(context, state) {
  const missionId = text(state?.mission_id, 240);
  if (!missionId) return null;
  const consumed = await consumePendingCodeAIOwnerStopAtSafeBoundary({ context, missionId });
  if (consumed?.applied !== true || !consumed?.intervention) return null;
  const stopped = {
    ...state,
    status: "stopped",
    blockers: [],
    current_operation_id: null,
    updated_at: new Date().toISOString(),
    owner_intervention: {
      id: consumed.intervention.id || null,
      action: "STOP",
      status: "APPLIED",
      authorization_effect: "REDUCE_EXECUTION_ONLY",
      commit_authority: false,
      production_deploy_authority: false,
    },
  };
  await progress(context, stopped, {
    phase: "OWNER_STOPPED",
    status: "stopped",
    mission_id: missionId,
    description: "Developer verification stopped at the next read-only safe boundary on owner request.",
    reason: "CODE_AI_OWNER_STOP_REQUESTED",
  });
  return {
    success: true,
    contract: CODE_AI_DEVELOPER_VERIFICATION_CONTRACT,
    status: "stopped",
    reason: "CODE_AI_OWNER_STOP_REQUESTED",
    state: stopped,
    read_only: true,
    source_mutation_performed: false,
    commit_performed: false,
    production_deploy_performed: false,
    owner_stop_applied: true,
  };
}

export async function runCodeAIDeveloperVerification({
  context = {},
  objective,
  repository_url,
  ref = "main",
  organization_id,
  device_id,
  device_session_id,
  mission_id = null,
  timeout_ms = 120000,
} = {}) {
  const request = resolveCodeAIDeveloperVerificationRequest(objective);
  if (!request.eligible) throw new Error("CODE_AI_DEVELOPER_VERIFICATION_REQUEST_NOT_ELIGIBLE");
  const organizationId = text(organization_id || context.organizationId, 160);
  const deviceId = text(device_id, 160);
  const sessionId = text(device_session_id, 160);
  if (!organizationId || !deviceId || !sessionId) throw new Error("CODE_AI_DEVELOPER_VERIFICATION_DEVICE_SESSION_REQUIRED");

  const missionId = text(mission_id, 240) || `code-developer-verify:${crypto.randomUUID()}`;
  let state = {
    mission_id: missionId,
    objective: text(objective, 9000),
    repository_url: text(repository_url, 1000),
    ref: text(ref, 160) || "main",
    device_id: deviceId,
    device_session_id: sessionId,
    status: "running",
    files_changed: [],
    evidence: [],
    tests: [],
    blockers: [],
    failures: [],
    completed_operation_ids: [],
    current_operation_id: null,
    developer_verification: { contract: CODE_AI_DEVELOPER_VERIFICATION_CONTRACT, read_only: true },
  };
  await progress(context, state, { phase: "DEVELOPER_VERIFY_ATTACH", status: "running", mission_id: missionId, description: "Attaching Code to the exact developer workspace for read-only verification." });
  const stopBeforeAttach = await ownerStopBoundary(context, state);
  if (stopBeforeAttach) return stopBeforeAttach;

  const workspace = await CodeWorkspaceRuntime.open({
    workspace_target: "DEVICE",
    organization_id: organizationId,
    device_id: deviceId,
    session_id: sessionId,
    repository_url,
    ref,
    timeout_ms,
  });
  let lease = false;
  try {
    await workspace.acquireEditLease({ owner: "CODE", ttl_ms: Math.min(Math.max(Number(timeout_ms) || 120000, 30000), 300000) });
    lease = true;

    const stopBeforeRead = await ownerStopBoundary(context, state);
    if (stopBeforeRead) return stopBeforeRead;

    const readId = "developer_verify_read";
    state = { ...state, current_operation_id: readId };
    await progress(context, state, { phase: "DEVELOPER_VERIFY_READ", status: "running", mission_id: missionId, operation_id: readId, action: "read", file_path: request.file_path, description: `Reading ${request.file_path}.` });
    const read = await workspace.read({ file_path: request.file_path, start_line: 1, end_line: 1000000 });
    state.evidence.push({ at: new Date().toISOString(), kind: "operation", operation_id: readId, action: "read", status: "completed", files_changed: [], result: { file_path: read.file_path, total_lines: read.total_lines } });
    state.completed_operation_ids.push(readId);

    const stopBeforeVerify = await ownerStopBoundary(context, state);
    if (stopBeforeVerify) return stopBeforeVerify;

    const verifyId = "developer_verify_node_check";
    state = { ...state, current_operation_id: verifyId };
    await progress(context, state, { phase: "DEVELOPER_VERIFY_COMMAND", status: "running", mission_id: missionId, operation_id: verifyId, action: "verify", file_path: request.file_path, command: request.command, command_args: request.args, description: `${request.command} ${request.args.join(" ")}` });
    const verification = await workspace.run({ command: request.command, args: request.args, cwd: ".", timeout_ms, actor: "CODE" });
    const passed = Number(verification.exit_code) === 0;
    await progress(context, state, {
      phase: "DEVELOPER_VERIFY_RESULT",
      status: passed ? "completed" : "failed",
      mission_id: missionId,
      operation_id: verifyId,
      action: "verify",
      file_path: request.file_path,
      command: request.command,
      command_args: request.args,
      exit_code: Number(verification.exit_code),
      verification_passed: passed,
      description: passed
        ? `${request.command} ${request.args.join(" ")} passed.`
        : `${request.command} ${request.args.join(" ")} failed with exit ${verification.exit_code}.`,
    });
    state.tests.push({ operation_id: verifyId, command: request.command, args: request.args, exit_code: Number(verification.exit_code), passed, stdout: text(verification.stdout, 5000), stderr: text(verification.stderr, 3000) });
    state.evidence.push({ at: new Date().toISOString(), kind: "operation", operation_id: verifyId, action: "verify", status: passed ? "completed" : "failed", exit_code: Number(verification.exit_code), command: request.command, command_args: request.args, verification_passed: passed, files_changed: [] });
    state.completed_operation_ids.push(verifyId);
    if (!passed) {
      state.failures.push({ operation_id: verifyId, reason: `NODE_CHECK_EXIT_${verification.exit_code}` });
      state.status = "repair_required";
    }

    const stopBeforeDiff = await ownerStopBoundary(context, state);
    if (stopBeforeDiff) return stopBeforeDiff;

    const diffId = "developer_verify_diff";
    const diff = await workspace.diff();
    const changed = list(diff.status).map((item) => text(item, 1200)).filter(Boolean);
    state.files_changed = changed;
    state.evidence.push({ at: new Date().toISOString(), kind: "operation", operation_id: diffId, action: "diff", status: "completed", files_changed: changed, result: { patch_bytes: Number(diff.patch_bytes || 0), clean: changed.length === 0 } });
    state.completed_operation_ids.push(diffId);
    state.current_operation_id = null;
    if (passed && changed.length === 0) state.status = "completed";
    else if (passed && changed.length) {
      state.status = "blocked";
      state.blockers.push("CODE_AI_DEVELOPER_VERIFICATION_WORKTREE_NOT_CLEAN");
    }
    state.updated_at = new Date().toISOString();

    await progress(context, state, { phase: "DEVELOPER_VERIFY_COMPLETE", status: state.status, mission_id: missionId, operation_id: diffId, action: "diff", file_path: request.file_path, verification_passed: passed && changed.length === 0, description: state.status === "completed" ? "Developer workspace verification completed with no source mutation." : "Developer workspace verification stopped on evidence." });
    return {
      success: state.status === "completed",
      contract: CODE_AI_DEVELOPER_VERIFICATION_CONTRACT,
      status: state.status,
      reason: state.blockers[0] || state.failures[0]?.reason || null,
      state,
      read_only: true,
      source_mutation_performed: false,
      commit_performed: false,
      production_deploy_performed: false,
      shared_device_session_preserved: true,
      verification: state.tests[0] || null,
    };
  } finally {
    if (lease) await workspace.releaseEditLease({ owner: "CODE" }).catch(() => null);
    // Attached Developer Mode sessions intentionally remain alive for the human.
  }
}

export default Object.freeze({
  contract: CODE_AI_DEVELOPER_VERIFICATION_CONTRACT,
  resolveRequest: resolveCodeAIDeveloperVerificationRequest,
  run: runCodeAIDeveloperVerification,
  source_mutation_authority: false,
  commit_authority: false,
  deploy_authority: false,
});
