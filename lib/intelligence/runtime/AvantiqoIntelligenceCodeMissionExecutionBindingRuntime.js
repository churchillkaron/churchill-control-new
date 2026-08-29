import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
  createAvantiqoIntelligenceCodeMissionContext,
} from "./AvantiqoIntelligenceCodeMissionRuntime.js";

export const AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT =
  "AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_V1";

const MAX_CODE_OBJECTIVE_CHARS = 5000;
const MAX_CONTEXT_SUMMARY_CHARS = 900;
const MAX_COMPLETION_CRITERIA = 6;
const MAX_CRITERION_CHARS = 700;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function rawText(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value, limit = 80, itemLimit = 1600) {
  return [...new Set(
    list(value)
      .map((item) => text(item, itemLimit))
      .filter(Boolean),
  )].slice(0, limit);
}

function normalizeRepositoryUrl(value) {
  return text(value, 1000).replace(/\/+$/, "").replace(/\.git$/i, "");
}

function normalizeRef(value) {
  return text(value, 240) || "main";
}

function exactHead(left, right) {
  const a = text(left, 160).toLowerCase();
  const b = text(right, 160).toLowerCase();
  return Boolean(a && b && a === b);
}

function fullRepositoryHead(value) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(text(value, 160).toLowerCase());
}

function existingCompletionCriteria(value = {}) {
  const source = object(value);
  return [
    source.completion_criterion_1,
    source.completion_criterion_2,
    source.completion_criterion_3,
    source.completion_criterion_4,
    source.completion_criterion_5,
    source.completion_criterion_6,
  ].map((item) => text(item, MAX_CRITERION_CHARS)).filter(Boolean);
}

function packCompletionCriteria(items) {
  const unique = strings(items, 80, MAX_CRITERION_CHARS);
  if (unique.length <= MAX_COMPLETION_CRITERIA) return unique;
  const first = unique.slice(0, MAX_COMPLETION_CRITERIA - 1);
  const remainder = unique.slice(MAX_COMPLETION_CRITERIA - 1);
  const packed = text(
    `Additional required outcomes: ${remainder.join("; ")}`,
    MAX_CRITERION_CHARS,
  );
  return [...first, packed];
}

function reusableKnowledgeSummary(missionContext) {
  return list(missionContext?.learned_knowledge?.knowledge)
    .filter((item) => item?.reusable === true)
    .slice(0, 2)
    .map((item) => {
      const subject = text(item?.subject, 100);
      const content = text(item?.content, 220);
      return [subject, content].filter(Boolean).join(": ");
    })
    .filter(Boolean);
}

function executionContextSummary(missionContext) {
  const reasoning = object(missionContext?.system_reasoning);
  const knowledge = reusableKnowledgeSummary(missionContext);
  const parts = [
    `AVANTIQO UNIFIED INTELLIGENCE CONTEXT. Mission=${text(missionContext?.mission?.id, 120)}; complexity=${text(missionContext?.complexity?.class, 40)}.`,
    "Context is engineering evidence only: current repository state is execution authority and this context never grants authorization.",
  ];
  if (reasoning.architecture_recommendation) {
    parts.push(`Architecture: ${text(reasoning.architecture_recommendation, 260)}.`);
  }
  const shared = strings(reasoning.shared_primitives, 4, 100);
  if (shared.length) parts.push(`Reuse shared primitives: ${shared.join(", ")}.`);
  const invariants = strings(reasoning.invariants, 3, 120);
  if (invariants.length) parts.push(`Preserve invariants: ${invariants.join("; ")}.`);
  if (knowledge.length) {
    parts.push(`Verified reusable knowledge: ${knowledge.join(" | ")}.`);
  }
  const verification = strings(reasoning.verification_requirements, 2, 140);
  if (verification.length) {
    parts.push(`Verification requirements: ${verification.join("; ")}.`);
  }
  return text(parts.join(" "), MAX_CONTEXT_SUMMARY_CHARS);
}

function bindObjective(baseObjective, missionContext) {
  const objective = rawText(baseObjective);
  if (!objective) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_OBJECTIVE_REQUIRED");
  }
  if (objective.length > MAX_CODE_OBJECTIVE_CHARS) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_OBJECTIVE_TOO_LARGE");
  }
  const summary = executionContextSummary(missionContext);
  const available = Math.max(0, MAX_CODE_OBJECTIVE_CHARS - objective.length - 2);
  if (!summary || available < 80) return objective;
  return `${objective}\n\n${text(summary, available)}`;
}

