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
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) {
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
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_PREPARATION_FULL_REPOSITORY_HEAD_REQUIRED",
    );
  }
  return context;
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
  prepare: prepareAvantiqoIntelligenceCodeMission,
});

export default AvantiqoIntelligenceCodeMissionPreparationRuntime;
