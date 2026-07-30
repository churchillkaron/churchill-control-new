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

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function tokens(value) {
  const ignored = new Set([
    "scene",
    "shot",
    "beat",
    "group",
    "asset",
    "reference",
    "deliverable",
    "master",
    "video",
    "film",
  ]);

  return slug(value)
    .split("-")
    .filter((token) => token.length > 1 && !ignored.has(token));
}

function addAlias(map, alias, target) {
  const key = slug(alias);
  if (!key || !target) return;
  const current = map.get(key) || [];
  if (!current.includes(target)) current.push(target);
  map.set(key, current);
}

function similarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.length || !rightTokens.size) return 0;
  const matched = leftTokens.filter((token) => rightTokens.has(token)).length;
  return matched / leftTokens.length;
}

function targetCatalogue(plan = {}) {
  const valid = new Set();
  const aliases = new Map();
  const candidates = [];
  const deliverableIds = [];
  const sceneIds = [];
  const shotIds = [];

  list(plan.deliverables).forEach((deliverable, index) => {
    const id = text(deliverable.id);
    if (!id) return;
    valid.add(id);
    deliverableIds.push(id);
    candidates.push({
      id,
      type: "DELIVERABLE",
      search: [id, deliverable.purpose].map(text).join(" "),
    });
    for (const alias of [
      id,
      `deliverable-${index + 1}`,
      `master-${index + 1}`,
      deliverable.type,
      deliverable.purpose,
    ]) {
      addAlias(aliases, alias, id);
    }
  });

  list(plan.scenes).forEach((scene, sceneIndex) => {
    const sceneId = text(scene.id);
    if (!sceneId) return;
    valid.add(sceneId);
    sceneIds.push(sceneId);
    candidates.push({
      id: sceneId,
      type: "SCENE",
      search: [sceneId, scene.title, scene.objective, scene.emotion]
        .map(text)
        .join(" "),
    });
    for (const alias of [
      sceneId,
      `scene-${sceneIndex + 1}`,
      `scene-${String(sceneIndex + 1).padStart(2, "0")}`,
      scene.title,
      `scene-${slug(scene.title)}`,
      scene.objective,
    ]) {
      addAlias(aliases, alias, sceneId);
    }

    list(scene.shots).forEach((shot, shotIndex) => {
      const shotId = text(shot.id);
      if (!shotId) return;
      valid.add(shotId);
      shotIds.push(shotId);
      candidates.push({
        id: shotId,
        type: "SHOT",
        search: [
          shotId,
          shot.title,
          shot.purpose,
          shot.subject,
          scene.title,
          scene.objective,
        ].map(text).join(" "),
      });
      for (const alias of [
        shotId,
        `shot-${shotIndex + 1}`,
        `scene-${sceneIndex + 1}-shot-${shotIndex + 1}`,
        `scene-${String(sceneIndex + 1).padStart(2, "0")}-shot-${String(shotIndex + 1).padStart(2, "0")}`,
        shot.title,
        `shot-${slug(shot.title)}`,
        shot.metadata?.source_master_plan_shot_id,
      ]) {
        addAlias(aliases, alias, shotId);
      }
    });
  });

  return {
    valid,
    aliases,
    candidates,
    deliverableIds,
    sceneIds,
    shotIds,
  };
}

function resolveAssignment(assignment, catalogue) {
  const raw = text(assignment);
  if (!raw) return [];
  if (catalogue.valid.has(raw)) return [raw];

  const aliasMatches = catalogue.aliases.get(slug(raw));
  if (aliasMatches?.length) return unique(aliasMatches);

  const prefix = slug(raw).startsWith("shot-")
    ? "SHOT"
    : slug(raw).startsWith("scene-")
      ? "SCENE"
      : null;
  const scored = catalogue.candidates
    .filter((candidate) => !prefix || candidate.type === prefix)
    .map((candidate) => ({
      ...candidate,
      score: similarity(raw, candidate.search),
    }))
    .filter((candidate) => candidate.score >= 0.6)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) return [];
  const best = scored[0].score;
  const winners = scored.filter((candidate) => candidate.score === best);
  return winners.length === 1 ? [winners[0].id] : [];
}

