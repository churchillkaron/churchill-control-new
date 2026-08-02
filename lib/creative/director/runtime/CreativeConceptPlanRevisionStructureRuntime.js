import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.concept-plan-revision-structure.v2",
);
const OPERATION = "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1";
const PLAN_MARKER = "\nCURRENT TECHNICAL PLAN TO REVISE\n";
const REPAIR_CONTRACT =
  "CREATIVE_CONCEPT_PLAN_REVISION_STRUCTURE_REPAIR_V2";

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

function selectByIdThenPosition({
  items = [],
  id,
  position,
  used,
}) {
  const exactIndex = items.findIndex((item, index) =>
    !used.has(index) &&
    text(item?.id) &&
    text(item?.id) === text(id),
  );
  if (exactIndex >= 0) {
    used.add(exactIndex);
    return {
      value: object(items[exactIndex]),
      source_index: exactIndex,
      match: "ID",
    };
  }

  if (position < items.length && !used.has(position)) {
    used.add(position);
    return {
      value: object(items[position]),
      source_index: position,
      match: "POSITION",
    };
  }

  const firstUnused = items.findIndex((item, index) =>
    item && !used.has(index),
  );
  if (firstUnused >= 0) {
    used.add(firstUnused);
    return {
      value: object(items[firstUnused]),
      source_index: firstUnused,
      match: "NEXT_AVAILABLE",
    };
  }

  return {
    value: {},
    source_index: null,
    match: "MISSING",
  };
}

