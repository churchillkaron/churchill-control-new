import {
  normalizeCodeAIVerifierEnvironment,
} from "./CodeAIVerifierIdentityRuntime.js";

export const CODE_AI_PLANNER_PROMPT_CONTRACT =
  "AVANTIQO_CODE_AI_PLANNER_PROMPT_TRANSPORT_V1";
export const CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS = 16000;
export const CODE_AI_PLANNER_MAX_STATE_CHARS = 7500;

const MAX_REPOSITORY_GUIDANCE_INSTRUCTIONS = 3600;
const MAX_REPOSITORY_GUIDANCE_COMMANDS = 1800;
const MAX_REPOSITORY_GUIDANCE_WORKFLOWS = 800;
const MAX_READ_CONTENT = 4200;

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

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function boundedText(value, maximum) {
  const source = rawText(value).trim();
  if (source.length <= maximum) return source;
  const suffix = `\n...[planner transport truncated ${source.length - maximum} chars]`;
  return `${source.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`;
}

function jsonText(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function compactObjectiveContext(value, profile = "normal") {
  const source = object(value);
  const minimal = profile === "minimal";
  const pathLimit = minimal ? 2 : 4;
  const candidate = {
    mission_id: text(source.mission_id, 240) || null,
    repository_head_observed: text(source.repository_head_observed, 160) || null,
    selection_contract: text(source.selection_contract, 160) || null,
    evidence_backed: source.evidence_backed === true ? true : null,
    evidence_paths: [source.evidence_path_1, source.evidence_path_2, source.evidence_path_3, source.evidence_path_4]
      .map((item) => text(item, 1000)).filter(Boolean).slice(0, pathLimit),
    pre_edit_inspection_paths: list(source.pre_edit_inspection_paths).slice(0, pathLimit).map((item) => text(item, 1000)).filter(Boolean),
    authoritative_verification_command: text(source.authoritative_verification_command, 300) || null,
    authoritative_verification_args: list(source.authoritative_verification_args).slice(0, minimal ? 8 : 24).map((item) => text(item, 500)).filter(Boolean),
    allowed_edit_paths: list(source.allowed_edit_paths).slice(0, minimal ? 20 : 80).map((item) => text(item, 1000)).filter(Boolean),
    implementation_required: source.implementation_required === true ? true : null,
    completion_criteria: Array.from({ length: 6 }, (_, index) => text(source[`completion_criterion_${index + 1}`], 700)).filter(Boolean),
    owner_constraints: list(source.owner_constraints).slice(-8).map((item) => text(item, 500)).filter(Boolean),
    owner_objective: boundedText(source.owner_objective, minimal ? 1800 : 5000) || null,
    failed_capability_key: text(source.failed_capability_key, 240) || null,
    platform_self_healing: source.platform_self_healing === true ? true : null,
    background_no_progress_replan: source.background_no_progress_replan === true ? true : null,
    organization_id: text(source.organization_id, 200) || null,
    workspace_target: text(source.workspace_target, 80).toUpperCase() || null,
    device_id: text(source.device_id, 160) || null,
    device_session_id: text(source.device_session_id, 160) || null,
    authority: "CONTEXT_ONLY",
    authorization_effect: "NONE",
  };
  return Object.fromEntries(Object.entries(candidate).filter(([, item]) =>
    item !== null && item !== undefined && item !== "" && (!Array.isArray(item) || item.length > 0)
  ));
}

function compactRepositoryGuidance(value, profile = "normal") {
  const source = object(value);
  const reduced = profile !== "normal";
  const minimal = profile === "minimal";
  return {
    contract: text(source.contract, 160) || null,
    instructions_text: boundedText(
      source.instructions_text,
      minimal ? 600 : reduced ? 1700 : MAX_REPOSITORY_GUIDANCE_INSTRUCTIONS,
    ),
    verification_commands_text: boundedText(
      source.verification_commands_text,
      minimal ? 320 : reduced ? 900 : MAX_REPOSITORY_GUIDANCE_COMMANDS,
    ),
    ci_workflows_text: boundedText(
      source.ci_workflows_text,
      minimal ? 160 : reduced ? 400 : MAX_REPOSITORY_GUIDANCE_WORKFLOWS,
    ),
    monorepo_summary: boundedText(source.monorepo_summary, minimal ? 180 : 600),
    instruction_scope_rule: boundedText(source.instruction_scope_rule, minimal ? 180 : 600),
    authorization_effect: "NONE",
    permission_effect: "NONE",
  };
}

function compactRunResult(result, profile = "normal") {
  const source = object(result);
  const outputLimit = profile === "minimal" ? 300 : profile === "reduced" ? 600 : 1000;
  return {
    command: text(source.command, 200) || null,
    args: list(source.args).slice(0, 20).map((item) => text(item, 400)),
    env: normalizeCodeAIVerifierEnvironment(source.env),
    cwd: text(source.cwd, 1000) || null,
    exit_code: integer(source.exit_code),
    stdout: boundedText(source.stdout, outputLimit),
    stderr: boundedText(source.stderr, outputLimit),
  };
}

function compactReadResult(result, profile = "normal") {
  const source = object(result);
  const contentLimit = profile === "minimal"
    ? 1200
    : profile === "reduced"
      ? 2600
      : MAX_READ_CONTENT;
  const content = rawText(source.content);
  return {
    file_path: text(source.file_path || source.path, 1000) || null,
    start_line: integer(source.start_line),
    end_line: integer(source.end_line),
    total_lines: integer(source.total_lines),
    content: boundedText(content, contentLimit),
    content_truncated_for_transport: content.length > contentLimit,
  };
}

function compactInspectResult(result) {
  const source = object(result);
  const intelligence = object(source.repository_intelligence);
  const workspace = object(intelligence.workspace);
  return {
    contract: text(source.contract, 160) || null,
    head_sha: text(source.head_sha || source.base_commit, 160) || null,
    clean: typeof source.clean === "boolean" ? source.clean : null,
    package_manager: text(source.package_manager, 120) || null,
    tracked_file_count: integer(source.tracked_file_count),
    repository_intelligence_contract: text(intelligence.contract, 160) || null,
    monorepo: workspace.monorepo === true,
    mixed_language: workspace.mixed_language === true,
    nested_build_root_count_observed: integer(workspace.nested_build_root_count_observed),
    build_systems: list(intelligence.detected_build_systems).slice(0, 16).map((entry) => {
      if (typeof entry === "string") return text(entry, 160);
      const item = object(entry);
      return {
        id: text(item.id, 120) || null,
        language: text(item.language, 120) || null,
        roots: list(item.roots).slice(0, 8).map((root) => text(root, 500)),
      };
    }),
  };
}

function compactDiffResult(result, profile = "normal") {
  const source = object(result);
  const patchLimit = profile === "minimal" ? 1600 : profile === "reduced" ? 2800 : 4600;
  return {
    status: list(source.status).slice(0, 40).map((item) => text(item, 1000)),
    patch: boundedText(source.patch, patchLimit),
    patch_bytes: integer(source.patch_bytes),
    diff_check: compactRunResult(source.diff_check, "minimal"),
  };
}

function compactOperationEvidence(entry, profile = "normal") {
  const source = object(entry);
  const action = text(source.action, 80);
  const result = object(source.result);
  let compactResult = null;
  if (action === "inspect") compactResult = compactInspectResult(result);
  else if (action === "read") compactResult = compactReadResult(result, profile);
  else if (action === "run" || action === "verify") compactResult = compactRunResult(result, profile);
  else if (action === "diff") compactResult = compactDiffResult(result, profile);
  else if (action === "search") {
    compactResult = {
      mode: text(result.mode, 80) || null,
      query: text(result.query, 1000) || null,
      paths: list(result.paths).slice(0, 20).map((item) => text(item, 1000)),
      path_globs: list(result.path_globs).slice(0, 20).map((item) => text(item, 1000)),
      match_count: integer(result.match_count),
      truncated: result.truncated === true,
      matches: list(result.matches).slice(0, profile === "minimal" ? 8 : 20).map((item) =>
        boundedText(item, profile === "minimal" ? 500 : 900)
      ),
    };
  } else if (action === "apply_files") {
    compactResult = {
      contract: text(result.contract, 160) || null,
      valid: result.valid === true,
      files_changed: list(result.files_changed).slice(0, 30).map((item) => text(item, 1000)),
      mutations: list(result.mutations).slice(0, 30).map((item) => object(item).mutation || item),
    };
  } else {
    compactResult = {
      summary: boundedText(jsonText(result), profile === "minimal" ? 700 : 1800),
    };
  }
  return {
    at: text(source.at, 80) || null,
    kind: "operation",
    operation_id: text(source.operation_id, 200) || null,
    action,
    description: boundedText(source.description, 700),
    status: text(source.status, 120) || null,
    result: compactResult,
  };
}

function compactPlannerEvidence(entry, profile = "normal") {
  const source = object(entry);
  const kind = text(source.kind, 120);
  if (!kind || kind === "repository_guidance") return null;
  if (kind === "operation") return compactOperationEvidence(source, profile);
  const decision = object(source.decision);
  return {
    at: text(source.at, 80) || null,
    kind,
    iteration: integer(source.iteration),
    operation_id: text(source.operation_id, 200) || null,
    action: text(source.action, 80) || null,
    status: text(source.status, 120) || null,
    reason: boundedText(source.reason, 700),
    error: boundedText(source.error, 700),
    message: boundedText(source.message, 700),
    provider: text(source.provider, 120) || null,
    provider_job_id: text(source.provider_job_id, 240) || null,
    usage_id: text(source.usage_id, 240) || null,
    previous_base_commit: text(source.previous_base_commit, 160) || null,
    current_base_commit: text(source.current_base_commit, 160) || null,
    verified: source.verified === true ? true : undefined,
    criteria_count: integer(source.criteria_count),
    authorization_effect: text(source.authorization_effect, 120) || null,
    selection_contract: text(source.selection_contract, 160) || null,
    selected_candidate_id: text(source.selected_candidate_id, 160) || null,
    evidence_backed: source.evidence_backed === true ? true : undefined,
    decision: Object.keys(decision).length
      ? {
          action: text(decision.action, 80) || null,
          description: boundedText(decision.description, 500),
          reason: boundedText(decision.reason, 500),
        }
      : undefined,
    criteria_evidence: list(source.criteria_evidence).slice(0, 6).map((item) => ({
      criterion: boundedText(item?.criterion, 700),
      evidence_operation_ids: list(item?.evidence_operation_ids).slice(0, 12).map((id) => text(id, 200)),
    })),
  };
}

function plannerEvidenceSemanticKey(entry) {
  const source = object(entry);
  const result = object(source.result);
  const action = text(source.action, 80);
  const filePath = text(result.file_path || result.path, 1000);
  const contentSha = text(result.content_sha256, 80);
  const exitCode = integer(result.exit_code);
  const command = text(result.command, 300);
  const query = text(source?.input?.query || source?.input?.pattern || result.query, 1000);
  if (action === "read" && filePath) {
    return `read:${filePath}:${contentSha || [result.start_line, result.end_line, result.total_lines].join(":")}`;
  }
  if ((action === "verify" || action === "run") && command) {
    return `${action}:${command}:${jsonText(result.args || [])}:${exitCode}`;
  }
  if (action === "search" && query) {
    return `search:${query}:${jsonText(result.matches || result.paths || [])}`;
  }
  const kind = text(source.kind, 120);
  const operationId = text(source.operation_id, 200);
  return [kind, action, operationId].filter(Boolean).join(":") || jsonText(source);
}

function deduplicateNewestSemanticEvidence(entries) {
  const seen = new Set();
  const selected = [];
  for (const entry of [...list(entries)].reverse()) {
    if (!entry) continue;
    const key = plannerEvidenceSemanticKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.unshift(entry);
  }
  return selected;
}

function newestWithinBudget(entries, maximumChars, maximumItems) {
  const selected = [];
  let used = 2;
  for (const entry of [...deduplicateNewestSemanticEvidence(entries)].reverse()) {
    if (!entry || selected.length >= maximumItems) continue;
    const size = jsonText(entry).length + 1;
    if (used + size > maximumChars) continue;
    selected.unshift(entry);
    used += size;
  }
  return selected;
}

function compactTest(entry, profile = "normal") {
  const source = object(entry);
  const outputLimit = profile === "minimal" ? 200 : profile === "reduced" ? 400 : 800;
  return {
    operation_id: text(source.operation_id, 200) || null,
    command: text(source.command, 200) || null,
    args: list(source.args).slice(0, 20).map((item) => text(item, 400)),
    env: normalizeCodeAIVerifierEnvironment(source.env),
    cwd: text(source.cwd, 1000) || null,
    exit_code: integer(source.exit_code),
    stdout: boundedText(source.stdout, outputLimit),
    stderr: boundedText(source.stderr, outputLimit),
  };
}

function compactFailure(entry) {
  const source = object(entry);
  return {
    at: text(source.at, 80) || null,
    operation_id: text(source.operation_id, 200) || null,
    action: text(source.action, 80) || null,
    message: boundedText(source.message || source.reason || source.error, 700),
  };
}

function compactRepair(entry) {
  const source = object(entry);
  return {
    at: text(source.at, 80) || null,
    operation_id: text(source.operation_id, 200) || null,
    action: text(source.action, 80) || null,
    files: list(source.files).slice(0, 30).map((item) => text(item, 1000)),
    mutation: text(source.mutation, 80) || null,
  };
}

function prioritizedSourceReads(source) {
  const objectiveContext = object(source?.objective_context);
  const changed = new Set(list(source?.files_changed).map((item) => text(item, 1000)).filter(Boolean));
  const required = new Set([
    ...list(objectiveContext.pre_edit_inspection_paths),
    objectiveContext.evidence_path_1,
    objectiveContext.evidence_path_2,
    objectiveContext.evidence_path_3,
    objectiveContext.evidence_path_4,
  ].map((item) => text(item, 1000)).filter(Boolean));
  return list(source?.source_read_evidence)
    .map((entry, index) => {
      const path = text(entry?.result?.file_path || entry?.result?.path, 1000);
      const score = (changed.has(path) ? 100 : 0) + (required.has(path) ? 80 : 0) + index / 10000;
      return { entry, score };
    })
    .sort((a, b) => a.score - b.score)
    .map((item) => item.entry);
}

function transportState(state, repositoryGuidance, profile = "normal") {
  const source = object(state);
  const minimal = profile === "minimal";
  const reduced = profile !== "normal";
  const evidenceProfile = minimal ? "minimal" : reduced ? "reduced" : "normal";
  const sourceReads = prioritizedSourceReads(source)
    .map((entry) => compactPlannerEvidence(entry, evidenceProfile))
    .filter(Boolean);
  const rollingEvidence = list(source.evidence)
    .map((entry) => compactPlannerEvidence(entry, evidenceProfile))
    .filter(Boolean);
  return {
    mission_id: text(source.mission_id, 200) || null,
    objective_context: compactObjectiveContext(source.objective_context, profile),
    base_commit: text(source.base_commit, 160) || null,
    status: text(source.status, 100) || null,
    current_operation_id: text(source.current_operation_id, 200) || null,
    completed_operation_ids: list(source.completed_operation_ids).slice(minimal ? -12 : -24),
    files_changed: list(source.files_changed).slice(minimal ? -20 : -40),
    tests: newestWithinBudget(
      list(source.tests).map((entry) => compactTest(entry, evidenceProfile)),
      minimal ? 500 : reduced ? 1500 : 2600,
      minimal ? 1 : reduced ? 3 : 4,
    ),
    failures: list(source.failures).slice(minimal ? -4 : -6).map(compactFailure),
    repairs: list(source.repairs).slice(minimal ? -4 : -6).map(compactRepair),
    blockers: list(source.blockers).slice(-6).map((item) => boundedText(item, 700)),
    verification: list(source.verification).slice(minimal ? -4 : -8),
    repository_guidance: compactRepositoryGuidance(repositoryGuidance, profile),
    source_read_evidence: newestWithinBudget(
      sourceReads,
      minimal ? 1800 : reduced ? 4400 : 6400,
      minimal ? 1 : reduced ? 3 : 4,
    ),
    rejected_duplicate_actions: list(source.rejected_duplicate_actions).slice(minimal ? -3 : -6),
    duplicate_rejection_streak: integer(source.duplicate_rejection_streak) || 0,
    evidence: newestWithinBudget(
      rollingEvidence,
      minimal ? 450 : reduced ? 1700 : 3000,
      minimal ? 3 : reduced ? 6 : 8,
    ),
    patch_present: source.patch_present === true,
    source_change_count: integer(source.source_change_count) || 0,
    autonomy_control: object(source.autonomy_control),
    planner_pending: source.planner_pending ? object(source.planner_pending) : null,
    transport_compaction_profile: profile,
  };
}

function stateJsonWithinBudget(state, repositoryGuidance, maximumChars) {
  for (const profile of ["normal", "reduced", "minimal"]) {
    const candidate = transportState(state, repositoryGuidance, profile);
    const serialized = jsonText(candidate);
    if (serialized.length <= maximumChars) return serialized;
  }
  const critical = transportState(state, repositoryGuidance, "minimal");
  critical.transport_compaction_profile = "critical";
  const objectiveContext = object(critical.objective_context);
  critical.objective_context = {
    ...objectiveContext,
    evidence_paths: list(objectiveContext.evidence_paths).slice(0, 1),
    pre_edit_inspection_paths: list(objectiveContext.pre_edit_inspection_paths).slice(0, 1),
    authoritative_verification_args: list(objectiveContext.authoritative_verification_args).slice(0, 8),
    allowed_edit_paths: list(objectiveContext.allowed_edit_paths).slice(0, 10),
    completion_criteria: list(objectiveContext.completion_criteria).slice(0, 6).map((item) => boundedText(item, 160)),
    owner_constraints: list(objectiveContext.owner_constraints).slice(-4).map((item) => boundedText(item, 160)),
    owner_objective: boundedText(objectiveContext.owner_objective, 500),
  };
  critical.completed_operation_ids = list(critical.completed_operation_ids).slice(-8);
  critical.files_changed = list(critical.files_changed).slice(-12);
  critical.tests = list(critical.tests).slice(-1).map((entry) => ({
    ...object(entry),
    stdout: boundedText(entry?.stdout, 120),
    stderr: boundedText(entry?.stderr, 120),
  }));
  critical.failures = list(critical.failures).slice(-2).map((entry) => ({
    ...object(entry),
    message: boundedText(entry?.message, 300),
  }));
  critical.repairs = list(critical.repairs).slice(-1);
  critical.blockers = list(critical.blockers).slice(-2).map((item) => boundedText(item, 300));
  critical.verification = list(critical.verification).slice(-2).map((entry) => ({
    operation_id: text(entry?.operation_id, 200) || null,
    passed: entry?.passed === true,
    command: text(entry?.command, 200) || null,
    args: list(entry?.args).slice(0, 8).map((item) => text(item, 300)),
  }));
  critical.rejected_duplicate_actions = list(critical.rejected_duplicate_actions).slice(-2);
  critical.evidence = list(critical.evidence).slice(-1);
  critical.autonomy_control = {
    planner_attempts_used: integer(critical.autonomy_control?.planner_attempts_used),
    remaining_iterations: integer(critical.autonomy_control?.remaining_iterations),
    evidence_revision: integer(critical.autonomy_control?.evidence_revision),
    source_revision: integer(critical.autonomy_control?.source_revision),
  };
  critical.planner_pending = critical.planner_pending ? {
    provider: text(critical.planner_pending?.provider, 120) || null,
    provider_job_id: text(critical.planner_pending?.provider_job_id, 240) || null,
    created_at: text(critical.planner_pending?.created_at, 80) || null,
  } : null;
  critical.repository_guidance = {
    ...object(critical.repository_guidance),
    instructions_text: boundedText(critical.repository_guidance?.instructions_text, 220),
    verification_commands_text: boundedText(critical.repository_guidance?.verification_commands_text, 160),
    ci_workflows_text: boundedText(critical.repository_guidance?.ci_workflows_text, 80),
    monorepo_summary: boundedText(critical.repository_guidance?.monorepo_summary, 80),
    instruction_scope_rule: boundedText(critical.repository_guidance?.instruction_scope_rule, 100),
  };
  critical.source_read_evidence = list(critical.source_read_evidence).slice(-1).map((entry) => ({
    ...object(entry),
    result: {
      ...object(entry?.result),
      content: boundedText(entry?.result?.content, 520),
      content_truncated_for_transport: true,
    },
  }));
  const criticalSerialized = jsonText(critical);
  if (criticalSerialized.length <= maximumChars) return criticalSerialized;

  const latestRead = list(critical.source_read_evidence).slice(-1)[0];
  const emergency = {
    mission_id: critical.mission_id,
    objective_context: {
      repository_head_observed: text(critical.objective_context?.repository_head_observed, 160) || null,
      authoritative_verification_command: text(critical.objective_context?.authoritative_verification_command, 240) || null,
      authoritative_verification_args: list(critical.objective_context?.authoritative_verification_args).slice(0, 6).map((item) => text(item, 240)),
      implementation_required: critical.objective_context?.implementation_required === true ? true : undefined,
      completion_criteria: list(critical.objective_context?.completion_criteria).slice(0, 6).map((item) => boundedText(item, 180)),
      owner_constraints: list(critical.objective_context?.owner_constraints).slice(-3).map((item) => boundedText(item, 160)),
      authority: "CONTEXT_ONLY",
      authorization_effect: "NONE",
    },
    base_commit: critical.base_commit,
    status: critical.status,
    current_operation_id: critical.current_operation_id,
    files_changed: list(critical.files_changed).slice(-8),
    tests: list(critical.tests).slice(-1).map((entry) => ({
      operation_id: text(entry?.operation_id, 200) || null,
      command: text(entry?.command, 180) || null,
      args: list(entry?.args).slice(0, 6).map((item) => text(item, 220)),
      exit_code: integer(entry?.exit_code),
    })),
    failures: list(critical.failures).slice(-1).map((entry) => ({
      operation_id: text(entry?.operation_id, 200) || null,
      message: boundedText(entry?.message, 240),
    })),
    blockers: list(critical.blockers).slice(-1).map((item) => boundedText(item, 240)),
    verification: list(critical.verification).slice(-2).map((entry) => ({
      operation_id: text(entry?.operation_id, 200) || null,
      passed: entry?.passed === true,
    })),
    repository_guidance: {
      instructions_text: boundedText(critical.repository_guidance?.instructions_text, 220),
      verification_commands_text: boundedText(critical.repository_guidance?.verification_commands_text, 180),
    },
    source_read_evidence: latestRead ? [{
      operation_id: text(latestRead?.operation_id, 200) || null,
      action: "read",
      status: text(latestRead?.status, 120) || null,
      result: {
        file_path: text(latestRead?.result?.file_path, 1000) || null,
        start_line: integer(latestRead?.result?.start_line),
        end_line: integer(latestRead?.result?.end_line),
        content: boundedText(latestRead?.result?.content, 1400),
        content_truncated_for_transport: true,
      },
    }] : [],
    source_change_count: integer(critical.source_change_count) || 0,
    autonomy_control: {
      remaining_iterations: integer(critical.autonomy_control?.remaining_iterations),
      evidence_revision: integer(critical.autonomy_control?.evidence_revision),
      source_revision: integer(critical.autonomy_control?.source_revision),
    },
    transport_compaction_profile: "emergency",
  };
  const emergencySerialized = jsonText(emergency);
  if (emergencySerialized.length <= maximumChars) return emergencySerialized;
  throw new Error(
    `CODE_AI_AUTONOMOUS_PLANNER_STATE_BUDGET_EXCEEDED:${maximumChars}:critical=${criticalSerialized.length}:emergency=${emergencySerialized.length}`,
  );
}

const PLANNER_ACTION_SHAPES = Object.freeze({
  inspect: 'inspect: {"action":"inspect","description":"...","input":{}}',
  search: 'search: {"action":"search","description":"...","input":{"mode":"literal|regex|path|glob","query":"text or path needle","paths":["optional/content-search/path"],"path_globs":["optional/**/*.js"]}}',
  read: 'read: {"action":"read","description":"...","input":{"file_path":"path","start_line":1,"end_line":400}}',
  record_reproduction: 'record_reproduction: {"action":"record_reproduction","description":"record observed defect reproduction or exact post-fix rerun","input":{"status":"FAILED|PASSED|NOT_REPRODUCIBLE","summary":"observable result only","same_reproduction_key":"stable-key","evidence_operation_ids":["prior-operation-id"]}}',
  record_hypotheses: 'record_hypotheses: {"action":"record_hypotheses","description":"record bounded causal hypotheses and falsification state","input":{"hypotheses":[{"id":"H1","hypothesis":"plausible cause","status":"PLAUSIBLE|ELIMINATED|SUPPORTED","evidence_operation_ids":["operation-id"]}]}}',
  record_database_review: 'record_database_review: {"action":"record_database_review","description":"record database migration/schema/RLS/rollback review","input":{"passed":true,"migration_plan":"...","backward_compatibility":"...","rls_review":"...","rollback_plan":"...","evidence_operation_ids":["verification-id"]}}',
  record_security_review: 'record_security_review: {"action":"record_security_review","description":"record independent security review","input":{"passed":true,"scope":"authorization/tenant/secrets/input boundaries reviewed","findings":[],"evidence_operation_ids":["verification-id"]}}',
  record_performance_evidence: 'record_performance_evidence: {"action":"record_performance_evidence","description":"record measured before/after performance evidence","input":{"passed":true,"benchmark_key":"stable-benchmark-config","metric":"p95 latency","direction":"lower_is_better","minimum_improvement_percent":5,"before":120,"after":90,"before_operation_id":"before-measurement-id","after_operation_id":"after-measurement-id","unit":"ms","evidence_operation_ids":["before-measurement-id","after-measurement-id"]}}',
  record_observability_evidence: 'record_observability_evidence: {"action":"record_observability_evidence","description":"record runtime log/trace/network/metric evidence","input":{"source":"trace|log|network|metric|api","summary":"observed runtime fact","evidence_operation_ids":["operation-id"]}}',
  record_precision_evidence: 'record_precision_evidence: {"action":"record_precision_evidence","description":"record one required Engineering Precision capability using observed evidence","input":{"key":"coverage_guidance|mutation_testing|property_fuzz|supply_chain|taint_dataflow|patch_minimization|uncertainty|failure_injection|concurrency_lab|staging_canary|progressive_rollback|business_invariants|shadow_verification|user_flow_replay|visual_regression|accessibility|review_comments|reviewer_calibration|self_improvement_benchmark|compute_economics|comparative_benchmark","passed":true,"verified":true,"summary":"what was actually measured or verified","metrics":{},"evidence_operation_ids":["operation-id"],"evidence_refs":[]}}',
  history: 'history: {"action":"history","description":"inspect bounded git history and blame for a suspected regression location","input":{"file_path":"path","line":1,"limit":12}}',
  precision_analyze: 'precision_analyze: {"action":"precision_analyze","description":"run deterministic Engineering Precision analysis","input":{"kind":"compiler_semantics|coverage_guidance|property_fuzz|supply_chain|taint_dataflow|uncertainty|failure_injection|concurrency_lab|business_invariants|review_comments|reviewer_calibration|self_improvement_benchmark|compute_economics|comparative_benchmark","file_path":"optional path","schema":{},"changed_lines":[],"coverage":{}}}',
  mutation_test: 'mutation_test: {"action":"mutation_test","description":"temporarily mutate candidate source and prove the verifier kills each bounded mutant","input":{"file_path":"path","command":"node","args":["--test","tests/target.test.mjs"],"limit":3,"timeout_ms":120000}}',
  coverage_test: 'coverage_test: {"action":"coverage_test","description":"run Node test coverage and enforce measured thresholds","input":{"args":["--test","tests/target.test.mjs"],"minimum_line_percent":80,"minimum_branch_percent":60,"timeout_ms":120000}}',
  fuzz_test: 'fuzz_test: {"action":"fuzz_test","description":"execute generated boundary inputs against a deterministic harness","input":{"command":"node","args_prefix":["scripts/fuzz-harness.mjs"],"schema":{"properties":{}},"limit":20,"timeout_ms":60000}}',
  apply_files: 'apply_files: {"action":"apply_files","description":"...","input":{"files":[{"path":"path","content":"complete final file content"}]}}',
  run: 'run: {"action":"run","description":"...","input":{"command":"npm","args":["test"],"cwd":"."}}',
  verify: 'verify: {"action":"verify","description":"...","input":{"command":"npm","args":["test"],"cwd":"."}}',
  browser_verify: 'browser_verify: {"action":"browser_verify","description":"verify the changed web surface in a real browser","input":{"url":"http://localhost:3000/path","selector":"optional CSS selector","full_page":true,"timeout_ms":45000}}',
  diff: 'diff: {"action":"diff","description":"...","input":{}}',
  research: 'research: {"action":"research","description":"...","input":{"query":"technical question","preferred_domains":["official.example"],"freshness_days":30}}',
  complete: 'complete: {"action":"complete","description":"concise verified completion statement","input":{"criteria_evidence":[{"criterion":"exact bound completion criterion","evidence_operation_ids":["observed_operation_id"]}]}}',
  block: 'block: {"action":"block","description":"genuine blocker","input":{}}',
});

function plannerActionShapeText(allowedActions) {
  return list(allowedActions)
    .map((action) => PLANNER_ACTION_SHAPES[text(action, 80)])
    .filter(Boolean)
    .join("\n");
}

function plannerForwardProgressDirective(state, allowedActions = []) {
  const source = object(state);
  const control = object(source.autonomy_control);
  const allowed = new Set(
    list(allowedActions).map((action) => text(action, 80)).filter(Boolean),
  );
  const forbiddenActions = Object.keys(PLANNER_ACTION_SHAPES)
    .filter((action) => !allowed.has(action));
  const suppressedAction = text(control.last_suppressed_action, 80);
  const suppressedStreak = integer(control.suppressed_action_rejection_streak) || 0;
  const duplicateAction = text(control.last_duplicate_action, 80);
  const duplicateStreak = integer(control.duplicate_rejection_streak) || 0;
  const sourceReads = list(source.source_read_evidence);
  const status = text(source.status, 100);
  const verificationPassed = list(source.verification).some((entry) => entry?.passed === true);
  const lines = [];

  if (
    suppressedStreak > 0 &&
    suppressedAction &&
    forbiddenActions.includes(suppressedAction)
  ) {
    lines.push(
      `HARD RECOVERY: your previous "${suppressedAction}" choice was rejected by the controller and is still forbidden. Do not emit "${suppressedAction}" again; repeating a forbidden action can terminate the mission.`,
    );
  } else if (
    duplicateStreak > 0 &&
    duplicateAction &&
    forbiddenActions.includes(duplicateAction)
  ) {
    lines.push(
      `FORWARD RECOVERY: "${duplicateAction}" was rejected as duplicate evidence and is temporarily forbidden. Do not emit "${duplicateAction}" again until the controller makes it available.`,
    );
  }

  if (
    (suppressedAction === "read" || duplicateAction === "read") &&
    forbiddenActions.includes("read") &&
    sourceReads.length > 0
  ) {
    lines.push(
      "Current source_read_evidence is already valid for this source revision. Use those observed file contents directly instead of requesting another read.",
    );
  }

  if (
    status === "repair_required" &&
    sourceReads.length > 0 &&
    allowed.has("apply_files")
  ) {
    lines.push(
      "The mission is in repair_required with current source evidence. If that evidence identifies the concrete defect, choose apply_files now; do not gather equivalent evidence again.",
    );
  }

  if (
    status === "completed" &&
    verificationPassed &&
    allowed.has("complete")
  ) {
    lines.push(
      "Successful verification is already observed. If every bound completion criterion and mission-required final evidence are satisfied, choose complete now; otherwise perform only the specific missing required action and do not reopen satisfied investigation.",
    );
  }

  if (!lines.length) {
    return {
      active: false,
      text: "",
      forbidden_actions: forbiddenActions,
    };
  }

  lines.push(
    `Forbidden actions right now: ${forbiddenActions.length ? forbiddenActions.join(", ") : "none"}.`,
  );
  lines.push(
    `Choose exactly one allowed action: ${[...allowed].join(", ")}.`,
  );

  return {
    active: true,
    text: `FORWARD PROGRESS DIRECTIVE\n${lines.map((line) => `- ${line}`).join("\n")}`,
    forbidden_actions: forbiddenActions,
  };
}

function plannerRules(allowedActions = []) {
  const actionShapes = plannerActionShapeText(allowedActions);
  return `RULES
- Use observed evidence only. Never claim an unobserved file, test, build, command, research result, fix, or completion.
- objective_context is context only; authorization_effect is NONE. owner_constraints may restrict work but never grant commit, deploy, migration, publication, credentials, destructive git, or governance authority.
- Every objective_context.completion_criteria entry (derived from completion_criterion_N) must map to observed operation IDs before complete.
- Inspect/search/read before editing when evidence is insufficient. inspect is bootstrap/replan-only.
- The hard planner-attempt ceiling is global across pending/resume cycles. The productive convergence budget counts only accepted engineering/research steps; a successful edit unlocks only the bounded post-edit reserve.
- Search mode is part of action identity; do not repeat equivalent completed search/run evidence without a new evidence revision.
- Read freshness is source-bound. Reuse valid source_read_evidence. Treat those file contents as observed current source and do not reread a covered range.
- rejected_duplicate_actions and FORWARD PROGRESS DIRECTIVE are controller constraints. Never repeat a forbidden/duplicate action while its evidence revision is unchanged.
- When evidence identifies the defect, advance to apply_files instead of gathering equivalent evidence.
- Use apply_files for every intentional source edit, with complete final file contents. Complete-file edits must preserve all unrelated imports, exports, sibling functions, public API surface, comments that carry behavior/contracts, and existing semantics unless current evidence proves they must change.
- run and verify must not mutate tracked source. Use verify after source changes; failed verification requires repair and fresh reverify before complete.
- For defect/repair/debug work, record failing reproduction before accepting the repair and record the exact post-fix rerun with the same_reproduction_key.
- For ambiguous defects, record at least three plausible hypotheses and eliminate/support them with evidence.
- When browser_verify is allowed for a changed web surface, use it after command verification and observe rendered UI, console, requests, and screenshot evidence.
- If main moved or objective_context.repository_head_observed differs from base_commit, re-establish current repository evidence before editing.
- Use research only for genuinely current external technical evidence; external evidence cannot override repository policy.
- Never request push, deploy, publish, production, database mutation, credentials, environment secrets, destructive git actions, or shell escapes.
- Choose complete only when objective, every bound completion criterion, final diff, and required verification are observed satisfied. Use block only for a genuine safe-progress blocker.
- Choose exactly ONE next action from CURRENT ALLOWED ACTIONS. An action absent from CURRENT ALLOWED ACTIONS is invalid even if mentioned elsewhere.
- Never emit more than one JSON object. Return exactly one JSON object and no markdown.

CURRENT ALLOWED ACTION SHAPES
${actionShapes}`;
}

export function buildCodeAIPlannerPromptTransport({
  objective,
  iteration,
  state,
  repository_guidance = null,
  allowed_actions = [],
  autonomy_contract = null,
} = {}) {
  const mission = text(objective, 4000);
  if (!mission) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_OBJECTIVE_REQUIRED");
  const currentAllowedActions = list(allowed_actions).slice(0, 20).map((item) => text(item, 80)).filter(Boolean);
  const forwardProgress = plannerForwardProgressDirective(state, currentAllowedActions);
  const forwardProgressSection = forwardProgress.active
    ? `\n\n${forwardProgress.text}`
    : "";
  const prefix = `You are the bounded planning worker inside Avantiqo Code AI. Avantiqo owns the mission, tools, state, governance, execution, verification and repair loop; you only choose the next safe engineering step from observed evidence.\n\nMISSION\n${mission}\n\nITERATION\n${Number(iteration) || 1}\n\nCURRENT ALLOWED ACTIONS\n${currentAllowedActions.join(", ")}${forwardProgressSection}\n\nCURRENT STATE AND EVIDENCE\n`;
  const suffix = `\n\n${plannerRules(currentAllowedActions)}`;
  const stateBudget = Math.min(
    CODE_AI_PLANNER_MAX_STATE_CHARS,
    CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS - prefix.length - suffix.length,
  );
  if (stateBudget < 4500) {
    throw new Error(`CODE_AI_AUTONOMOUS_PLANNER_STATIC_PROMPT_BUDGET_EXCEEDED:${stateBudget}`);
  }
  const stateJson = stateJsonWithinBudget(state, repository_guidance, stateBudget);
  const instruction = `${prefix}${stateJson}${suffix}`;
  if (instruction.length > CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS) {
    throw new Error(
      `CODE_AI_AUTONOMOUS_PLANNER_INSTRUCTION_BUDGET_EXCEEDED:${instruction.length}:${CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS}`,
    );
  }
  const structuredSpecification = {
    autonomy_contract: text(autonomy_contract, 160) || null,
    planner_prompt_contract: CODE_AI_PLANNER_PROMPT_CONTRACT,
    iteration: Number(iteration) || 1,
    allowed_actions: currentAllowedActions,
    forbidden_actions: forwardProgress.forbidden_actions,
    allowed_actions_contract: "STRICT_ENUM",
    forward_progress_recovery_active: forwardProgress.active,
    forward_progress_directive: forwardProgress.active ? forwardProgress.text : null,
    planner_instruction_chars: instruction.length,
    planner_instruction_max_chars: CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS,
    planner_state_max_chars: CODE_AI_PLANNER_MAX_STATE_CHARS,
    objective_in_instruction: true,
    state_in_instruction: true,
    duplicate_objective_in_structured_specification: false,
    duplicate_state_in_structured_specification: false,
    raw_reasoning_persisted: false,
  };
  return {
    contract: CODE_AI_PLANNER_PROMPT_CONTRACT,
    instruction,
    structured_specification: structuredSpecification,
    instruction_chars: instruction.length,
    state_chars: stateJson.length,
    worker_instruction_hard_limit_chars: 30000,
    headroom_to_worker_limit_chars: 30000 - instruction.length,
  };
}

export const CodeAIPlannerPromptRuntime = Object.freeze({
  contract: CODE_AI_PLANNER_PROMPT_CONTRACT,
  max_instruction_chars: CODE_AI_PLANNER_MAX_INSTRUCTION_CHARS,
  max_state_chars: CODE_AI_PLANNER_MAX_STATE_CHARS,
  worker_instruction_hard_limit_chars: 30000,
  build: buildCodeAIPlannerPromptTransport,
});
