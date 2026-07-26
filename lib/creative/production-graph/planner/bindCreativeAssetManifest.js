function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function assetId(value) {
  return text(value?.asset_id || value?.assetId || value?.id || value);
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function planSceneFor(scene, planScenes) {
  const index = Number(scene.metadata?.master_plan_index);
  if (Number.isInteger(index) && planScenes[index]) return planScenes[index];
  return planScenes.find((candidate) => text(candidate.id) === text(scene.id)) || null;
}

function planShotFor(shot, planScene) {
  const index = Number(shot.metadata?.master_plan_shot_index);
  if (Number.isInteger(index) && planScene?.shots?.[index]) return planScene.shots[index];
  return list(planScene?.shots).find((candidate) => text(candidate.id) === text(shot.id)) || null;
}

function referenceEntry(id, disposition, manifestEntry) {
  return {
    asset_id: id,
    role: disposition,
    restrictions: manifestEntry.restrictions || {},
    continuity_anchors: manifestEntry.continuity_anchors || {},
    repair_requirements: list(manifestEntry.repair_requirements),
  };
}

export function bindCreativeAssetManifest({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const planScenes = list(creative_plan.scenes);
  const deliverableIds = new Set(list(creative_plan.deliverables).map((item) => text(item.id)).filter(Boolean));
  const sceneTargets = new Map();
  const shotTargets = new Map();
  const shotPlanByPersistedId = new Map();

  for (const scene of scenes) {
    const planScene = planSceneFor(scene, planScenes);
    if (!planScene?.id) {
      throw new Error(`CREATIVE_ASSET_BINDING_SCENE_PLAN_REQUIRED:${scene.id}`);
    }
    sceneTargets.set(text(planScene.id), text(scene.id));

    for (const shot of shots.filter((candidate) => candidate.scene_id === scene.id)) {
      const planShot = planShotFor(shot, planScene);
      if (!planShot?.id) {
        throw new Error(`CREATIVE_ASSET_BINDING_SHOT_PLAN_REQUIRED:${shot.id}`);
      }
      shotTargets.set(text(planShot.id), text(shot.id));
      shotPlanByPersistedId.set(text(shot.id), planShot);
    }
  }

  const allTargetIds = new Set([
    ...deliverableIds,
    ...sceneTargets.keys(),
    ...shotTargets.keys(),
  ]);
  const directByShot = new Map();
  const referenceByShot = new Map();
  const evidence = [];

  function targetShotIds(assignment) {
    if (shotTargets.has(assignment)) return [shotTargets.get(assignment)];
    if (sceneTargets.has(assignment)) {
      const sceneId = sceneTargets.get(assignment);
      return shots.filter((shot) => text(shot.scene_id) === sceneId).map((shot) => text(shot.id));
    }
    if (deliverableIds.has(assignment)) return shots.map((shot) => text(shot.id));
    return [];
  }

  for (const entry of list(creative_plan.asset_manifest)) {
    const id = assetId(entry);
    if (!id) throw new Error("CREATIVE_ASSET_BINDING_ASSET_ID_REQUIRED");
    const disposition = text(entry.disposition).toUpperCase();
    if (disposition === "EXCLUDE") continue;

    const assignments = unique(list(entry.assignments));
    if (!assignments.length) {
      throw new Error(`CREATIVE_ASSET_BINDING_ASSIGNMENT_REQUIRED:${id}`);
    }
    const unknown = assignments.filter((assignment) => !allTargetIds.has(assignment));
    if (unknown.length) {
      throw new Error(`CREATIVE_ASSET_BINDING_TARGET_UNKNOWN:${id}:${unknown.join(",")}`);
    }

    const boundShotIds = unique(assignments.flatMap(targetShotIds));
    if (!boundShotIds.length) {
      throw new Error(`CREATIVE_ASSET_BINDING_TARGET_EMPTY:${id}`);
    }

    for (const shotId of boundShotIds) {
      if (disposition === "ASSIGNED") {
        directByShot.set(shotId, unique([...(directByShot.get(shotId) || []), id]));
      } else if (["REFERENCE", "REGENERATE"].includes(disposition)) {
        const current = referenceByShot.get(shotId) || [];
        if (!current.some((item) => item.asset_id === id)) {
          current.push(referenceEntry(id, disposition, entry));
        }
        referenceByShot.set(shotId, current);
      } else {
        throw new Error(`CREATIVE_ASSET_BINDING_DISPOSITION_INVALID:${id}:${disposition}`);
      }
    }

    evidence.push({
      asset_id: id,
      disposition,
      assignments,
      persisted_shot_ids: boundShotIds,
    });
  }

  const boundShots = shots.map((shot) => {
    const id = text(shot.id);
    const planShot = shotPlanByPersistedId.get(id) || {};
    const direct = unique([...(list(shot.assets)), ...(directByShot.get(id) || [])]);
    const references = [
      ...list(shot.reference_assets),
      ...(referenceByShot.get(id) || []),
    ];
    const referenceIds = unique([
      ...list(shot.reference_asset_ids),
      ...references.map((item) => assetId(item)),
    ]);

    return {
      ...shot,
      assets: direct,
      reference_assets: references,
      reference_asset_ids: referenceIds,
      generation: {
        ...(shot.generation || {}),
        ...(planShot.generation || {}),
      },
      metadata: {
        ...(shot.metadata || {}),
        asset_binding: evidence.filter((item) => item.persisted_shot_ids.includes(id)),
      },
    };
  });

  return {
    scenes,
    shots: boundShots,
    creative_plan: {
      ...creative_plan,
      asset_binding: {
        version: "CREATIVE_ASSET_BINDING_V1",
        bound_at: new Date().toISOString(),
        evidence,
      },
    },
  };
}
