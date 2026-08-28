export const CODE_PRODUCT_COMPLETION_CRITERIA_CONTRACT =
  "AVANTIQO_CODE_PRODUCT_COMPLETION_CRITERIA_V2";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function sameStringSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
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

function completedOperationEntries(state) {
  return list(state?.evidence).filter((entry) =>
    entry?.kind === "operation" &&
    text(entry?.operation_id, 200) &&
    text(entry?.status, 100) === "completed"
  );
}

function successfulVerificationOperationIds(state) {
  const passed = new Set(
    list(state?.verification)
      .filter((item) => item?.passed === true)
      .map((item) => text(item?.operation_id, 200))
      .filter(Boolean),
  );
  return completedOperationEntries(state)
    .filter((entry) =>
      text(entry?.action, 80) === "verify" &&
      passed.has(text(entry?.operation_id, 200))
    )
    .map((entry) => text(entry.operation_id, 200));
}

function verificationTestByOperationId(state) {
  return new Map(
    list(state?.tests)
      .map((item) => [text(item?.operation_id, 200), object(item)])
      .filter(([operationId]) => operationId),
  );
}

function commandSignature(test = {}) {
  const command = text(test?.command, 300);
  const args = list(test?.args).map((arg) => text(arg, 1000)).filter(Boolean);
  return [command, ...args].filter(Boolean).join(" ").trim();
}

function authoritativeVerificationOperationIds(state) {
  const objective = text(state?.objective, 12000).toLowerCase();
  if (!objective.includes("authoritative verification command")) return [];
  const tests = verificationTestByOperationId(state);
  return successfulVerificationOperationIds(state).filter((operationId) => {
    const signature = commandSignature(tests.get(operationId)).toLowerCase();
    if (!signature) return false;
    return objective.includes(`authoritative verification command is ${signature}`);
  });
}

function finalDiffOperationId(state) {
  const entries = completedOperationEntries(state);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (text(entries[index]?.action, 80) === "diff") {
      return text(entries[index]?.operation_id, 200) || null;
    }
  }
  return null;
}

function explicitAllowedChangePaths(state) {
  const objective = text(state?.objective, 12000);
  const marker = "Only these source files may be edited:";
  const markerIndex = objective.indexOf(marker);
  if (markerIndex < 0) return [];
  let scopeText = objective.slice(markerIndex + marker.length, markerIndex + marker.length + 3000);
  const stopPhrases = [
    " Use the source evidence",
    " Apply coherent edits",
    " Do not push",
    " Do not deploy",
    "\n",
  ];
  const stopIndexes = stopPhrases
    .map((phrase) => scopeText.indexOf(phrase))
    .filter((index) => index >= 0);
  if (stopIndexes.length) scopeText = scopeText.slice(0, Math.min(...stopIndexes));
  return unique(
    scopeText.match(
      /[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)+\.(?:js|jsx|ts|tsx|mjs|cjs|json|sql|py|go|rs|java|kt|rb|php|swift|c|cc|cpp|h|hpp|md|yaml|yml)/g,
    ) || [],
  );
}

function deterministicCompletionEvidence(state, criteria) {
  const byCriterion = new Map();
  const rules = [];
  const authoritativeVerifyIds = authoritativeVerificationOperationIds(state);
  const diffId = finalDiffOperationId(state);
  const allowedPaths = explicitAllowedChangePaths(state);
  const changedPaths = unique(state?.files_changed);
  const exactScopeObserved =
    allowedPaths.length > 0 &&
    sameStringSet(allowedPaths, changedPaths);
  const tests = verificationTestByOperationId(state);
  const authoritativeSignatures = authoritativeVerifyIds
    .map((operationId) => commandSignature(tests.get(operationId)))
    .filter(Boolean);

  criteria.forEach((criterion) => {
    const lower = criterion.toLowerCase();
    const evidenceIds = new Set();
    const criterionRules = [];

    const exactCommandCriterion = authoritativeSignatures.some((signature) =>
      lower.includes(signature.toLowerCase()) &&
      /\b(pass|passes|passed|succeed|succeeds|successful)\b/.test(lower)
    );
    if (exactCommandCriterion) {
      authoritativeVerifyIds.forEach((operationId) => evidenceIds.add(operationId));
      criterionRules.push("AUTHORITATIVE_VERIFICATION_COMMAND_PASSED");
    }

    if (
      exactScopeObserved &&
      diffId &&
      /\bonly\b/.test(lower) &&
      /\b(file|files|source|path|paths)\b/.test(lower) &&
      /\b(change|changed|edit|edited|modify|modified)\b/.test(lower)
    ) {
      evidenceIds.add(diffId);
      criterionRules.push("EXPLICIT_ALLOWED_CHANGE_SET_MATCHED");
    }

    if (
      authoritativeVerifyIds.length > 0 &&
      diffId &&
      lower.includes("final diff")
    ) {
      authoritativeVerifyIds.forEach((operationId) => evidenceIds.add(operationId));
      evidenceIds.add(diffId);
      criterionRules.push("AUTHORITATIVE_VERIFICATION_PLUS_FINAL_DIFF");
    }

    if (evidenceIds.size) {
      byCriterion.set(criterion, [...evidenceIds].slice(0, 12));
      rules.push({
        criterion,
        rules: criterionRules,
        evidence_operation_ids: [...evidenceIds].slice(0, 12),
      });
    }
  });

  return {
    byCriterion,
    rules,
    authoritative_verification_operation_ids: authoritativeVerifyIds,
    explicit_allowed_change_paths: allowedPaths,
    exact_allowed_change_set_observed: exactScopeObserved,
    final_diff_operation_id: diffId,
  };
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
      deterministic_evidence_count: 0,
      deterministic_evidence_rules: [],
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

  const deterministic = deterministicCompletionEvidence(state, criteria);
  for (const [criterion, operationIds] of deterministic.byCriterion.entries()) {
    const validIds = operationIds.filter((operationId) => observedOperationIds.has(operationId));
    if (!validIds.length) continue;
    const existing = byCriterion.get(criterion) || [];
    byCriterion.set(
      criterion,
      [...new Set([...existing, ...validIds])].slice(0, 12),
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
    deterministic_evidence_count: deterministic.rules.length,
    deterministic_evidence_rules: deterministic.rules,
    authoritative_verification_operation_ids:
      deterministic.authoritative_verification_operation_ids,
    explicit_allowed_change_paths:
      deterministic.explicit_allowed_change_paths,
    exact_allowed_change_set_observed:
      deterministic.exact_allowed_change_set_observed,
    final_diff_operation_id:
      deterministic.final_diff_operation_id,
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
