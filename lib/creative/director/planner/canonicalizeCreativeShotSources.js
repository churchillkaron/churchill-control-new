const PRIMARY_ROLES = new Set([
  "PRIMARY",
  "PRIMARY_SOURCE",
  "SHOT_PRIMARY_SOURCE",
  "SOURCE",
  "SOURCE_PLATE",
  "BASE_PLATE",
  "HERO_SOURCE",
]);

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

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(
    value?.asset_id ||
    value?.assetId ||
    value?.creative_asset_id ||
    value?.creativeAssetId ||
    value?.id,
  );
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function selectedAssetIds(assets = []) {
  return new Set(list(assets).map(assetId).filter(Boolean));
}

function canonicalSceneId(index) {
  return `scene-${String(index + 1).padStart(3, "0")}`;
}

function canonicalShotId(sceneIndex, shotIndex) {
  return `${canonicalSceneId(sceneIndex)}-shot-${String(shotIndex + 1).padStart(3, "0")}`;
}

function referenceRows(shot = {}) {
  const rows = [];
  const byId = new Map();

  function add(value, fallbackRole = "REFERENCE") {
    const id = assetId(value);
    if (!id) return;
    const source = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
    const role = text(
      source.role ||
      source.asset_role ||
      source.binding_role ||
      fallbackRole,
    ).toUpperCase();
    const primary =
      source.primary_source === true ||
      source.primarySource === true ||
      source.primary === true ||
      PRIMARY_ROLES.has(role);

    const current = byId.get(id);
    if (current) {
      current.primary = current.primary || primary;
      if (
        (!current.role || current.role === "REFERENCE") &&
        role &&
        role !== "REFERENCE"
      ) {
        current.role = role;
      }
      current.raw = {
        ...object(current.raw),
        ...source,
        asset_id: id,
      };
      return;
    }

    const row = {
      asset_id: id,
      role: role || "REFERENCE",
      primary,
      raw: {
        ...source,
        asset_id: id,
      },
    };
    byId.set(id, row);
    rows.push(row);
  }

  for (const entry of list(shot.reference_assets)) add(entry);
  for (const entry of list(shot.reference_asset_ids)) add(entry);
  for (const entry of list(shot.assets)) add(entry, "DIRECT_SOURCE");

  return rows;
}

function explicitPrimaryIds(shot = {}) {
  const generation = object(shot.generation);
  return unique([
    shot.primary_source_asset_id,
    shot.primarySourceAssetId,
    shot.metadata?.primary_source_asset_id,
    shot.metadata?.primarySourceAssetId,
    generation.primary_source_asset_id,
    generation.primarySourceAssetId,
    generation.provider_parameters?.primary_source_asset_id,
  ]);
}

function sourceRequired(shot = {}, references = []) {
  const medium = text(shot.medium).toUpperCase().replaceAll("_", "-");
  return (
    references.length > 0 ||
    medium === "LIVE-ASSET" ||
    medium === "ASSET-LED-MOTION" ||
    shot.source_required === true ||
    shot.generation?.source_required === true
  );
}

function rewriteAssignments(assignments = [], idMap = new Map()) {
  return unique(list(assignments).map((assignment) =>
    idMap.get(text(assignment)) || text(assignment),
  ));
}