function normalizeRevision(plan = {}, revision = {}) {
  const originalScenes = list(plan.scenes);
  const revisedScenes = list(revision.scenes);
  if (!originalScenes.length) return null;

  const corrections = [];
  const usedSceneIndexes = new Set();

  if (originalScenes.length !== revisedScenes.length) {
    corrections.push({
      type: "SCENE_COUNT_RECONCILED",
      supplied_count: revisedScenes.length,
      authoritative_count: originalScenes.length,
    });
  }

  const scenes = originalScenes.map((originalScene, sceneIndex) => {
    const sceneSelection = selectByIdThenPosition({
      items: revisedScenes,
      id: originalScene?.id,
      position: sceneIndex,
      used: usedSceneIndexes,
    });
    const revisedScene = sceneSelection.value;
    const originalSceneId = text(originalScene?.id);
    const revisedSceneId = text(revisedScene.id);

    if (sceneSelection.match === "MISSING") {
      corrections.push({
        type: "SCENE_MISSING_PRESERVED_FROM_TECHNICAL_PLAN",
        scene_index: sceneIndex + 1,
        restored_id: originalSceneId || null,
      });
    } else if (
      revisedSceneId !== originalSceneId ||
      sceneSelection.source_index !== sceneIndex
    ) {
      corrections.push({
        type: "SCENE_RECONCILED",
        scene_index: sceneIndex + 1,
        source_scene_index:
          sceneSelection.source_index === null
            ? null
            : sceneSelection.source_index + 1,
        match: sceneSelection.match,
        supplied_id: revisedSceneId || null,
        restored_id: originalSceneId || null,
      });
    }

    const originalShots = list(originalScene?.shots);
    const revisedShots = list(revisedScene.shots);
    const usedShotIndexes = new Set();

    if (originalShots.length !== revisedShots.length) {
      corrections.push({
        type: "SHOT_COUNT_RECONCILED",
        scene_index: sceneIndex + 1,
        scene_id: originalSceneId || null,
        supplied_count: revisedShots.length,
        authoritative_count: originalShots.length,
      });
    }

    const shots = originalShots.map((originalShot, shotIndex) => {
      const shotSelection = selectByIdThenPosition({
        items: revisedShots,
        id: originalShot?.id,
        position: shotIndex,
        used: usedShotIndexes,
      });
      const revisedShot = shotSelection.value;
      const originalShotId = text(originalShot?.id);
      const revisedShotId = text(revisedShot.id);
      const missing = shotSelection.match === "MISSING";

      if (missing) {
        corrections.push({
          type: "SHOT_MISSING_PRESERVED_FROM_TECHNICAL_PLAN",
          scene_index: sceneIndex + 1,
          shot_index: shotIndex + 1,
          restored_id: originalShotId || null,
        });
      } else if (
        revisedShotId !== originalShotId ||
        shotSelection.source_index !== shotIndex
      ) {
        corrections.push({
          type: "SHOT_RECONCILED",
          scene_index: sceneIndex + 1,
          shot_index: shotIndex + 1,
          source_shot_index:
            shotSelection.source_index === null
              ? null
              : shotSelection.source_index + 1,
          match: shotSelection.match,
          supplied_id: revisedShotId || null,
          restored_id: originalShotId || null,
        });
      }

      return {
        ...revisedShot,
        id: originalShotId,
        metadata: {
          ...object(revisedShot.metadata),
          concept_plan_revision_structure_repair: {
            contract: REPAIR_CONTRACT,
            scene_index: sceneIndex + 1,
            shot_index: shotIndex + 1,
            source_shot_index:
              shotSelection.source_index === null
                ? null
                : shotSelection.source_index + 1,
            match: shotSelection.match,
            technical_plan_content_preserved: missing,
            original_identifier_restored:
              missing || revisedShotId !== originalShotId,
          },
        },
      };
    });

    const ignoredShotIndexes = revisedShots
      .map((_, index) => index)
      .filter((index) => !usedShotIndexes.has(index));
    for (const ignoredIndex of ignoredShotIndexes) {
      corrections.push({
        type: "EXTRA_REVISION_SHOT_IGNORED",
        scene_index: sceneIndex + 1,
        source_shot_index: ignoredIndex + 1,
        supplied_id: text(revisedShots[ignoredIndex]?.id) || null,
      });
    }

    return {
      ...revisedScene,
      id: originalSceneId,
      shots,
      metadata: {
        ...object(revisedScene.metadata),
        concept_plan_revision_structure_repair: {
          contract: REPAIR_CONTRACT,
          scene_index: sceneIndex + 1,
          source_scene_index:
            sceneSelection.source_index === null
              ? null
              : sceneSelection.source_index + 1,
          match: sceneSelection.match,
          technical_plan_content_preserved:
            sceneSelection.match === "MISSING",
          original_identifier_restored:
            sceneSelection.match === "MISSING" ||
            revisedSceneId !== originalSceneId,
          authoritative_shot_count: originalShots.length,
          supplied_shot_count: revisedShots.length,
        },
      },
    };
  });

  const ignoredSceneIndexes = revisedScenes
    .map((_, index) => index)
    .filter((index) => !usedSceneIndexes.has(index));
  for (const ignoredIndex of ignoredSceneIndexes) {
    corrections.push({
      type: "EXTRA_REVISION_SCENE_IGNORED",
      source_scene_index: ignoredIndex + 1,
      supplied_id: text(revisedScenes[ignoredIndex]?.id) || null,
    });
  }

  const evidence = {
    contract: REPAIR_CONTRACT,
    applied: corrections.length > 0,
    provider_revision_scene_count: revisedScenes.length,
    authoritative_scene_count: originalScenes.length,
    scene_count_preserved: true,
    shot_counts_preserved: true,
    chronological_order_preserved: true,
    original_identifiers_authoritative: true,
    technical_service_contracts_preserved: true,
    missing_revision_content_falls_back_to_technical_plan: true,
    extra_revision_content_ignored: true,
    new_provider_execution_required: false,
    new_customer_charge_required: false,
    corrections,
  };

  return {
    ...revision,
    scenes,
    story_architecture: {
      ...object(revision.story_architecture),
      concept_plan_revision_structure_repair: evidence,
    },
    structure_repair: evidence,
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
      return normalized ? withPayload(result, normalized) : result;
    };
}

installCreativeConceptPlanRevisionStructureRuntime();

export const CreativeConceptPlanRevisionStructureRuntime = {
  installed: true,
};
