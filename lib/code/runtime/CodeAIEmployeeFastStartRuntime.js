import { executeCodeAIMission } from "./CodeAIMissionRuntime.js";
import {
  executeCodeAIEmployeeMission,
  CodeAIEmployeeRuntime,
} from "./CodeAIEmployeeRuntime.js";
import {
  ensureCodeAIWorkerSession,
  CODE_AI_WORKER_SESSION_CONTRACT,
} from "./CodeAIWorkerSessionRuntime.js";

export const CODE_AI_EMPLOYEE_FAST_START_CONTRACT =
  "AVANTIQO_CODE_AI_EMPLOYEE_FAST_START_V2";

const MAX_SEED_READS = 6;
const MAX_SEED_READ_LINES = 2400;
const DEFAULT_WARM_SESSION_IDLE_MS = 10 * 60 * 1000;
const MAX_WARM_SESSION_IDLE_MS = 30 * 60 * 1000;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function assertWorkerSessionInfrastructureEnabled() {
  const enabled = text(process.env.AVANTIQO_CODE_WORKER_SESSION_ENABLED, 20).toLowerCase();
  if (!["1", "true", "yes"].includes(enabled)) {
    throw new Error("CODE_AI_WORKER_SESSION_INFRASTRUCTURE_NOT_ENABLED");
  }
}