export function canonicalizeCreativeShotSources(plan = {}, assets = []) {
  const selected = selectedAssetIds(assets);
  const source = object(plan);
  const idMap = new Map();
  let primarySourceShotCount = 0;
  let syntheticSourceFreeShotCount = 0;

  const sourceScenes = list(source.scenes);
  sourceScenes.forEach((scene, sceneIndex) => {
    const previousSceneId = text(scene.id);
    if (previousSceneId) {
      idMap.set(previousSceneId, canonicalSceneId(sceneIndex));
    }
    list(scene.shots).forEach((shot, shotIndex) => {
      const previousShotId = text(shot.id);
      if (previousShotId) {
        idMap.set(previousShotId, canonicalShotId(sceneIndex, shotIndex));
      }
    });
  });

  const scenes = sourceScenes.map((scene, sceneIndex) => {
    const originalSceneId = text(scene.id) || null;
    const sceneId = canonicalSceneId(sceneIndex);

    const shots = list(scene.shots).map((shot, shotIndex) => {
      const originalShotId = text(shot.id) || null;
      const shotId = canonicalShotId(sceneIndex, shotIndex);
      const references = referenceRows(shot);
      const referenceIds = references.map((entry) => entry.asset_id);
      const unknownReferences = referenceIds.filter((id) => !selected.has(id));

      if (unknownReferences.length) {
        throw new Error(
          `CREATIVE_CANONICAL_SOURCE_REFERENCE_UNKNOWN:${shotId}:` +
          unknownReferences.join(","),
        );
      }

      const explicit = explicitPrimaryIds(shot);
      if (explicit.length > 1) {
        throw new Error(
          `CREATIVE_CANONICAL_PRIMARY_SOURCE_AMBIGUOUS:${shotId}:` +
          explicit.join(","),
        );
      }
      if (explicit.length === 1 && !selected.has(explicit[0])) {
        throw new Error(
          `CREATIVE_CANONICAL_PRIMARY_SOURCE_UNKNOWN:${shotId}:${explicit[0]}`,
        );
      }

      const flagged = references
        .filter((entry) => entry.primary)
        .map((entry) => entry.asset_id);
      if (!explicit.length && flagged.length > 1) {
        throw new Error(
          `CREATIVE_CANONICAL_PRIMARY_REFERENCE_AMBIGUOUS:${shotId}:` +
          flagged.join(","),
        );
      }

      let primarySourceAssetId = explicit[0] || flagged[0] || null;
      if (!primarySourceAssetId && references.length === 1) {
        primarySourceAssetId = references[0].asset_id;
      }

      const needsSource = sourceRequired(shot, references);
      if (!primarySourceAssetId && references.length > 1) {
        throw new Error(
          `CREATIVE_CANONICAL_PRIMARY_SOURCE_REQUIRED:${shotId}:` +
          `reference_count=${references.length}`,
        );
      }
      if (needsSource && !primarySourceAssetId) {
        throw new Error(
          `CREATIVE_CANONICAL_PRIMARY_SOURCE_REQUIRED:${shotId}:` +
          `medium=${text(shot.medium) || "UNKNOWN"}`,
        );
      }

      if (primarySourceAssetId) {
        primarySourceShotCount += 1;
        if (!referenceIds.includes(primarySourceAssetId)) {
          references.unshift({
            asset_id: primarySourceAssetId,
            role: "PRIMARY_SOURCE",
            primary: true,
            raw: {
              asset_id: primarySourceAssetId,
              role: "PRIMARY_SOURCE",
              primary_source: true,
            },
          });
        }
      } else {
        syntheticSourceFreeShotCount += 1;
      }

      const normalizedReferences = references.map((entry) => ({
        ...object(entry.raw),
        asset_id: entry.asset_id,
        role: entry.asset_id === primarySourceAssetId
          ? "PRIMARY_SOURCE"
          : entry.role || "REFERENCE",
        primary_source: entry.asset_id === primarySourceAssetId,
      }));
      const normalizedReferenceIds = unique(
        normalizedReferences.map((entry) => entry.asset_id),
      );
      const generation = object(shot.generation);

      return {
        ...shot,
        id: shotId,
        primary_source_asset_id: primarySourceAssetId,
        assets: primarySourceAssetId ? [primarySourceAssetId] : [],
        reference_assets: normalizedReferences,
        reference_asset_ids: normalizedReferenceIds,
        generation: {
          ...generation,
          primary_source_asset_id: primarySourceAssetId,
          source_binding_contract: primarySourceAssetId
            ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
            : "SYNTHETIC_SOURCE_FREE_V1",
          provider_parameters: {
            ...object(generation.provider_parameters),
            primary_source_asset_id: primarySourceAssetId,
          },
        },
        metadata: {
          ...object(shot.metadata),
          source_plan_scene_id: originalSceneId,
          source_plan_shot_id: originalShotId,
          canonical_scene_id: sceneId,
          canonical_shot_id: shotId,
          primary_source_asset_id: primarySourceAssetId,
          canonical_source_contract: "CANONICAL_SHOT_SOURCE_V1",
          source_binding_contract: primarySourceAssetId
            ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
            : "SYNTHETIC_SOURCE_FREE_V1",
        },
      };
    });

    return {
      ...scene,
      id: sceneId,
      shots,
      metadata: {
        ...object(scene.metadata),
        source_plan_scene_id: originalSceneId,
        canonical_scene_id: sceneId,
        canonical_source_contract: "CANONICAL_SHOT_SOURCE_V1",
      },
    };
  });

  const assetManifest = list(source.asset_manifest).map((entry) => ({
    ...entry,
    assignments: rewriteAssignments(entry.assignments, idMap),
  }));

  return {
    ...source,
    scenes,
    asset_manifest: assetManifest,
    metadata: {
      ...object(source.metadata),
      canonical_shot_source: {
        version: "CANONICAL_SHOT_SOURCE_V1",
        scene_count: scenes.length,
        shot_count: scenes.reduce(
          (sum, scene) => sum + list(scene.shots).length,
          0,
        ),
        primary_source_shot_count: primarySourceShotCount,
        synthetic_source_free_shot_count: syntheticSourceFreeShotCount,
        model_supplied_ids_are_authoritative: false,
        multiple_unmarked_primary_candidates_allowed: false,
      },
    },
  };
}

export const CreativeCanonicalShotSourcePlanner = Object.freeze({
  canonicalize: canonicalizeCreativeShotSources,
});