export function convergeCreativeAssetManifestTargets(creativePlan = {}) {
  const plan = object(creativePlan);
  const catalogue = targetCatalogue(plan);
  const evidence = [];
  let repairedAssignmentCount = 0;
  let fallbackAssignmentCount = 0;
  let dispositionDowngradeCount = 0;

  const fallbackTargets = catalogue.deliverableIds.length
    ? catalogue.deliverableIds
    : catalogue.sceneIds.length
      ? catalogue.sceneIds
      : catalogue.shotIds;

  const assetManifest = list(plan.asset_manifest).map((entry) => {
    const originalAssignments = unique(list(entry.assignments));
    const resolvedAssignments = [];
    const unresolvedAssignments = [];

    for (const assignment of originalAssignments) {
      const resolved = resolveAssignment(assignment, catalogue);
      if (resolved.length) {
        resolvedAssignments.push(...resolved);
        if (!(resolved.length === 1 && resolved[0] === assignment)) {
          repairedAssignmentCount += 1;
        }
      } else {
        unresolvedAssignments.push(assignment);
      }
    }

    let disposition = text(entry.disposition).toUpperCase();
    const repairs = [];

    if (unresolvedAssignments.length) {
      if (!fallbackTargets.length) {
        throw new Error(
          `CREATIVE_ASSET_MANIFEST_NO_CANONICAL_TARGETS:${text(entry.asset_id || entry.id)}`,
        );
      }

      resolvedAssignments.push(...fallbackTargets);
      fallbackAssignmentCount += unresolvedAssignments.length;
      repairs.push({
        type: "UNKNOWN_TARGET_TO_SAFE_GLOBAL_REFERENCE",
        unknown_targets: unresolvedAssignments,
        fallback_targets: fallbackTargets,
      });

      if (disposition === "ASSIGNED") {
        disposition = "REFERENCE";
        dispositionDowngradeCount += 1;
        repairs.push({
          type: "DIRECT_ASSIGNMENT_DOWNGRADED_TO_REFERENCE",
          reason: "Unknown direct target cannot be bound safely; reference scope preserves creative influence without inserting the asset into every generated shot.",
        });
      }
    }

    if (!resolvedAssignments.length && fallbackTargets.length) {
      resolvedAssignments.push(...fallbackTargets);
      fallbackAssignmentCount += 1;
      repairs.push({
        type: "EMPTY_ASSIGNMENT_TO_SAFE_GLOBAL_REFERENCE",
        fallback_targets: fallbackTargets,
      });
      if (disposition === "ASSIGNED") {
        disposition = "REFERENCE";
        dispositionDowngradeCount += 1;
      }
    }

    const assignments = unique(resolvedAssignments);
    evidence.push({
      asset_id: text(entry.asset_id || entry.id),
      original_assignments: originalAssignments,
      assignments,
      original_disposition: text(entry.disposition).toUpperCase(),
      disposition,
      repairs,
    });

    return {
      ...entry,
      disposition,
      assignments,
      metadata: {
        ...object(entry.metadata),
        target_convergence: {
          version: "CREATIVE_ASSET_MANIFEST_TARGET_CONVERGENCE_V1",
          original_assignments: originalAssignments,
          repairs,
        },
      },
    };
  });

  const converged = {
    ...plan,
    asset_manifest: assetManifest,
    metadata: {
      ...object(plan.metadata),
      asset_manifest_target_convergence: {
        version: "CREATIVE_ASSET_MANIFEST_TARGET_CONVERGENCE_V1",
        repaired_at: new Date().toISOString(),
        target_count: catalogue.valid.size,
        repaired_assignment_count: repairedAssignmentCount,
        fallback_assignment_count: fallbackAssignmentCount,
        disposition_downgrade_count: dispositionDowngradeCount,
        evidence,
      },
    },
  };

  return {
    plan: converged,
    evidence,
    target_count: catalogue.valid.size,
    repaired_assignment_count: repairedAssignmentCount,
    fallback_assignment_count: fallbackAssignmentCount,
    disposition_downgrade_count: dispositionDowngradeCount,
  };
}