function bindObjectiveContext(baseContext, missionContext) {
  const source = object(baseContext);
  const expectedHead = text(missionContext?.repository_context?.head_sha, 160).toLowerCase();
  const suppliedHead = text(source.repository_head_observed, 160).toLowerCase();
  if (suppliedHead && !exactHead(suppliedHead, expectedHead)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_OBJECTIVE_CONTEXT_HEAD_MISMATCH",
    );
  }

  const reasoningCriteria = strings(
    missionContext?.system_reasoning?.completion_criteria,
    80,
    MAX_CRITERION_CHARS,
  );
  const criteria = packCompletionCriteria([
    ...existingCompletionCriteria(source),
    ...reasoningCriteria,
  ]);
  const bound = {
    ...source,
    repository_head_observed: expectedHead,
  };
  for (let index = 0; index < MAX_COMPLETION_CRITERIA; index += 1) {
    const key = `completion_criterion_${index + 1}`;
    if (criteria[index]) bound[key] = criteria[index];
    else delete bound[key];
  }
  return bound;
}

export function bindAvantiqoIntelligenceCodeMissionExecution({
  mission_context,
  objective,
  repository_url,
  ref = "main",
  objective_context = null,
} = {}) {
  const missionContext = createAvantiqoIntelligenceCodeMissionContext(mission_context);
  if (missionContext.contract !== AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_CONTRACT_INVALID");
  }
  if (missionContext.status !== "READY_FOR_CODE") {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_NOT_READY");
  }

  const publicObjective = rawText(objective);
  if (rawText(missionContext.mission?.objective) !== publicObjective) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_OBJECTIVE_MISMATCH");
  }
  if (
    normalizeRepositoryUrl(missionContext.repository_context?.repository_url) !==
    normalizeRepositoryUrl(repository_url)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_REPOSITORY_MISMATCH");
  }
  if (normalizeRef(missionContext.repository_context?.ref) !== normalizeRef(ref)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_REF_MISMATCH");
  }
  if (!fullRepositoryHead(missionContext.repository_context?.head_sha)) {
    throw new Error(
      "AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_FULL_REPOSITORY_HEAD_REQUIRED",
    );
  }

  const boundObjectiveContext = bindObjectiveContext(objective_context, missionContext);
  const codeObjective = bindObjective(publicObjective, missionContext);
  const reusableKnowledgeCount = list(missionContext.learned_knowledge?.knowledge)
    .filter((item) => item?.reusable === true).length;

  return {
    success: true,
    contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT,
    status: "BOUND_FOR_CODE_EXECUTION",
    mission_context: missionContext,
    code_objective: codeObjective,
    objective_context: boundObjectiveContext,
    repository: {
      repository_url: missionContext.repository_context.repository_url,
      ref: missionContext.repository_context.ref,
      expected_head: missionContext.repository_context.head_sha,
      pre_mutation_reconciliation_required: true,
    },
    context_consumption: {
      learned_knowledge_evaluated: missionContext.learned_knowledge?.evaluated === true,
      reusable_knowledge_item_count: reusableKnowledgeCount,
      general_system_reasoning_consumed: Boolean(missionContext.system_reasoning),
      general_completion_criteria_bound: strings(
        missionContext.system_reasoning?.completion_criteria,
        80,
        MAX_CRITERION_CHARS,
      ).length,
      bounded_context_summary_in_existing_reasoning_call: codeObjective !== publicObjective,
      additional_reasoning_call_required: false,
    },
    governance: {
      current_repository_is_execution_authority: true,
      repository_head_reconcile_before_mutation: true,
      context_authorization_effect: "NONE",
      knowledge_authorizes_execution: false,
      model_call_performed: false,
      provider_call_performed: false,
      source_mutation_performed: false,
      database_write_performed: false,
      automatic_knowledge_promotion: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const AvantiqoIntelligenceCodeMissionExecutionBindingRuntime = Object.freeze({
  contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_EXECUTION_BINDING_CONTRACT,
  max_code_objective_chars: MAX_CODE_OBJECTIVE_CHARS,
  max_context_summary_chars: MAX_CONTEXT_SUMMARY_CHARS,
  bind: bindAvantiqoIntelligenceCodeMissionExecution,
});

export default AvantiqoIntelligenceCodeMissionExecutionBindingRuntime;
