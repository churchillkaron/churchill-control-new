import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  assertTemporalSemanticPlan,
  validateTemporalSemanticPlan,
} from "@/lib/creative/director/validation/CreativeTemporalSemanticPlanValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-role-language-polish.v1",
);
const CONTRACT = "CREATIVE_TEMPORAL_ROLE_LANGUAGE_POLISH_V1";

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
    .replace(/\bparticipant's\b/gi, "protagonist's")
    .replace(/\bparticipant welcome\b/gi, "warm personal welcome")
    .replace(/\bthe participant\b/gi, "the protagonist");

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
  const generation = object(shot.generation);
  return {
    ...shot,
    title: polishedText(shot.title, { title: true }),
    purpose: polishedText(shot.purpose),
    subject: polishedText(shot.subject),
    action: polishedText(shot.action),
    performance: polishedText(shot.performance),
    provider_prompt: polishedText(shot.provider_prompt),
    generation: {
      ...generation,
      provider_prompt: polishedText(generation.provider_prompt),
      provider_parameters: polishValue(
        object(generation.provider_parameters),
      ),
    },
    cast_contract: polishValue(object(shot.cast_contract)),
    performance_contract: polishValue(
      object(shot.performance_contract),
    ),
    metadata: {
      ...object(shot.metadata),
      temporal_role_language_polish: {
        contract: CONTRACT,
        applied: true,
        provider_execution_required: false,
        customer_charge_required: false,
      },
    },
  };
}

function polishPlan(plan = {}) {
  const scenes = list(plan.scenes).map((scene) => ({
    ...scene,
    shots: list(scene.shots).map(polishShot),
  }));

  const polished = {
    ...plan,
    scenes,
    production: {
      ...object(plan.production),
      temporal_role_language_polish_contract: CONTRACT,
      temporal_role_language_polish_provider_execution: false,
      temporal_role_language_polish_customer_charge: false,
    },
  };

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
