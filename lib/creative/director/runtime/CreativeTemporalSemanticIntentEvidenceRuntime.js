import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-intent-evidence.v1",
);
const CONTRACT = "CREATIVE_TEMPORAL_SEMANTIC_INTENT_EVIDENCE_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function compact(values = []) {
  return [...new Set(
    values
      .flat(Infinity)
      .map(text)
      .filter(Boolean),
  )];
}

function intentEvidence(input = {}) {
  const mission = object(input.mission);
  const project = object(input.project);
  const brief = object(input.brief);

  return compact([
    input.intent,
    input.command,
    input.objective,
    input.business_goal,
    input.request,
    mission.title,
    mission.objective,
    mission.business_goal,
    mission.description,
    mission.metadata?.original_intent,
    mission.metadata?.command,
    project.name,
    project.title,
    project.objective,
    project.business_goal,
    project.description,
    project.metadata?.original_intent,
    project.metadata?.command,
    brief.title,
    brief.objective,
    brief.creative_objective,
    brief.business_goal,
    brief.description,
    brief.requested_action,
    brief.metadata?.original_intent,
    brief.metadata?.command,
    list(input.assets).map((asset) =>
      asset?.name ||
      asset?.title ||
      asset?.file_name ||
      asset?.metadata?.original_file_name,
    ),
  ]).join("\n");
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutIntentEvidence =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithTemporalSemanticIntentEvidence(input = {}) {
      const result = await createWithoutIntentEvidence(input);
      const plan = object(result?.plan);
      if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
        return result;
      }

      const evidence = intentEvidence(input);
      if (!evidence) return result;

      return {
        ...result,
        plan: {
          ...plan,
          concept: {
            ...object(plan.concept),
            request_intent_evidence: evidence,
          },
          validation: {
            ...object(plan.validation),
            temporal_semantic_intent_evidence: {
              contract: CONTRACT,
              present: true,
              source_count: evidence.split("\n").filter(Boolean).length,
              provider_execution_required: false,
              customer_charge_required: false,
            },
          },
        },
      };
    };
}

install();

export const CreativeTemporalSemanticIntentEvidenceRuntime = {
  installed: true,
  intentEvidence,
};
