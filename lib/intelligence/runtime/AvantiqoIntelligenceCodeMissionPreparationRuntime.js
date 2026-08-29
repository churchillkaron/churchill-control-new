import {
  createAvantiqoIntelligenceCodeMissionContext,
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
} from "./AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  compactAvantiqoCodeMissionRepositoryAssessment,
  runAvantiqoIntelligenceCodeMissionSystemReasoning,
} from "./AvantiqoIntelligenceCodeMissionSystemReasoningRuntime.js";

export const AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_V1";
export const AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_V1";

const COMPLEXITY_CLASSES = new Set(["simple", "medium", "large"]);
const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const DEFAULT_REF = "main";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function fullHead(value) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(text(value, 160).toLowerCase());
}

function normalizeRepositoryUrl(value) {
  return text(value, 1000).replace(/\/+$/, "").replace(/\.git$/i, "");
}

function normalizeRef(value) {
  return text(value, 240) || DEFAULT_REF;
}

function normalizeComplexity(value) {
  const complexity = text(value, 40).toLowerCase();
  if (!COMPLEXITY_CLASSES.has(complexity)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_COMPLEXITY_REQUIRED:${complexity || "missing"}`,
    );
  }
  return complexity;
}

function missionShape(value = {}) {
  const source = object(value);
  const id = text(source.id || source.mission_id, 240);
  const objective = text(source.objective, 8000);
  if (!id) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_MISSION_ID_REQUIRED");
  }
  if (!objective) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_OBJECTIVE_REQUIRED");
  }
  return {
    id,
    objective,
    business_intent: text(source.business_intent, 6000) || null,
  };
}

function unevaluatedKnowledge() {
  return {
    evaluated: false,
    status: "NOT_EVALUATED",
    knowledge: [],
    provenance_contracts: [],
    freshness_checked: false,
    evidence_graph_checked: false,
    fresh_research_performed: false,
    stale_knowledge_reused: false,
    knowledge_authorizes_execution: false,
  };
}

function repositoryContextFromAssessment(repositoryAssessment) {
  const compact = compactAvantiqoCodeMissionRepositoryAssessment(repositoryAssessment);
  const head = text(compact.repository.current_main_head, 160).toLowerCase();
  if (!fullHead(head)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_FULL_REPOSITORY_HEAD_REQUIRED",
    );
  }
  return {
    repository_url: compact.repository.repository_url,
    ref: compact.repository.ref,
    head_sha: head,
    observed_at: compact.repository.observed_at,
  };
}

function assertReadyMissionContext(value) {
  const context = object(value);
  if (
    context.contract !== AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT ||
    context.status !== "READY_FOR_CODE"
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTEXT_INVALID");
  }
  const head = text(context.repository_context?.head_sha, 160).toLowerCase();
  if (!fullHead(head)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_FULL_REPOSITORY_HEAD_REQUIRED",
    );
  }
  return context;
}

function derivedReprepareRequest(missionContext, source = {}) {
  const context = assertReadyMissionContext(missionContext);
  const requested = object(source);
  const mission = missionShape(requested.mission || context.mission);
  const complexity = normalizeComplexity(
    requested.complexity_class || context.complexity?.class,
  );
  const repositoryUrl = text(
    requested.repository_url || context.repository_context?.repository_url,
    1000,
  );
  const ref = normalizeRef(requested.ref || context.repository_context?.ref);

  if (mission.id !== text(context.mission?.id, 240)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_MISSION_ID_MISMATCH");
  }
  if (mission.objective !== text(context.mission?.objective, 8000)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_OBJECTIVE_MISMATCH");
  }
  if (complexity !== text(context.complexity?.class, 40)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_COMPLEXITY_MISMATCH");
  }
  if (
    normalizeRepositoryUrl(repositoryUrl) !==
    normalizeRepositoryUrl(context.repository_context?.repository_url)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_REPOSITORY_MISMATCH");
  }
  if (ref !== normalizeRef(context.repository_context?.ref)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_REF_MISMATCH");
  }

  return {
    mission,
    complexity_class: complexity,
    canonical_context: Object.keys(object(requested.canonical_context)).length
      ? object(requested.canonical_context)
      : object(context.canonical_context),
    repository_url: repositoryUrl,
    ref,
    knowledge_options: object(requested.knowledge_options),
  };
}

export function createAvantiqoIntelligenceCodeMissionResumeCapsule({
  mission_context,
  preparation = null,
  preparation_request = null,
  source = null,
} = {}) {
  const missionContext = assertReadyMissionContext(
    mission_context || preparation?.mission_context,
  );
  const preparedHead = text(
    missionContext.repository_context?.head_sha,
    160,
  ).toLowerCase();
  const preparationRecord = object(preparation);
  const request = derivedReprepareRequest(
    missionContext,
    preparation_request || {},
  );

  return {
    contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT,
    status: "ACTIVE_REUSABLE",
    source: text(source, 120) || (
      preparationRecord.contract === AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT
        ? "PREPARED_BY_SHARED_INTELLIGENCE"
        : "SUPPLIED_CANONICAL_CONTEXT"
    ),
    prepared_once: true,
    prepared_repository_head: preparedHead,
    last_state_base_commit: preparedHead,
    reprepare_required: false,
    mission_context: missionContext,
    reprepare_request: request,
    preparation: {
      contract: text(preparationRecord.contract, 180) || null,
      route: text(preparationRecord.route, 180) || "SUPPLIED_CANONICAL_CONTEXT",
      reusable_knowledge_evaluation_performed:
        preparationRecord.governance?.reusable_knowledge_evaluation_performed === true,
      general_reasoning_performed:
        preparationRecord.governance?.general_reasoning_performed === true ||
        Boolean(missionContext.system_reasoning),
      web_research_automatically_performed: false,
    },
    governance: {
      state_attestation_required_before_resume_reuse: true,
      prepared_context_can_resume_without_repeating_learning: true,
      prepared_context_can_resume_without_repeating_general: true,
      general_reasoning_repeat_without_repository_change: false,
      repository_move_requires_repreparation: true,
      raw_reasoning_persisted: false,
      source_code_persisted: false,
      patch_persisted_by_capsule: false,
      customer_private_memory_persisted: false,
      authorization_effect: "NONE",
      permission_effect: "NONE",
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
    },
  };
}

export function bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState({
  state,
  capsule,
} = {}) {
  const sourceState = object(state);
  const sourceCapsule = object(capsule);
  if (
    sourceCapsule.contract !==
    AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT_INVALID");
  }
  assertReadyMissionContext(sourceCapsule.mission_context);
  const preparedHead = text(sourceCapsule.prepared_repository_head, 160).toLowerCase();
  const stateHead = text(sourceState.base_commit, 160).toLowerCase();
  if (!fullHead(preparedHead)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_HEAD_INVALID");
  }
  if (stateHead && !fullHead(stateHead)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_STATE_HEAD_INVALID");
  }
  const stale = Boolean(stateHead && stateHead !== preparedHead);
  return {
    ...sourceState,
    intelligence_mission_resume_capsule: {
      ...sourceCapsule,
      status: stale ? "STALE_REPREPARE_REQUIRED" : "ACTIVE_REUSABLE",
      last_state_base_commit: stateHead || preparedHead,
      reprepare_required: stale,
    },
  };
}

export function inspectAvantiqoIntelligenceCodeMissionResumeCapsule({
  resume_state,
} = {}) {
  const state = object(resume_state);
  const capsule = object(state.intelligence_mission_resume_capsule);
  if (!Object.keys(capsule).length) {
    return {
      present: false,
      reusable: false,
      reprepare_required: false,
      status: "NO_RESUME_CAPSULE",
      mission_context: null,
      reprepare_request: null,
      capsule: null,
    };
  }
  if (
    capsule.contract !==
    AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT_INVALID");
  }
  const missionContext = assertReadyMissionContext(capsule.mission_context);
  const preparedHead = text(capsule.prepared_repository_head, 160).toLowerCase();
  const stateHead = text(state.base_commit, 160).toLowerCase();
  if (!fullHead(preparedHead) || !fullHead(stateHead)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_LINEAGE_INVALID");
  }
  if (
    preparedHead !==
    text(missionContext.repository_context?.head_sha, 160).toLowerCase()
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTEXT_HEAD_MISMATCH");
  }
  const stale = stateHead !== preparedHead || capsule.reprepare_required === true ||
    text(capsule.status, 120) === "STALE_REPREPARE_REQUIRED";
  const request = derivedReprepareRequest(
    missionContext,
    object(capsule.reprepare_request),
  );
  return {
    present: true,
    reusable: !stale,
    reprepare_required: stale,
    status: stale ? "STALE_REPREPARE_REQUIRED" : "ACTIVE_REUSABLE",
    prepared_repository_head: preparedHead,
    state_base_commit: stateHead,
    mission_context: stale ? null : missionContext,
    reprepare_request: request,
    capsule,
    governance: {
      caller_must_verify_state_attestation_first: true,
      repeat_learning_required: stale,
      repeat_general_required: stale && request.complexity_class === "large",
      no_repeat_when_repository_unchanged: true,
      authorization_effect: "NONE",
    },
  };
}

async function defaultAssessRepository(input) {
  const module = await import("./AvantiqoProductRepositoryAssessmentRuntime.js");
  return module.assessAvantiqoCurrentRepository(input);
}

async function defaultEvaluateReusableKnowledge(input) {
  const module = await import("./AvantiqoKnowledgeRouterRuntime.js");
  return module.evaluateAvantiqoReusableKnowledge(input);
}

async function resolveKnowledge({
  context,
  mission,
  complexity,
  knowledge_options,
  evaluateReusableKnowledge,
}) {
  if (complexity === "simple") {
    return {
      skipped: true,
      learned_knowledge: unevaluatedKnowledge(),
      evaluation: null,
    };
  }
  const evaluation = await evaluateReusableKnowledge({
    context,
    payload: {
      query: mission.objective,
      objective: mission.business_intent || mission.objective,
      ...object(knowledge_options),
    },
  });
  const learnedKnowledge = object(evaluation?.learned_knowledge);
  if (learnedKnowledge.evaluated !== true) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_KNOWLEDGE_EVALUATION_INVALID",
    );
  }
  return {
    skipped: false,
    learned_knowledge: learnedKnowledge,
    evaluation,
  };
}

export async function prepareAvantiqoIntelligenceCodeMission({
  context = {},
  mission,
  complexity_class,
  canonical_context = {},
  repository_url = DEFAULT_REPOSITORY,
  ref = DEFAULT_REF,
  verified_commit_sha = null,
  timeout_ms = null,
  knowledge_options = {},
  dependencies = {},
} = {}) {
  const normalizedMission = missionShape(mission);
  const complexity = normalizeComplexity(complexity_class);
  const supplied = object(dependencies);
  const evaluateReusableKnowledge =
    typeof supplied.evaluateReusableKnowledge === "function"
      ? supplied.evaluateReusableKnowledge
      : defaultEvaluateReusableKnowledge;
  const assessRepository = typeof supplied.assessRepository === "function"
    ? supplied.assessRepository
    : defaultAssessRepository;
  const runSystemReasoning = typeof supplied.runSystemReasoning === "function"
    ? supplied.runSystemReasoning
    : runAvantiqoIntelligenceCodeMissionSystemReasoning;

  const knowledge = await resolveKnowledge({
    context,
    mission: normalizedMission,
    complexity,
    knowledge_options,
    evaluateReusableKnowledge,
  });

  if (complexity === "large") {
    const reasoned = await runSystemReasoning({
      context,
      mission: normalizedMission,
      learned_knowledge: knowledge.learned_knowledge,
      canonical_context,
      repositoryUrl: repository_url,
      ref,
      verifiedCommitSha: verified_commit_sha,
      timeoutMs: timeout_ms,
    });
    const missionContext = assertReadyMissionContext(reasoned?.mission_context);
    return {
      success: true,
      contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT,
      status: "READY_FOR_CODE",
      complexity_class: complexity,
      route: "LEARNING_THEN_GENERAL_THEN_CODE",
      mission_context: missionContext,
      knowledge_evaluation: knowledge.evaluation,
      general_system_reasoning: {
        performed: true,
        contract: text(reasoned?.contract, 180) || null,
        repository_assessment: object(reasoned?.repository_assessment),
      },
      governance: {
        explicit_complexity_classification_required: true,
        simple_learning_retrieval_skipped: false,
        reusable_knowledge_evaluation_performed: true,
        web_research_automatically_performed: false,
        general_reasoning_performed: true,
        code_execution_started: false,
        source_mutation_performed: false,
        database_write_performed: false,
        knowledge_promotion_performed: false,
        automatic_training_effect: "NONE",
        authorization_effect: "NONE",
      },
    };
  }

  const repositoryAssessment = await assessRepository({
    context,
    repositoryUrl: repository_url,
    ref,
    verifiedCommitSha: verified_commit_sha,
    focus: normalizedMission.objective,
    timeoutMs: timeout_ms,
  });
  const repositoryContext = repositoryContextFromAssessment(repositoryAssessment);
  const missionContext = assertReadyMissionContext(
    createAvantiqoIntelligenceCodeMissionContext({
      mission: normalizedMission,
      complexity: {
        class: complexity,
        classification_source: "DETERMINISTIC_CONTROLLER_EXPLICIT",
      },
      canonical_context,
      learned_knowledge: knowledge.learned_knowledge,
      repository_context: repositoryContext,
      system_reasoning: null,
    }),
  );

  return {
    success: true,
    contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT,
    status: "READY_FOR_CODE",
    complexity_class: complexity,
    route: complexity === "simple"
      ? "DIRECT_CODE_AFTER_REPOSITORY_ASSESSMENT"
      : "LEARNING_THEN_CODE_AFTER_REPOSITORY_ASSESSMENT",
    mission_context: missionContext,
    knowledge_evaluation: knowledge.evaluation,
    general_system_reasoning: {
      performed: false,
      contract: null,
    },
    governance: {
      explicit_complexity_classification_required: true,
      simple_learning_retrieval_skipped: complexity === "simple",
      reusable_knowledge_evaluation_performed: complexity !== "simple",
      web_research_automatically_performed: false,
      general_reasoning_performed: false,
      code_execution_started: false,
      source_mutation_performed: false,
      database_write_performed: false,
      knowledge_promotion_performed: false,
      automatic_training_effect: "NONE",
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoIntelligenceCodeMissionPreparationRuntime = Object.freeze({
  contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_CONTRACT,
  resume_capsule_contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_RESUME_CAPSULE_CONTRACT,
  prepare: prepareAvantiqoIntelligenceCodeMission,
  createResumeCapsule: createAvantiqoIntelligenceCodeMissionResumeCapsule,
  bindResumeCapsuleToState: bindAvantiqoIntelligenceCodeMissionResumeCapsuleToState,
  inspectResumeCapsule: inspectAvantiqoIntelligenceCodeMissionResumeCapsule,
});

export default AvantiqoIntelligenceCodeMissionPreparationRuntime;
