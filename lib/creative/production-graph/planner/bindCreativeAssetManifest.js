function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return text(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.creativeAssetId ||
    value.id,
  );
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function uniqueAssetIds(values = []) {
  return [...new Set(list(values).map(assetId).filter(Boolean))];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function explicitPrimaryEntry(entry = {}) {
  const role = text(
    entry.binding_role ||
    entry.asset_role ||
    entry.role,
  ).toUpperCase();
  return entry.primary_source === true ||
    entry.primarySource === true ||
    entry.primary === true ||
    role === "PRIMARY" ||
    role === "PRIMARY_SOURCE" ||
    role === "SHOT_PRIMARY_SOURCE";
}

function generatedShot(generation = {}) {
  if (generation.required === false) return false;
  return generation.required === true || Boolean(text(
    generation.service ||
    generation.capability ||
    generation.provider ||
    generation.model,
  ));
}

function primaryIds(shot = {}, planShot = {}, generation = {}) {
  return uniqueAssetIds([
    shot.primary_source_asset_id,
    shot.primarySourceAssetId,
    shot.metadata?.primary_source_asset_id,
    shot.metadata?.primarySourceAssetId,
    shot.generation?.primary_source_asset_id,
    shot.generation?.primarySourceAssetId,
    shot.generation?.provider_parameters?.primary_source_asset_id,
    planShot.primary_source_asset_id,
    planShot.primarySourceAssetId,
    planShot.metadata?.primary_source_asset_id,
    planShot.generation?.primary_source_asset_id,
    planShot.generation?.primarySourceAssetId,
    planShot.generation?.provider_parameters?.primary_source_asset_id,
    generation.primary_source_asset_id,
    generation.primarySourceAssetId,
    generation.provider_parameters?.primary_source_asset_id,
  ]);
}

function dedupeReferences(values = []) {
  const output = [];
  const seen = new Set();
  for (const value of list(values)) {
    const id = assetId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...value, asset_id: id }
        : { asset_id: id, role: "REFERENCE" },
    );
  }
  return output;
}