function safeRepositoryFilePath(value) {
  const candidate = text(value, 1000).replace(/^\.\//, "");
  if (!candidate) return null;
  if (candidate.startsWith("/") || candidate.includes("..")) return null;
  if (/^\.env(?:\.|$)/i.test(candidate) || /\/(?:\.env|secrets?)(?:\.|\/|$)/i.test(candidate)) {
    return null;
  }
  if (!/\.[A-Za-z0-9]{1,12}$/.test(candidate)) return null;
  return candidate;
}

function evidencePaths(objectiveContext = {}) {
  const source = object(objectiveContext);
  return [
    source.evidence_path_1,
    source.evidence_path_2,
    source.evidence_path_3,
    source.evidence_path_4,
  ].map(safeRepositoryFilePath).filter(Boolean);
}

function objectiveFilePaths(objective) {
  const raw = text(objective, 8000);
  const matches = raw.match(
    /(?:^|[\s`'"(])([A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+-]+)*\.(?:js|jsx|ts|tsx|mjs|cjs|json|sql|py|go|rs|java|kt|rb|php|swift|c|cc|cpp|h|hpp|md|yaml|yml))(?:$|[\s`'"),])/g,
  ) || [];
  return matches
    .map((entry) => entry.trim().replace(/^[`'"(]+|[`'"),]+$/g, ""))
    .map(safeRepositoryFilePath)
    .filter(Boolean);
}

export function resolveCodeAIEmployeeFastStartSeedPaths({
  objective,
  objective_context = null,
} = {}) {
  return [...new Set([
    ...evidencePaths(objective_context),
    ...objectiveFilePaths(objective),
  ])].slice(0, MAX_SEED_READS);
}

function warmSessionIdleMs(value) {
  const parsed = integer(value, DEFAULT_WARM_SESSION_IDLE_MS);
  if (parsed <= 0) return DEFAULT_WARM_SESSION_IDLE_MS;
  return Math.max(60_000, Math.min(MAX_WARM_SESSION_IDLE_MS, parsed));
}

function fastStartOperations(seedPaths) {
  return [
    {
      id: "employee_fast_start_inspect",
      action: "inspect",
      description:
        "Start useful engineering work immediately by loading repository guidance and current source topology without a model call.",
      input: {},
    },
    ...seedPaths.map((filePath, index) => ({
      id: `employee_fast_start_read_${index + 1}`,
      action: "read",
      description:
        "Seed current source evidence before the first reasoning call so the coder can implement instead of spending a call choosing what to read.",
      input: {
        file_path: filePath,
        start_line: 1,
        end_line: MAX_SEED_READ_LINES,
      },
    })),
  ];
}

function appendFastStartEvidence(state, evidence) {
  const source = object(state);
  return {
    ...source,
    evidence: [...list(source.evidence), evidence].slice(-120),
    employee_fast_start: {
      contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
      deterministic_start: true,
      model_call_required_to_start: false,
      seed_path_count: Number(evidence.seed_path_count || 0),
      deterministic_start_elapsed_ms: Number(evidence.deterministic_start_elapsed_ms || 0),
      worker_session_contract: evidence.worker_session_contract || null,
      worker_ready: evidence.worker_ready === true,
      worker_warming: evidence.worker_warming === true,
      warm_session_idle_ms: Number(evidence.warm_session_idle_ms || DEFAULT_WARM_SESSION_IDLE_MS),
      raw_reasoning_persisted: false,
    },
  };
}

function workerWarmingResult({ state, worker, elapsedMs, seedPaths, warmIdleMs }) {
  const warmingState = appendFastStartEvidence({
    ...object(state),
    status: "worker_warming",
    blockers: [],
    current_operation_id: null,
    updated_at: new Date().toISOString(),
  }, {
    at: new Date().toISOString(),
    kind: "employee_fast_start",
    status: "worker_warming",
    contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
    deterministic_start_elapsed_ms: elapsedMs,
    seed_paths: seedPaths,
    seed_path_count: seedPaths.length,
    model_call_required_to_start: false,
    worker_session_contract: worker?.contract || CODE_AI_WORKER_SESSION_CONTRACT,
    worker_ready: false,
    worker_warming: worker?.warming === true,
    worker_state: worker?.state || null,
    worker_reason: worker?.reason || null,
    worker_session_id: worker?.session_id || null,
    worker_pod_id_present: worker?.pod_id_present === true,
    warm_session_idle_ms: warmIdleMs,
    provider_execution_submitted_by_fast_start: false,
    wallet_mutation_performed_by_fast_start: false,
    source_mutation_performed_by_fast_start: false,
    production_deploy_performed: false,
    raw_reasoning_persisted: false,
  });

  return {
    success: false,
    status: "worker_warming",
    reason: "CODE_AI_EMPLOYEE_WORKER_WARMING",
    contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
    fast_start_contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
    worker_session: worker,
    state: warmingState,
    fast_start: {
      deterministic_start: true,
      model_call_required_to_start: false,
      deterministic_start_elapsed_ms: elapsedMs,
      seed_paths: seedPaths,
      seed_path_count: seedPaths.length,
      worker_ready: false,
      worker_warming: worker?.warming === true,
      warm_session_idle_ms: warmIdleMs,
      first_reasoning_call_should_prefer_implementation: seedPaths.length > 0,
      raw_reasoning_persisted: false,
    },
  };
}

export async function executeCodeAIEmployeeFastStartMission({
  context = {},
  objective,
  owner_intent = null,
  objective_context = null,
  repository_url,
  ref = "main",
  resume_state = null,
  reasoning_call_budget = null,
  max_employee_passes = null,
  timeout_ms = null,
  warm_session_idle_ms = DEFAULT_WARM_SESSION_IDLE_MS,
} = {}) {
  assertWorkerSessionInfrastructureEnabled();
  const startedAt = Date.now();
  const ownerIntent = text(owner_intent || objective, 5000);
  const warmIdleMs = warmSessionIdleMs(warm_session_idle_ms);
  let seedPaths = [];

  const workerPromise = ensureCodeAIWorkerSession({ idle_ms: warmIdleMs });
  const preparationPromise = (async () => {
    if (resume_state?.base_commit) return resume_state;
    seedPaths = resolveCodeAIEmployeeFastStartSeedPaths({ objective, objective_context });
    const prepared = await executeCodeAIMission({
      objective,
      repository_url,
      ref,
      operations: fastStartOperations(seedPaths),
      resume_state: null,
      timeout_ms,
    });
    if (!prepared?.state?.base_commit) {
      throw new Error(
        prepared?.reason || "CODE_AI_EMPLOYEE_FAST_START_REPOSITORY_PREPARATION_FAILED",
      );
    }
    return prepared.state;
  })();

  const [seededStateRaw, worker] = await Promise.all([preparationPromise, workerPromise]);
  const deterministicElapsedMs = Date.now() - startedAt;
  let seededState = appendFastStartEvidence(seededStateRaw, {
    at: new Date().toISOString(),
    kind: "employee_fast_start",
    status: worker?.ready === true ? "deterministic_work_ready" : "worker_warming",
    contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
    owner_intent_present: Boolean(ownerIntent),
    seed_paths: seedPaths,
    seed_path_count: seedPaths.length,
    deterministic_start_elapsed_ms: deterministicElapsedMs,
    model_call_required_to_start: false,
    worker_session_contract: worker?.contract || CODE_AI_WORKER_SESSION_CONTRACT,
    worker_ready: worker?.ready === true,
    worker_warming: worker?.warming === true,
    worker_state: worker?.state || null,
    worker_session_id: worker?.session_id || null,
    worker_pod_id_present: worker?.pod_id_present === true,
    warm_session_idle_ms: warmIdleMs,
    provider_execution_submitted_by_fast_start: false,
    wallet_mutation_performed_by_fast_start: false,
    source_mutation_performed_by_fast_start: false,
    production_deploy_performed: false,
    raw_reasoning_persisted: false,
  });

  if (worker?.ready !== true) {
    return workerWarmingResult({
      state: seededState,
      worker,
      elapsedMs: deterministicElapsedMs,
      seedPaths,
      warmIdleMs,
    });
  }

  if (text(seededState.status, 100) === "worker_warming") {
    seededState = {
      ...seededState,
      status: "running",
      blockers: [],
      updated_at: new Date().toISOString(),
    };
  }

  const result = await executeCodeAIEmployeeMission({
    context,
    objective,
    owner_intent: ownerIntent,
    objective_context,
    repository_url,
    ref,
    resume_state: seededState,
    reasoning_call_budget,
    max_employee_passes: max_employee_passes || undefined,
    timeout_ms,
  });

  return {
    ...object(result),
    fast_start_contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
    worker_session: {
      contract: worker.contract,
      ready: true,
      state: worker.state,
      session_id: worker.session_id,
      expires_at: worker.expires_at,
      idle_ms: worker.idle_ms,
      contains_worker_token: false,
    },
    fast_start: {
      deterministic_start: true,
      model_call_required_to_start: false,
      deterministic_start_elapsed_ms: deterministicElapsedMs,
      seed_paths: seedPaths,
      seed_path_count: seedPaths.length,
      worker_ready: true,
      worker_warming: false,
      warm_session_idle_ms: warmIdleMs,
      first_reasoning_call_should_prefer_implementation: seedPaths.length > 0,
      raw_reasoning_persisted: false,
    },
  };
}

export const CodeAIEmployeeFastStartRuntime = Object.freeze({
  contract: CODE_AI_EMPLOYEE_FAST_START_CONTRACT,
  employee_contract: CodeAIEmployeeRuntime.contract,
  worker_session_contract: CODE_AI_WORKER_SESSION_CONTRACT,
  max_seed_reads: MAX_SEED_READS,
  max_seed_read_lines: MAX_SEED_READ_LINES,
  default_warm_session_idle_ms: DEFAULT_WARM_SESSION_IDLE_MS,
  max_warm_session_idle_ms: MAX_WARM_SESSION_IDLE_MS,
  resolveSeedPaths: resolveCodeAIEmployeeFastStartSeedPaths,
  execute: executeCodeAIEmployeeFastStartMission,
});
