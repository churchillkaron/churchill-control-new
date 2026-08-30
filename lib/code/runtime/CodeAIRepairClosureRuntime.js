import {
  codeAIEditAction,
} from "./CodeAISourceChangePolicy.js";

export const CODE_AI_REPAIR_CLOSURE_CONTRACT =
  "AVANTIQO_CODE_AI_REPAIR_CLOSURE_V2";

function text(value, maximum = 2000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function signature(test = {}) {
  const command = text(test?.command, 300).toLowerCase();
  if (!command) return null;
  return JSON.stringify({
    command,
    args: list(test?.args).map((item) => text(item, 1200)),
  });
}

function operationPositions(state = {}) {
  const positions = new Map();
  list(state?.evidence).forEach((entry, index) => {
    if (text(entry?.kind, 120) !== "operation") return;
    if (text(entry?.status, 80) !== "completed") return;
    const operationId = text(entry?.operation_id, 200);
    if (!operationId) return;
    positions.set(operationId, {
      index,
      action: text(entry?.action, 80).toLowerCase(),
    });
  });
  return positions;
}

function lastEditPosition(positions) {
  let latest = -1;
  for (const entry of positions.values()) {
    if (codeAIEditAction(entry.action) && entry.index > latest) latest = entry.index;
  }
  return latest;
}

export function assessCodeAIRepairClosure(state = {}) {
  const positions = operationPositions(state);
  const lastEdit = lastEditPosition(positions);
  const failedVerifiers = [];
  const successfulVerifiers = [];

  for (const test of list(state?.tests)) {
    const operationId = text(test?.operation_id, 200);
    const position = positions.get(operationId);
    if (!position || position.action !== "verify") continue;
    const exitCode = Number(test?.exit_code);
    if (!Number.isFinite(exitCode)) continue;
    const testSignature = signature(test);
    if (!testSignature) continue;

    const record = {
      operation_id: operationId,
      operation_position: position.index,
      command: text(test?.command, 300) || null,
      args: list(test?.args).map((item) => text(item, 1200)).slice(0, 40),
      exit_code: exitCode,
      signature: testSignature,
    };

    if (exitCode !== 0) failedVerifiers.push(record);
    if (exitCode === 0) successfulVerifiers.push(record);
  }

  const unresolved = failedVerifiers.filter((failure) => {
    const minimumSuccessPosition = Math.max(failure.operation_position, lastEdit);
    return !successfulVerifiers.some((success) =>
      success.signature === failure.signature &&
      success.operation_position > minimumSuccessPosition
    );
  });
  const required = failedVerifiers.length > 0;

  const successfulAfterFinalEdit = successfulVerifiers.filter((item) =>
    lastEdit < 0 || item.operation_position > lastEdit
  );

  return {
    contract: CODE_AI_REPAIR_CLOSURE_CONTRACT,
    required,
    verified: unresolved.length === 0,
    final_edit_position: lastEdit,
    failed_verifier_count: failedVerifiers.length,
    failed_verifier_count_before_final_edit:
      failedVerifiers.filter((item) => lastEdit >= 0 && item.operation_position < lastEdit).length,
    failed_verifier_count_after_final_edit:
      failedVerifiers.filter((item) => lastEdit >= 0 && item.operation_position > lastEdit).length,
    closed_failed_verifier_count: failedVerifiers.length - unresolved.length,
    unresolved_failed_verifier_count: unresolved.length,
    unresolved_failed_verifiers: unresolved.slice(0, 12).map((item) => ({
      operation_id: item.operation_id,
      operation_position: item.operation_position,
      command: item.command,
      args: item.args,
      exit_code: item.exit_code,
    })),
    successful_post_edit_verifiers: successfulAfterFinalEdit.slice(0, 20).map((item) => ({
      operation_id: item.operation_id,
      command: item.command,
      args: item.args,
    })),
    closure_rule: "SAME_VERIFICATION_COMMAND_SIGNATURE_MUST_PASS_AFTER_FAILURE_AND_FINAL_EDIT",
    model_call_performed: false,
    provider_call_performed: false,
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIRepairClosureRuntime = Object.freeze({
  contract: CODE_AI_REPAIR_CLOSURE_CONTRACT,
  assess: assessCodeAIRepairClosure,
});

export default CodeAIRepairClosureRuntime;
