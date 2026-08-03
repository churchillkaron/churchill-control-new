import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  assertTemporalSemanticPlan,
  validateTemporalSemanticPlan,
} from "@/lib/creative/director/validation/CreativeTemporalSemanticPlanValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-role-language-polish.v2",
);
const CONTRACT = "CREATIVE_TEMPORAL_ROLE_LANGUAGE_POLISH_V2";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function polishedText(value, { title = false } = {}) {
  const source = String(value ?? "");
  if (!source) return source;

  let result = source
    .replace(/\bthe participant journey\b/gi, "the protagonist's journey")
    .replace(/\bthe participant story\b/gi, "the protagonist's story")
    .replace(/\boriginal participant\b/gi, "protagonist")
    .replace(/\bparticipant welcome\b/gi, "warm personal welcome")
    .replace(/\bparticipants'\b/gi, "guests'")
    .replace(/\bparticipant's\b/gi, "protagonist's")
    .replace(/\bthe participants\b/gi, "the guests")
    .replace(/\bthe participant\b/gi, "the protagonist")
    .replace(/\bparticipants\b/gi, "guests")
    .replace(/\bparticipant\b/gi, "protagonist");

  if (title) {
    result = result
      .replace(/\bThe protagonist\b/g, "The Protagonist")
      .replace(/\bthe protagonist\b/g, "the Protagonist");
  }

  return result;
}

function polishValue(value) {
  if (typeof value === "string") return polishedText(value);
  if (Array.isArray(value)) return value.map(polishValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, polishValue(entry)]),
    );
  }
  return value;
}

function polishShot(shot = {}) {
  const recursivelyPolished = object(polishValue(shot));
  const generation = object(recursivelyPolished.generation);
  return {
    ...recursivelyPolished,
    title: polishedText(recursivelyPolished.title, { title: true }),
    purpose: polishedText(recursivelyPolished.purpose),
    subject: polishedText(recursivelyPolished.subject),
    action: polishedText(recursivelyPolished.action),
    performance: polishedText(recursivelyPolished.performance),
    provider_prompt: polishedText(recursivelyPolished.provider_prompt),
    generation: {
      ...generation,
      provider_prompt: polishedText(generation.provider_prompt),
      provider_parameters: polishValue(
        object(generation.provider_parameters),
      ),
    },
    cast_contract: polishValue(object(recursivelyPolished.cast_contract)),
    performance_contract: polishValue(
      object(recursivelyPolished.performance_contract),
    ),
    metadata: {
      ...object(recursivelyPolished.metadata),
      temporal_role_language_polish: {
        contract: CONTRACT,
        applied: true,
        full_plan_recursive: true,
        provider_execution_required: false,
        customer_charge_required: false,
      },
    },
  };
}

function polishPlan(plan = {}) {
  const recursivelyPolished = object(polishValue(plan));
  const scenes = list(recursivelyPolished.scenes).map((scene) => ({
    ...scene,
    title: polishedText(scene.title, { title: true }),
    shots: list(scene.shots).map(polishShot),
  }));

  const polished = {
    ...recursivelyPolished,
    scenes,
    production: {
      ...object(recursivelyPolished.production),
      temporal_role_language_polish_contract: CONTRACT,
      temporal_role_language_polish_full_plan_recursive: true,
      temporal_role_language_polish_provider_execution: false,
      temporal_role_language_polish_customer_charge: false,
    },
  };

  const participantTerms = JSON.stringify(polished).match(
    /\bparticipant(?:s|'s|s')?\b/gi,
  ) || [];
  if (participantTerms.length) {
    throw new Error(
      `CREATIVE_TEMPORAL_ROLE_LANGUAGE_POLISH_INCOMPLETE:` +
      `remaining=${participantTerms.length}`,
    );
  }

  const validation = validateTemporalSemanticPlan(polished);
  assertTemporalSemanticPlan(polished);

  return {
    plan: {
      ...polished,
      validation: {
        ...object(polished.validation),
        passed: true,
        temporal_semantic_validation: validation,
        temporal_role_language_polish: {
          contract: CONTRACT,
          applied: true,
          full_plan_recursive: true,
          remaining_participant_terms: 0,
          provider_execution_required: false,
          customer_charge_required: false,
        },
      },
    },
    validation,
  };
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutRoleLanguagePolish =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithTemporalRoleLanguagePolish(input = {}) {
      const result = await createWithoutRoleLanguagePolish(input);
      const plan = object(result?.plan);
      const temporal = text(plan.workflow_kind).toUpperCase() === "TEMPORAL";
      const repaired =
        plan.validation?.temporal_semantic_repair?.applied === true;

      if (!temporal || !repaired) return result;

      const polished = polishPlan(plan);
      return {
        ...result,
        plan: polished.plan,
        validation: {
          ...object(result.validation),
          passed: true,
          temporal_semantic_validation: polished.validation,
          temporal_role_language_polish: {
            contract: CONTRACT,
            applied: true,
            full_plan_recursive: true,
            remaining_participant_terms: 0,
            provider_execution_required: false,
            customer_charge_required: false,
          },
        },
      };
    };
}

install();

export const CreativeTemporalRoleLanguagePolishRuntime = {
  installed: true,
  polishPlan,
};
