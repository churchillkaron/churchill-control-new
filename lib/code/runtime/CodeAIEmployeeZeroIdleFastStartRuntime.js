import { executeCodeAIMission } from "./CodeAIMissionRuntime.js";
import {
  executeCodeAIEmployeeMission,
  CodeAIEmployeeRuntime,
} from "./CodeAIEmployeeRuntime.js";
import {
  resolveCodeAIEmployeeFastStartSeedPaths,
} from "./CodeAIEmployeeFastStartRuntime.js";

export const CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT =
  "AVANTIQO_CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_V1";
export const CODE_AI_ZERO_IDLE_SERVERLESS_TRANSPORT_CONTRACT =
  "AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_TRANSPORT_V1";

const MAX_SEED_READ_LINES = 2400;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function assertZeroIdleServerlessEnabled() {
  if (!enabled(process.env.AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED)) {
    throw new Error("AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED_REQUIRED");
  }
  if (enabled(process.env.AVANTIQO_CODE_WORKER_SESSION_ENABLED)) {
    throw new Error("CODE_AI_ZERO_IDLE_SERVERLESS_REQUIRES_WORKER_SESSION_DISABLED");
  }
}

function fastStartOperations(seedPaths) {
  return [
    {
      id: "employee_zero_idle_fast_start_inspect",
      action: "inspect",
      description:
        "Start useful engineering work immediately while Serverless remains scaled to zero until a reasoning request is actually needed.",
      input: {},
    },
    ...seedPaths.map((filePath, index) => ({
      id: `employee_zero_idle_fast_start_read_${index + 1}`,
      action: "read",
      description:
        "Load known source evidence deterministically before the first paid reasoning request.",
      input: {
        file_path: filePath,
        start_line: 1,
        end_line: MAX_SEED_READ_LINES,
      },
    })),
  ];
}

function appendZeroIdleEvidence(state, {
  seedPaths,
  elapsedMs,
  ownerIntent,
} = {}) {
  const source = object(state);
  const evidence = {
    at: new Date().toISOString(),
    kind: "employee_zero_idle_fast_start",
    status: "deterministic_work_ready",
    contract: CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
    transport_contract: CODE_AI_ZERO_IDLE_SERVERLESS_TRANSPORT_CONTRACT,
    transport: "SERVERLESS_ZERO_IDLE",
    owner_intent_present: Boolean(ownerIntent),
    seed_paths: seedPaths,
    seed_path_count: seedPaths.length,
    deterministic_start_elapsed_ms: elapsedMs,
    model_call_required_to_start: false,
    gpu_worker_required_to_start: false,
    worker_session_created: false,
    serverless_worker_requested_by_fast_start: false,
    scale_to_zero_required: true,
    provider_execution_submitted_by_fast_start: false,
    wallet_mutation_performed_by_fast_start: false,
    source_mutation_performed_by_fast_start: false,
    production_deploy_performed: false,
    raw_reasoning_persisted: false,
  };
  return {
    ...source,
    evidence: [...list(source.evidence), evidence].slice(-120),
    employee_fast_start: {
      contract: CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
      transport_contract: CODE_AI_ZERO_IDLE_SERVERLESS_TRANSPORT_CONTRACT,
      deterministic_start: true,
      model_call_required_to_start: false,
      gpu_worker_required_to_start: false,
      worker_session_created: false,
      serverless_worker_requested_by_fast_start: false,
      zero_idle_serverless: true,
      seed_path_count: seedPaths.length,
      deterministic_start_elapsed_ms: elapsedMs,
      raw_reasoning_persisted: false,
    },
  };
}

export async function executeCodeAIEmployeeZeroIdleFastStartMission({
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
} = {}) {
  assertZeroIdleServerlessEnabled();
  const startedAt = Date.now();
  const ownerIntent = text(owner_intent || objective, 5000);
  let seedPaths = [];
  let seededStateRaw;

  if (resume_state?.base_commit) {
    seededStateRaw = resume_state;
  } else {
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
        prepared?.reason || "CODE_AI_EMPLOYEE_ZERO_IDLE_REPOSITORY_PREPARATION_FAILED",
      );
    }
    seededStateRaw = prepared.state;
  }

  const deterministicElapsedMs = Date.now() - startedAt;
  let seededState = appendZeroIdleEvidence(seededStateRaw, {
    seedPaths,
    elapsedMs: deterministicElapsedMs,
    ownerIntent,
  });
  if (["worker_warming", "blocked"].includes(text(seededState.status, 100))) {
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
    fast_start_contract: CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
    worker_session: null,
    execution_transport: {
      contract: CODE_AI_ZERO_IDLE_SERVERLESS_TRANSPORT_CONTRACT,
      transport: "SERVERLESS_ZERO_IDLE",
      worker_session_created: false,
      serverless_worker_requested_by_fast_start: false,
      serverless_worker_requested_only_by_reasoning: true,
      scale_to_zero_required: true,
      raw_reasoning_persisted: false,
    },
    fast_start: {
      deterministic_start: true,
      model_call_required_to_start: false,
      gpu_worker_required_to_start: false,
      deterministic_start_elapsed_ms: deterministicElapsedMs,
      seed_paths: seedPaths,
      seed_path_count: seedPaths.length,
      worker_session_created: false,
      serverless_worker_requested_by_fast_start: false,
      zero_idle_serverless: true,
      first_reasoning_call_should_prefer_implementation: seedPaths.length > 0,
      raw_reasoning_persisted: false,
    },
  };
}

export const CodeAIEmployeeZeroIdleFastStartRuntime = Object.freeze({
  contract: CODE_AI_EMPLOYEE_ZERO_IDLE_FAST_START_CONTRACT,
  transport_contract: CODE_AI_ZERO_IDLE_SERVERLESS_TRANSPORT_CONTRACT,
  employee_contract: CodeAIEmployeeRuntime.contract,
  execute: executeCodeAIEmployeeZeroIdleFastStartMission,
});

export default CodeAIEmployeeZeroIdleFastStartRuntime;
