export const CODE_PRODUCT_COMPLETION_CRITERIA_CONTRACT =
  "AVANTIQO_CODE_PRODUCT_COMPLETION_CRITERIA_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function codeProductCompletionCriteria(state) {
  const context = object(state?.objective_context);
  return [
    context.completion_criterion_1,
    context.completion_criterion_2,
    context.completion_criterion_3,
    context.completion_criterion_4,
    context.completion_criterion_5,
    context.completion_criterion_6,
  ]
    .map((criterion) => text(criterion, 700))
    .filter(Boolean);
}

function codeProductCompletionOperationEvidence(state, operationIds) {
  const wanted = new Set(
    list(operationIds)
      .map((operationId) => text(operationId, 200))
      .filter(Boolean),
  );
  const operationEntries = new Map();
  for (const entry of list(state?.evidence)) {
    const operationId = text(entry?.operation_id, 200);
    if (
      entry?.kind === "operation" &&
      operationId &&
      wanted.has(operationId)
    ) {
      operationEntries.set(operationId, entry);
    }
  }
  const testsById = new Map(
    list(state?.tests)
      .map((item) => [text(item?.operation_id, 200), item])
      .filter(([operationId]) => operationId && wanted.has(operationId)),
  );
  const verificationById = new Map(
    list(state?.verification)
      .map((item) => [text(item?.operation_id, 200), item])
      .filter(([operationId]) => operationId && wanted.has(operationId)),
  );

  return [...wanted].map((operationId) => {
    const entry = object(operationEntries.get(operationId));
    const test = object(testsById.get(operationId));
    const verification = object(verificationById.get(operationId));
    const numericExitCode = Number(test.exit_code);
    return {
      operation_id: operationId,
      action: text(entry.action, 80) || null,
      description: text(entry.description, 1200) || null,
      status: text(entry.status, 100) || null,
      verification_passed:
        Object.keys(verification).length ? verification.passed === true : null,
      command: text(test.command, 200) || null,
      args: list(test.args)
        .map((arg) => text(arg, 200))
        .filter(Boolean)
        .slice(0, 20),
      exit_code: Number.isFinite(numericExitCode) ? numericExitCode : null,
      changed_files: list(entry?.result?.written)
        .map((item) => text(item?.path, 500))
        .filter(Boolean)
        .slice(0, 20),
    };
  }).filter((item) =>
    item.action ||
    item.description ||
    item.command ||
    item.verification_passed !== null ||
    item.changed_files.length > 0,
  );
}

export function projectCodeProductCompletionCriteria(state) {
  const criteria = codeProductCompletionCriteria(state);
  if (!criteria.length) {
    return {
      contract: CODE_PRODUCT_COMPLETION_CRITERIA_CONTRACT,
      required: false,
      criteria: [],
      criteria_count: 0,
      evidence_count: 0,
      criteria_evidence: [],
      referenced_operations: [],
      referenced_operation_count: 0,
      verified: true,
      authorization_effect: "NONE",
    };
  }

  const observedOperationIds = new Set([
    ...list(state?.completed_operation_ids)
      .map((item) => text(item, 200))
      .filter(Boolean),
    ...list(state?.verification)
      .map((item) => text(item?.operation_id, 200))
      .filter(Boolean),
  ]);
  const evidenceEntry = [...list(state?.evidence)]
    .reverse()
    .find((item) =>
      item?.kind === "product_completion_criteria_evidence" &&
      item?.verified === true,
    );
  const supplied = list(evidenceEntry?.criteria_evidence);
  const byCriterion = new Map();
  let invalid = false;

  for (const item of supplied) {
    const criterion = text(item?.criterion, 700);
    if (!criteria.includes(criterion)) {
      invalid = true;
      continue;
    }
    const operationIds = [...new Set(
      list(item?.evidence_operation_ids)
        .map((operationId) => text(operationId, 200))
        .filter(Boolean),
    )].slice(0, 12);
    if (
      !operationIds.length ||
      operationIds.some((operationId) => !observedOperationIds.has(operationId))
    ) {
      invalid = true;
      continue;
    }
    const existing = byCriterion.get(criterion) || [];
    byCriterion.set(
      criterion,
      [...new Set([...existing, ...operationIds])].slice(0, 12),
    );
  }

  const criteriaEvidence = criteria.map((criterion) => ({
    criterion,
    evidence_operation_ids: byCriterion.get(criterion) || [],
  }));
  const referencedOperationIds = [...new Set(
    criteriaEvidence.flatMap((item) => item.evidence_operation_ids),
  )];
  const referencedOperations = codeProductCompletionOperationEvidence(
    state,
    referencedOperationIds,
  );
  const projectedOperationIds = new Set(
    referencedOperations.map((item) => item.operation_id),
  );
  const verified =
    !invalid &&
    criteria.every((criterion) => byCriterion.has(criterion)) &&
    referencedOperationIds.every((operationId) => projectedOperationIds.has(operationId));

  return {
    contract: CODE_PRODUCT_COMPLETION_CRITERIA_CONTRACT,
    required: true,
    criteria,
    criteria_count: criteria.length,
    evidence_count: byCriterion.size,
    criteria_evidence: criteriaEvidence,
    referenced_operations: referencedOperations,
    referenced_operation_count: referencedOperations.length,
    verified,
    authorization_effect: "NONE",
  };
}

export function assertCodeProductCompletionCriteriaVerified(
  state,
  errorCode = "CODE_AI_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED",
) {
  const projection = projectCodeProductCompletionCriteria(state);
  if (projection.required && projection.verified !== true) {
    throw new Error(errorCode);
  }
  return projection;
}

export const CodeProductCompletionCriteriaRuntime = Object.freeze({
  contract: CODE_PRODUCT_COMPLETION_CRITERIA_CONTRACT,
  criteria: codeProductCompletionCriteria,
  project: projectCodeProductCompletionCriteria,
  verify: assertCodeProductCompletionCriteriaVerified,
});

export default CodeProductCompletionCriteriaRuntime;