export function bindCreativeAssetManifest({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const planScenes = list(creative_plan.scenes);
  const deliverableIds = new Set(
    list(creative_plan.deliverables).map((item) => text(item.id)).filter(Boolean),
  );
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
  const assignedByShot = new Map();
  const shotAssignedByShot = new Map();
  const flaggedPrimaryByShot = new Map();
  const referenceByShot = new Map();
  const evidence = [];

  function targetShotIds(assignment) {
    if (shotTargets.has(assignment)) return [shotTargets.get(assignment)];
    if (sceneTargets.has(assignment)) {
      const sceneId = sceneTargets.get(assignment);
      return shots
        .filter((shot) => text(shot.scene_id) === sceneId)
        .map((shot) => text(shot.id));
    }
    if (deliverableIds.has(assignment)) {
      return shots.map((shot) => text(shot.id));
    }
    return [];
  }

  function assignmentKind(assignment) {
    if (shotTargets.has(assignment)) return "SHOT";
    if (sceneTargets.has(assignment)) return "SCENE";
    if (deliverableIds.has(assignment)) return "DELIVERABLE";
    return "UNKNOWN";
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
      throw new Error(
        `CREATIVE_ASSET_BINDING_TARGET_UNKNOWN:${id}:${unknown.join(",")}`,
      );
    }

    const boundShotIds = unique(assignments.flatMap(targetShotIds));
    if (!boundShotIds.length) {
      throw new Error(`CREATIVE_ASSET_BINDING_TARGET_EMPTY:${id}`);
    }

    const shotSpecificIds = unique(
      assignments
        .filter((assignment) => assignmentKind(assignment) === "SHOT")
        .flatMap(targetShotIds),
    );

    for (const shotId of boundShotIds) {
      if (disposition === "ASSIGNED") {
        assignedByShot.set(
          shotId,
          unique([...(assignedByShot.get(shotId) || []), id]),
        );
        if (shotSpecificIds.includes(shotId)) {
          shotAssignedByShot.set(
            shotId,
            unique([...(shotAssignedByShot.get(shotId) || []), id]),
          );
          if (explicitPrimaryEntry(entry)) {
            flaggedPrimaryByShot.set(
              shotId,
              unique([...(flaggedPrimaryByShot.get(shotId) || []), id]),
            );
          }
        }
      } else if (["REFERENCE", "REGENERATE"].includes(disposition)) {
        const current = referenceByShot.get(shotId) || [];
        if (!current.some((item) => item.asset_id === id)) {
          current.push(referenceEntry(id, disposition, entry));
        }
        referenceByShot.set(shotId, current);
      } else {
        throw new Error(
          `CREATIVE_ASSET_BINDING_DISPOSITION_INVALID:${id}:${disposition}`,
        );
      }
    }

    evidence.push({
      asset_id: id,
      disposition,
      assignments,
      assignment_kinds: unique(assignments.map(assignmentKind)),
      persisted_shot_ids: boundShotIds,
      shot_specific_persisted_shot_ids: shotSpecificIds,
      explicit_primary_source: explicitPrimaryEntry(entry),
    });
  }

  const boundShots = shots.map((shot) => {
    const id = text(shot.id);
    const planShot = shotPlanByPersistedId.get(id) || {};
    const generation = {
      ...object(shot.generation),
      ...object(planShot.generation),
    };
    const existingDirect = uniqueAssetIds(list(shot.assets));
    const allAssigned = unique(assignedByShot.get(id) || []);
    const shotAssigned = unique(shotAssignedByShot.get(id) || []);
    const sharedAssigned = allAssigned.filter((asset) => !shotAssigned.includes(asset));
    const direct = unique([
      ...existingDirect,
      ...(generatedShot(generation) ? shotAssigned : allAssigned),
    ]);
    const references = dedupeReferences([
      ...list(shot.reference_assets),
      ...list(planShot.reference_assets),
      ...(referenceByShot.get(id) || []),
    ]);
    const referenceIds = unique([
      ...uniqueAssetIds(list(shot.reference_asset_ids)),
      ...uniqueAssetIds(list(planShot.reference_asset_ids)),
      ...references.map((item) => assetId(item)),
    ]);

    const explicitCandidates = primaryIds(shot, planShot, generation);
    const flaggedCandidates = unique(flaggedPrimaryByShot.get(id) || []);
    const implicitShotCandidate =
      !explicitCandidates.length &&
      !flaggedCandidates.length &&
      shotAssigned.length === 1
        ? shotAssigned
        : [];
    const assignedReferenceCandidates = unique(
      referenceIds.filter((asset) => allAssigned.includes(asset)),
    );

    if (
      !explicitCandidates.length &&
      !flaggedCandidates.length &&
      !implicitShotCandidate.length &&
      assignedReferenceCandidates.length > 1
    ) {
      throw new Error(
        `CREATIVE_ASSET_BINDING_PRIMARY_REFERENCE_AMBIGUOUS:${id}:` +
        assignedReferenceCandidates.join(","),
      );
    }

    const referenceAssignedCandidate =
      !explicitCandidates.length &&
      !flaggedCandidates.length &&
      !implicitShotCandidate.length &&
      assignedReferenceCandidates.length === 1
        ? assignedReferenceCandidates
        : [];
    const existingCandidate =
      !explicitCandidates.length &&
      !flaggedCandidates.length &&
      !implicitShotCandidate.length &&
      !referenceAssignedCandidate.length &&
      existingDirect.length === 1
        ? existingDirect
        : [];
    const primaryCandidates = unique([
      ...explicitCandidates,
      ...flaggedCandidates,
      ...implicitShotCandidate,
      ...referenceAssignedCandidate,
      ...existingCandidate,
    ]);

    if (primaryCandidates.length > 1) {
      throw new Error(
        `CREATIVE_ASSET_BINDING_PRIMARY_SOURCE_AMBIGUOUS:${id}:` +
        primaryCandidates.join(","),
      );
    }

    const primarySourceAssetId = primaryCandidates[0] || null;
    const needsPrimary = generatedShot(generation) &&
      (direct.length > 0 || sharedAssigned.length > 0);
    if (needsPrimary && !primarySourceAssetId) {
      throw new Error(
        `CREATIVE_ASSET_BINDING_PRIMARY_SOURCE_REQUIRED:${id}:` +
        `shot_assigned=${shotAssigned.length}:shared_assigned=${sharedAssigned.length}:` +
        `assigned_references=${assignedReferenceCandidates.length}`,
      );
    }

    const scopedDirect = primarySourceAssetId
      ? unique([...direct, primarySourceAssetId])
      : direct;

    return {
      ...shot,
      assets: scopedDirect,
      primary_source_asset_id: primarySourceAssetId,
      reference_assets: references,
      reference_asset_ids: referenceIds,
      generation: {
        ...generation,
        primary_source_asset_id: primarySourceAssetId,
        source_binding_contract: primarySourceAssetId
          ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
          : null,
      },
      metadata: {
        ...object(shot.metadata),
        primary_source_asset_id: primarySourceAssetId,
        source_binding_contract: primarySourceAssetId
          ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
          : null,
        shared_asset_assignments_not_exposed: sharedAssigned,
        assigned_reference_primary_candidates: assignedReferenceCandidates,
        primary_source_resolution: primarySourceAssetId
          ? explicitCandidates.includes(primarySourceAssetId)
            ? "EXPLICIT_PRIMARY"
            : flaggedCandidates.includes(primarySourceAssetId)
              ? "FLAGGED_MANIFEST_PRIMARY"
              : implicitShotCandidate.includes(primarySourceAssetId)
                ? "SINGLE_SHOT_ASSIGNMENT"
                : referenceAssignedCandidate.includes(primarySourceAssetId)
                  ? "SINGLE_SHOT_REFERENCE"
                  : "SINGLE_EXISTING_DIRECT_ASSET"
          : null,
        asset_binding: evidence.filter((item) =>
          item.persisted_shot_ids.includes(id)),
      },
    };
  });

  return {
    scenes,
    shots: boundShots,
    creative_plan: {
      ...creative_plan,
      asset_binding: {
        version: "CREATIVE_ASSET_BINDING_V2",
        primary_source_contract: "EXPLICIT_SHOT_PRIMARY_SOURCE_V1",
        deliverable_assignment_exposed_as_shot_source: false,
        scene_assignment_exposed_as_shot_source: false,
        single_shot_reference_can_resolve_primary: true,
        bound_at: new Date().toISOString(),
        evidence,
      },
    },
  };
}
