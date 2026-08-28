export const CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT =
  "AVANTIQO_CODE_AI_WORK_PACKAGE_PROMPT_TRANSPORT_V1";
export const CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS = 24000;
export const CODE_AI_WORK_PACKAGE_MAX_STATE_CHARS = 14000;
export const CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS = 30000;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function rawText(value) {
  return String(value ?? "");
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedText(value, maximum) {
  const source = rawText(value).trim();
  if (source.length <= maximum) return source;
  const suffix = `\n...[work-package transport truncated ${source.length - maximum} chars]`;
  return `${source.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`;
}

function jsonText(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function evidencePath(entry) {
  const source = object(entry);
  const result = object(source.result);
  return text(result.file_path || result.path, 1000);
}

function declaredEvidencePaths(objectiveContext) {
  const source = object(objectiveContext);
  return new Set([
    source.evidence_path_1,
    source.evidence_path_2,
    source.evidence_path_3,
    source.evidence_path_4,
  ].map((value) => text(value, 1000)).filter(Boolean));
}

function profileLimits(profile) {
  if (profile === "critical") {
    return {
      current_source_items: 2,
      current_source_chars: 1600,
      read_items: 2,
      read_chars: 900,
      other_evidence_items: 2,
      repository_instructions: 240,
      repository_commands: 180,
      repository_workflows: 100,
      repository_summary: 100,
      test_items: 0,
      test_output: 0,
      failure_items: 1,
      failure_chars: 420,
      verification_items: 2,
      patch_chars: 0,
      completed_operation_items: 12,
      changed_file_items: 12,
    };
  }
  if (profile === "minimal") {
    return {
      current_source_items: 2,
      current_source_chars: 2600,
      read_items: 2,
      read_chars: 1700,
      other_evidence_items: 3,
      repository_instructions: 500,
      repository_commands: 300,
      repository_workflows: 140,
      repository_summary: 160,
      test_items: 1,
      test_output: 450,
      failure_items: 2,
      failure_chars: 700,
      verification_items: 3,
      patch_chars: 700,
      completed_operation_items: 20,
      changed_file_items: 20,
    };
  }
  if (profile === "reduced") {
    return {
      current_source_items: 3,
      current_source_chars: 3600,
      read_items: 3,
      read_chars: 2600,
      other_evidence_items: 4,
      repository_instructions: 900,
      repository_commands: 500,
      repository_workflows: 220,
      repository_summary: 260,
      test_items: 2,
      test_output: 700,
      failure_items: 3,
      failure_chars: 900,
      verification_items: 4,
      patch_chars: 1400,
      completed_operation_items: 32,
      changed_file_items: 30,
    };
  }
  return {
    current_source_items: 4,
    current_source_chars: 5000,
    read_items: 4,
    read_chars: 4200,
    other_evidence_items: 5,
    repository_instructions: 1500,
    repository_commands: 800,
    repository_workflows: 360,
    repository_summary: 400,
    test_items: 2,
    test_output: 900,
    failure_items: 3,
    failure_chars: 1100,
    verification_items: 5,
    patch_chars: 2200,
    completed_operation_items: 40,
    changed_file_items: 40,
  };
}

function compactRepositoryGuidance(value, limits) {
  const source = object(value);
  return {
    contract: text(source.contract, 160) || null,
    instructions_text: boundedText(source.instructions_text, limits.repository_instructions),
    verification_commands_text: boundedText(source.verification_commands_text, limits.repository_commands),
    ci_workflows_text: boundedText(source.ci_workflows_text, limits.repository_workflows),
    monorepo_summary: boundedText(source.monorepo_summary, limits.repository_summary),
  };
}

function compactCurrentSourceChanges(value, limits) {
  return list(value)
    .slice(-limits.current_source_items)
    .map((candidate) => {
      const source = object(candidate);
      const operation = text(source.operation, 40).toLowerCase() || "write";
      const content = rawText(source.content);
      return {
        path: text(source.path, 1000) || null,
        operation,
        content: operation === "delete" ? null : boundedText(content, limits.current_source_chars),
        content_truncated_for_transport:
          operation !== "delete" && content.length > limits.current_source_chars,
      };
    })
    .filter((entry) => entry.path);
}

function compactLatestFailure(value, limits) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  return {
    operation_id: text(source.operation_id, 200) || null,
    command: text(source.command, 300) || null,
    args: list(source.args).slice(0, 20).map((item) => text(item, 400)),
    exit_code: Number.isFinite(Number(source.exit_code)) ? Number(source.exit_code) : null,
    stdout: boundedText(source.stdout, limits.failure_chars),
    stderr: boundedText(source.stderr, limits.failure_chars),
    failure_message: boundedText(source.failure_message, limits.failure_chars),
  };
}

function compactTest(value, limits) {
  const source = object(value);
  return {
    operation_id: text(source.operation_id, 200) || null,
    command: text(source.command, 300) || null,
    args: list(source.args).slice(0, 16).map((item) => text(item, 400)),
    exit_code: Number.isFinite(Number(source.exit_code)) ? Number(source.exit_code) : null,
    stdout: boundedText(source.stdout, limits.test_output),
    stderr: boundedText(source.stderr, limits.test_output),
  };
}

function compactEvidence(entry, limits, currentSourcePaths) {
  const source = object(entry);
  const action = text(source.action, 80).toLowerCase();
  const result = object(source.result);
  const base = {
    operation_id: text(source.operation_id, 200) || null,
    action,
    status: text(source.status, 80) || null,
  };
  if (action === "read") {
    const filePath = evidencePath(source);
    const superseded = currentSourcePaths.has(filePath);
    return {
      ...base,
      result: {
        file_path: filePath || null,
        start_line: result.start_line ?? null,
        end_line: result.end_line ?? null,
        total_lines: result.total_lines ?? null,
        content: superseded
          ? "[superseded by current_source_changes]"
          : boundedText(result.content, limits.read_chars),
      },
    };
  }
  if (action === "verify" || action === "run") {
    return {
      ...base,
      result: {
        command: text(result.command, 300) || null,
        args: list(result.args).slice(0, 16).map((item) => text(item, 400)),
        exit_code: result.exit_code ?? null,
        stdout: boundedText(result.stdout, limits.test_output || 240),
        stderr: boundedText(result.stderr, limits.test_output || 240),
      },
    };
  }
  if (action === "diff") {
    return {
      ...base,
      result: {
        status: list(result.status).slice(0, 20),
        patch_bytes: result.patch_bytes ?? null,
      },
    };
  }
  if (action === "search") {
    return {
      ...base,
      result: {
        query: text(result.query, 700) || null,
        match_count: result.match_count ?? null,
        matches: list(result.matches).slice(0, 8).map((item) => boundedText(item, 400)),
      },
    };
  }
  return {
    ...base,
    result: { summary: boundedText(jsonText(result), 600) },
  };
}

function promptState(compactState, objectiveContext, profile) {
  const source = object(compactState);
  const limits = profileLimits(profile);
  const declaredPaths = declaredEvidencePaths(objectiveContext);
  const currentSourceChanges = compactCurrentSourceChanges(source.current_source_changes, limits);
  const currentSourcePaths = new Set(currentSourceChanges.map((entry) => entry.path).filter(Boolean));
  const evidence = [...list(source.declared_evidence_reads), ...list(source.evidence)];
  const latestReadByPath = new Map();
  for (const entry of evidence) {
    if (text(entry?.action, 80).toLowerCase() !== "read") continue;
    if (text(entry?.status, 80).toLowerCase() !== "completed") continue;
    const filePath = evidencePath(entry);
    if (filePath) latestReadByPath.set(filePath, entry);
  }
  const reads = [...latestReadByPath.values()];
  const declaredReads = declaredPaths.size
    ? reads.filter((entry) => declaredPaths.has(evidencePath(entry)))
    : [];
  const selectedReads = (declaredReads.length ? declaredReads : reads)
    .slice(-limits.read_items)
    .map((entry) => compactEvidence(entry, limits, currentSourcePaths));
  const selectedOtherEvidence = list(source.evidence)
    .filter((entry) => text(entry?.action, 80).toLowerCase() !== "read")
    .slice(-limits.other_evidence_items)
    .map((entry) => compactEvidence(entry, limits, currentSourcePaths));
  const latestFailedVerification = compactLatestFailure(source.latest_failed_verification, limits);
  const repairState = currentSourceChanges.length > 0 || Boolean(latestFailedVerification);

  return {
    mission_id: text(source.mission_id, 200) || null,
    base_commit: text(source.base_commit, 160) || null,
    status: text(source.status, 100) || null,
    files_changed: list(source.files_changed).slice(-limits.changed_file_items),
    completed_operation_ids: list(source.completed_operation_ids).slice(-limits.completed_operation_items),
    repository_guidance: compactRepositoryGuidance(source.repository_guidance, limits),
    current_source_changes: currentSourceChanges,
    latest_failed_verification: latestFailedVerification,
    tests: latestFailedVerification
      ? []
      : list(source.tests).slice(-limits.test_items).map((entry) => compactTest(entry, limits)),
    failures: list(source.failures)
      .slice(-limits.failure_items)
      .map((entry) => ({
        operation_id: text(entry?.operation_id, 200) || null,
        action: text(entry?.action, 80) || null,
        message: boundedText(entry?.message, limits.failure_chars),
      })),
    verification: list(source.verification).slice(-limits.verification_items),
    patch: repairState || !limits.patch_chars
      ? null
      : boundedText(source.patch, limits.patch_chars) || null,
    evidence: [...selectedReads, ...selectedOtherEvidence],
    declared_evidence_paths: [...declaredPaths],
    durable_declared_evidence_retained: declaredReads.length > 0,
    repair_state: repairState,
    transport_compaction_profile: profile,
    stale_history_dropped_before_current_source: true,
  };
}

function stateJsonWithinBudget(compactState, objectiveContext, maximumChars) {
  for (const profile of ["normal", "reduced", "minimal", "critical"]) {
    const candidate = promptState(compactState, objectiveContext, profile);
    const serialized = jsonText(candidate);
    if (serialized.length <= maximumChars) {
      return { serialized, profile };
    }
  }
  throw new Error(`CODE_AI_WORK_PACKAGE_STATE_BUDGET_EXCEEDED:${maximumChars}`);
}

export function buildCodeAIWorkPackagePromptTransport({
  sections = [],
  compact_state = null,
  objective_context = null,
} = {}) {
  const staticText = list(sections)
    .map((section) => text(section, 12000))
    .filter(Boolean)
    .join("\n\n");
  if (!staticText) throw new Error("CODE_AI_WORK_PACKAGE_PROMPT_STATIC_TEXT_REQUIRED");
  const statePrefix = "\n\nCURRENT OBSERVED STATE:\n\n";
  const stateBudget = Math.min(
    CODE_AI_WORK_PACKAGE_MAX_STATE_CHARS,
    CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS - staticText.length - statePrefix.length,
  );
  if (stateBudget < 3000) {
    throw new Error(`CODE_AI_WORK_PACKAGE_STATIC_PROMPT_BUDGET_EXCEEDED:${stateBudget}`);
  }
  const state = stateJsonWithinBudget(compact_state, objective_context, stateBudget);
  const instruction = `${staticText}${statePrefix}${state.serialized}`;
  if (instruction.length > CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS) {
    throw new Error(
      `CODE_AI_WORK_PACKAGE_INSTRUCTION_BUDGET_EXCEEDED:${instruction.length}:${CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS}`,
    );
  }
  return {
    contract: CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
    instruction,
    instruction_chars: instruction.length,
    state_chars: state.serialized.length,
    state_profile: state.profile,
    max_instruction_chars: CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
    worker_instruction_hard_limit_chars: CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
    headroom_to_worker_limit_chars:
      CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS - instruction.length,
    raw_reasoning_persisted: false,
  };
}

export const CodeAIWorkPackagePromptRuntime = Object.freeze({
  contract: CODE_AI_WORK_PACKAGE_PROMPT_CONTRACT,
  max_instruction_chars: CODE_AI_WORK_PACKAGE_MAX_INSTRUCTION_CHARS,
  max_state_chars: CODE_AI_WORK_PACKAGE_MAX_STATE_CHARS,
  worker_instruction_hard_limit_chars: CODE_AI_WORKER_INSTRUCTION_HARD_LIMIT_CHARS,
  build: buildCodeAIWorkPackagePromptTransport,
});
