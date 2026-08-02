import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.concept-plan-revision-structure.v1",
);
const OPERATION = "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1";
const PLAN_MARKER = "\nCURRENT TECHNICAL PLAN TO REVISE\n";

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

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative JSON candidate.
    }
  }

  return null;
}

function technicalPlan(input = {}) {
  const prompt = text(input.input?.prompt || input.prompt);
  const markerIndex = prompt.lastIndexOf(PLAN_MARKER);
  if (markerIndex < 0) return null;
  return parseJson(prompt.slice(markerIndex + PLAN_MARKER.length));
}

function resultPayload(result = {}) {
  const providerResult = object(result.output);
  const nestedOutput = providerResult.output;
  const candidates = [
    nestedOutput,
    object(nestedOutput).result,
    providerResult.result,
    providerResult.text,
    providerResult.content,
    result,
  ];

  for (const candidate of candidates) {
    const parsed = parseJson(candidate);
    if (!parsed) continue;
    const payload = object(parsed.result);
    return Object.keys(payload).length ? payload : parsed;
  }

  return null;
}

function normalizeRevision(plan = {}, revision = {}) {
  const originalScenes = list(plan.scenes);
  const revisedScenes = list(revision.scenes);

  if (!originalScenes.length || originalScenes.length !== revisedScenes.length) {
    return {
      revision,
      repaired: false,
      count_mismatch: true,
      corrections: [],
    };
  }

  for (let sceneIndex = 0; sceneIndex < originalScenes.length; sceneIndex += 1) {
    if (
      list(originalScenes[sceneIndex]?.shots).length !==
      list(revisedScenes[sceneIndex]?.shots).length
    ) {
      return {
        revision,
        repaired: false,
        count_mismatch: true,
        corrections: [],
      };
    }
  }

  const corrections = [];
  const scenes = originalScenes.map((originalScene, sceneIndex) => {
    const revisedScene = object(revisedScenes[sceneIndex]);
    const originalSceneId = text(originalScene?.id);
    const revisedSceneId = text(revisedScene.id);

    if (originalSceneId !== revisedSceneId) {
      corrections.push({
        type: "SCENE_ID",
        scene_index: sceneIndex + 1,
        supplied_id: revisedSceneId || null,
        restored_id: originalSceneId || null,
      });
    }

    const originalShots = list(originalScene?.shots);
    const revisedShots = list(revisedScene.shots);
    const shots = originalShots.map((originalShot, shotIndex) => {
      const revisedShot = object(revisedShots[shotIndex]);
      const originalShotId = text(originalShot?.id);
      const revisedShotId = text(revisedShot.id);

      if (originalShotId !== revisedShotId) {
        corrections.push({
          type: "SHOT_ID",
          scene_index: sceneIndex + 1,
          shot_index: shotIndex + 1,
          supplied_id: revisedShotId || null,
          restored_id: originalShotId || null,
        });
      }

      return {
        ...revisedShot,
        id: originalShotId,
      };
    });

    return {
      ...revisedScene,
      id: originalSceneId,
      shots,
    };
  });

  return {
    revision: {
      ...revision,
      scenes,
      structure_repair: {
        contract: "CREATIVE_CONCEPT_PLAN_REVISION_STRUCTURE_REPAIR_V1",
        applied: corrections.length > 0,
        scene_count_preserved: true,
        shot_counts_preserved: true,
        chronological_order_preserved: true,
        original_identifiers_authoritative: true,
        provider_content_preserved: true,
        corrections,
      },
    },
    repaired: corrections.length > 0,
    count_mismatch: false,
    corrections,
  };
}

function withPayload(result = {}, payload = {}) {
  const providerResult = object(result.output);
  const nested = object(providerResult.output);
  const serialized = JSON.stringify(payload);

  if (Object.keys(nested).length) {
    if (Object.keys(object(nested.result)).length) {
      return {
        ...result,
        output: {
          ...providerResult,
          output: {
            ...nested,
            result: payload,
            text: serialized,
          },
        },
      };
    }

    return {
      ...result,
      output: {
        ...providerResult,
        output: {
          ...nested,
          ...payload,
          text: serialized,
        },
      },
    };
  }

  if (Object.keys(object(providerResult.result)).length) {
    return {
      ...result,
      output: {
        ...providerResult,
        result: payload,
        text: serialized,
      },
    };
  }

  return {
    ...result,
    output: {
      ...providerResult,
      ...payload,
      text: serialized,
    },
  };
}

export function installCreativeConceptPlanRevisionStructureRuntime() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutStructureRepair = ServiceExecutionRuntime.execute.bind(
    ServiceExecutionRuntime,
  );

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithConceptPlanRevisionStructure(input = {}) {
      const result = await executeWithoutStructureRepair(input);
      const operation = text(input.metadata?.operation).toUpperCase();
      if (
        text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
        operation !== OPERATION
      ) {
        return result;
      }

      const plan = technicalPlan(input);
      const revision = resultPayload(result);
      if (!plan || !revision) return result;

      const normalized = normalizeRevision(plan, revision);
      if (normalized.count_mismatch) return result;
      return withPayload(result, normalized.revision);
    };
}

installCreativeConceptPlanRevisionStructureRuntime();

export const CreativeConceptPlanRevisionStructureRuntime = {
  installed: true,
};
