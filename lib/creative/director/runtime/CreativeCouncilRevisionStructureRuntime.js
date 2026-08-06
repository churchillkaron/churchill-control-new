import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.council-revision-structure.v1",
);
const TARGET_OPERATION =
  "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1";
const PLAN_MARKER = "CURRENT TECHNICAL PLAN TO REVISE";

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

function extractBalancedObject(source, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function originalPlanFromPrompt(prompt) {
  const source = text(prompt);
  const markerIndex = source.lastIndexOf(PLAN_MARKER);
  if (markerIndex < 0) {
    throw new Error("CREATIVE_COUNCIL_REVISION_ORIGINAL_PLAN_MARKER_MISSING");
  }
  const objectStart = source.indexOf("{", markerIndex + PLAN_MARKER.length);
  if (objectStart < 0) {
    throw new Error("CREATIVE_COUNCIL_REVISION_ORIGINAL_PLAN_JSON_MISSING");
  }
  const candidate = extractBalancedObject(source, objectStart);
  if (!candidate) {
    throw new Error("CREATIVE_COUNCIL_REVISION_ORIGINAL_PLAN_JSON_UNBALANCED");
  }
  const parsed = JSON.parse(candidate);
  if (!list(parsed.scenes).length) {
    throw new Error("CREATIVE_COUNCIL_REVISION_ORIGINAL_PLAN_SCENES_MISSING");
  }
  return parsed;
}

function normalizedPayload(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.result || value;
  }
  return null;
}

function setNormalizedPayload(result, payload) {
  if (result?.output?.output && typeof result.output.output === "object") {
    return {
      ...result,
      output: {
        ...result.output,
        output: payload,
      },
    };
  }
  if (result?.output && typeof result.output === "object") {
    const output = object(result.output);
    if (output.result && typeof output.result === "object") {
      return {
        ...result,
        output: {
          ...output,
          result: payload,
        },
      };
    }
    return { ...result, output: payload };
  }
  return { ...result, output: payload };
}

function pickByIdOrIndex(items, id, index, used) {
  const exactIndex = items.findIndex(
    (item, candidateIndex) =>
      !used.has(candidateIndex) && text(item?.id) === id,
  );
  if (exactIndex >= 0) {
    used.add(exactIndex);
    return { item: items[exactIndex], mode: "ID" };
  }
  if (index < items.length && !used.has(index)) {
    used.add(index);
    return { item: items[index], mode: "INDEX" };
  }
  return { item: null, mode: "ORIGINAL" };
}

function reconcileRevision(originalPlan, revision) {
  const originalScenes = list(originalPlan.scenes);
  const revisedScenes = list(revision.scenes);
  const usedScenes = new Set();
  const evidence = {
    contract: "CREATIVE_COUNCIL_REVISION_STRUCTURE_RECONCILIATION_V1",
    original_scene_count: originalScenes.length,
    provider_scene_count: revisedScenes.length,
    restored_scene_count: 0,
    dropped_scene_count: 0,
    original_shot_count: 0,
    provider_shot_count: 0,
    restored_shot_count: 0,
    dropped_shot_count: 0,
    scene_matches_by_id: 0,
    scene_matches_by_index: 0,
    shot_matches_by_id: 0,
    shot_matches_by_index: 0,
  };

  const scenes = originalScenes.map((originalScene, sceneIndex) => {
    const sceneMatch = pickByIdOrIndex(
      revisedScenes,
      text(originalScene.id),
      sceneIndex,
      usedScenes,
    );
    if (sceneMatch.mode === "ID") evidence.scene_matches_by_id += 1;
    if (sceneMatch.mode === "INDEX") evidence.scene_matches_by_index += 1;
    if (!sceneMatch.item) evidence.restored_scene_count += 1;

    const revisedScene = object(sceneMatch.item);
    const originalShots = list(originalScene.shots);
    const revisedShots = list(revisedScene.shots);
    const usedShots = new Set();
    evidence.original_shot_count += originalShots.length;
    evidence.provider_shot_count += revisedShots.length;

    const shots = originalShots.map((originalShot, shotIndex) => {
      const shotMatch = pickByIdOrIndex(
        revisedShots,
        text(originalShot.id),
        shotIndex,
        usedShots,
      );
      if (shotMatch.mode === "ID") evidence.shot_matches_by_id += 1;
      if (shotMatch.mode === "INDEX") evidence.shot_matches_by_index += 1;
      if (!shotMatch.item) evidence.restored_shot_count += 1;
      return {
        ...object(originalShot),
        ...object(shotMatch.item),
        id: originalShot.id,
      };
    });

    evidence.dropped_shot_count += Math.max(
      0,
      revisedShots.length - usedShots.size,
    );

    return {
      ...object(originalScene),
      ...revisedScene,
      id: originalScene.id,
      shots,
    };
  });

  evidence.dropped_scene_count = Math.max(
    0,
    revisedScenes.length - usedScenes.size,
  );

  return {
    ...object(revision),
    scenes,
    metadata: {
      ...object(revision.metadata),
      revision_structure_reconciliation: evidence,
    },
  };
}

export function installCreativeCouncilRevisionStructureRuntime() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;
  const executeWithoutStructure =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithCouncilRevisionStructure(input = {}) {
      const result = await executeWithoutStructure(input);
      const operation = text(input.metadata?.operation).toUpperCase();
      if (
        text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
        operation !== TARGET_OPERATION
      ) {
        return result;
      }

      const originalPlan = originalPlanFromPrompt(
        input.input?.prompt || input.prompt,
      );
      const revision = normalizedPayload(result);
      if (!revision) {
        throw new Error("CREATIVE_COUNCIL_REVISION_JSON_REQUIRED");
      }
      const reconciled = reconcileRevision(originalPlan, revision);
      const evidence = reconciled.metadata?.revision_structure_reconciliation;
      console.log(
        `CREATIVE_COUNCIL_REVISION_STRUCTURE_RECONCILED=${JSON.stringify(evidence)}`,
      );
      return setNormalizedPayload(result, reconciled);
    };
}

installCreativeCouncilRevisionStructureRuntime();

export const CreativeCouncilRevisionStructureRuntime = Object.freeze({
  installed: true,
  operation: TARGET_OPERATION,
});
