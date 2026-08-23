import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import * as ShotRepository
from "@/lib/creative/shots/repositories/ShotRepository";
import {
  CreativeCinematicStateMemoryBootstrap,
} from "./CreativeCinematicStateMemoryBootstrap";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.cinematic-continuity-conflict-gate.v1",
);
const GATE_CONTRACT = "CREATIVE_CINEMATIC_CONTINUITY_CONFLICT_GATE_V1";
const RESOLUTION_CONTRACT = "CREATIVE_CINEMATIC_CONTINUITY_RESOLUTION_V1";
const INTENTIONAL_CHANGE_CONTRACT =
  "CREATIVE_CINEMATIC_INTENTIONAL_CHANGE_V1";
const LEDGER_CONTRACT = "CREATIVE_CINEMATIC_STATE_LEDGER_V1";
const MIN_REASON_LENGTH = 12;

const CATEGORY_KEYWORDS = Object.freeze({
  identity: [
    "identity", "character", "actor", "person", "cast", "face",
  ],
  wardrobe: [
    "wardrobe", "clothes", "clothing", "outfit", "jacket", "shirt",
    "dress", "costume", "uniform", "suit",
  ],
  hair_makeup: [
    "hair", "makeup", "make-up", "grooming", "hairstyle",
  ],
  products: [
    "product", "packaging", "bottle", "label",
  ],
  props: [
    "prop", "phone", "glass", "bag", "object", "item", "furniture",
  ],
  location: [
    "location", "room", "interior", "exterior", "outdoor", "outside",
    "inside", "venue", "setting", "place", "moves to", "arrives at",
  ],
  lighting: [
    "lighting", "light", "night", "daylight", "day time", "daytime",
    "dawn", "dusk", "morning", "evening", "sunset", "sunrise",
    "time of day",
  ],
  spatial_orientation: [
    "position", "blocking", "screen direction", "axis", "eyeline",
    "orientation", "left to right", "right to left", "crosses the line",
    "camera side", "180 degree", "180-degree",
  ],
});

const ORIENTATION_KEYWORDS = [
  "screen_direction",
  "screen_directionality",
  "axis",
  "camera_side",
  "eyeline",
  "orientation",
  "blocking",
  "position",
  "left_right",
  "right_left",
  "travel_direction",
  "movement_direction",
  "facing_direction",
  "entrance_side",
  "exit_side",
];

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

function normalizedText(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? normalizedText(value) : value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [normalizedKey(key), stable(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value ?? null)))
    .digest("hex");
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function hasData(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(text(value));
}

function cinemaTask(task = {}) {
  return text(task.capability || task.service_code || task.service_id)
    .toLowerCase()
    .startsWith("ai.video.");
}

function shotBibleSource(shot = {}) {
  return object(shot.metadata?.shot_bible_source);
}

function actorKey(value) {
  if (typeof value === "string") return normalizedText(value);
  if (!value || typeof value !== "object") return "";
  return normalizedText(
    value.identity_profile_id ||
    value.profile_id ||
    value.person_id ||
    value.actor_id ||
    value.id ||
    value.name ||
    value.role,
  );
}

function actorKeysFromShot(shot = {}, task = {}) {
  const source = shotBibleSource(shot);
  const requirements = object(task.input?.requirements);
  const identity = object(source.identity_requirements);
  return unique([
    ...list(shot.actors).map(actorKey),
    ...list(requirements.actors).map(actorKey),
    ...list(requirements.scene_context?.actors).map(actorKey),
    actorKey(identity),
    identity.identity_profile_id,
    identity.profile_id,
    identity.person_id,
  ].map(normalizedText));
}

function actorKeysFromState(state = {}) {
  const identity = object(state.identity);
  return unique([
    ...list(identity.actors).map(actorKey),
    actorKey(identity.requirements),
    identity.requirements?.identity_profile_id,
    identity.requirements?.profile_id,
    identity.requirements?.person_id,
  ].map(normalizedText));
}

function intersects(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function plannedState(shot = {}, task = {}) {
  const source = shotBibleSource(shot);
  const requirements = object(task.input?.requirements);
  const sceneContext = object(requirements.scene_context);
  return {
    identity: {
      actors: list(shot.actors).length
        ? list(shot.actors)
        : list(requirements.actors || sceneContext.actors),
      requirements: hasData(source.identity_requirements)
        ? object(source.identity_requirements)
        : object(requirements.identity_requirements),
      wardrobe: list(source.wardrobe).length
        ? list(source.wardrobe)
        : list(requirements.wardrobe),
      hair_makeup: list(source.hair_makeup).length
        ? list(source.hair_makeup)
        : list(requirements.hair_makeup),
    },
    product: {
      products: list(shot.products).length
        ? list(shot.products)
        : list(requirements.products || sceneContext.products),
    },
    environment: {
      location: hasData(shot.location)
        ? object(shot.location)
        : object(requirements.location || sceneContext.location),
      production_design: hasData(shot.production_design)
        ? object(shot.production_design)
        : object(requirements.production_design),
      props: list(source.props).length
        ? list(source.props)
        : list(requirements.props),
    },
    spatial: {
      continuity: hasData(shot.continuity)
        ? object(shot.continuity)
        : object(requirements.continuity),
      camera: hasData(shot.camera)
        ? object(shot.camera)
        : object(requirements.camera),
      lighting: hasData(shot.lighting)
        ? object(shot.lighting)
        : object(requirements.lighting),
    },
  };
}

function itemToken(value) {
  if (typeof value === "string" || typeof value === "number") {
    return normalizedText(value);
  }
  if (!value || typeof value !== "object") return "";
  const preferred = text(
    value.identity_profile_id ||
    value.profile_id ||
    value.person_id ||
    value.actor_id ||
    value.product_id ||
    value.asset_id ||
    value.prop_id ||
    value.id ||
    value.name ||
    value.title ||
    value.label ||
    value.description ||
    value.role,
  );
  return preferred ? normalizedText(preferred) : JSON.stringify(stable(value));
}

function arrayTokens(value = []) {
  return unique(list(value).map(itemToken).filter(Boolean)).sort();
}

function mergeArrays(previous = [], current = []) {
  const result = [...list(previous)];
  const seen = new Set(result.map(itemToken).filter(Boolean));
  for (const item of list(current)) {
    const token = itemToken(item);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    result.push(item);
  }
  return result;
}

function flattenLeaves(value, prefix = "", target = new Map()) {
  if (Array.isArray(value)) {
    const tokens = arrayTokens(value);
    if (tokens.length) target.set(prefix || "$", tokens.join("|"));
    return target;
  }
  if (!value || typeof value !== "object") {
    const scalar = normalizedText(value);
    if (scalar) target.set(prefix || "$", scalar);
    return target;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    const path = prefix ? `${prefix}.${normalized}` : normalized;
    flattenLeaves(child, path, target);
  }
  return target;
}

function objectComparison(previous = {}, current = {}) {
  const priorLeaves = flattenLeaves(previous);
  const currentLeaves = flattenLeaves(current);
  const compared = [];
  const conflicts = [];
  for (const [path, currentValue] of currentLeaves.entries()) {
    if (!priorLeaves.has(path)) continue;
    const previousValue = priorLeaves.get(path);
    compared.push(path);
    if (previousValue !== currentValue) {
      conflicts.push({ path, previous: previousValue, current: currentValue });
    }
  }
  if (conflicts.length) {
    return { changed: true, conflicts, compared, augmented: false };
  }
  if (compared.length) {
    return {
      changed: false,
      conflicts: [],
      compared,
      augmented: currentLeaves.size > compared.length,
    };
  }
  const priorTokens = new Set([...priorLeaves.values()]);
  const currentTokens = [...currentLeaves.values()];
  const sharesValue = currentTokens.some((value) => priorTokens.has(value));
  return {
    changed:
      priorLeaves.size > 0 &&
      currentLeaves.size > 0 &&
      !sharesValue,
    conflicts: [],
    compared: [],
    augmented: sharesValue,
  };
}

function orientationSubset(state = {}) {
  const combined = {
    ...object(state.continuity),
    ...object(state.camera),
  };
  const leaves = flattenLeaves(combined);
  const selected = {};
  for (const [path, value] of leaves.entries()) {
    const normalized = normalizedKey(path);
    if (!ORIENTATION_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      continue;
    }
    selected[path] = value;
  }
  return selected;
}

function inferCategoriesFromText(value) {
  const source = normalizedText(value);
  if (!source) return [];
  const categories = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => source.includes(keyword))) {
      categories.push(category);
    }
  }
  return categories;
}

function categoryForKey(value) {
  const key = normalizedKey(value);
  if (["all", "reset", "continuity_reset", "full_reset"].includes(key)) {
    return "all";
  }
  for (const category of Object.keys(CATEGORY_KEYWORDS)) {
    if (key === category) return category;
  }
  if (["hair", "makeup", "hair_and_makeup"].includes(key)) {
    return "hair_makeup";
  }
  if (["product", "product_state"].includes(key)) return "products";
  if (["prop", "prop_state"].includes(key)) return "props";
  if (["camera_axis", "blocking", "spatial", "orientation"].includes(key)) {
    return "spatial_orientation";
  }
  return null;
}

function declarationRecord(category, reason, source, raw) {
  const normalizedReason = text(reason);
  if (!category || normalizedReason.length < MIN_REASON_LENGTH) return null;
  return {
    contract: INTENTIONAL_CHANGE_CONTRACT,
    category,
    reason: normalizedReason.slice(0, 500),
    source,
    declaration_hash: hash({ category, reason: normalizedReason, source, raw }),
  };
}

function collectDeclarationValue(value, source, records = [], forcedCategory = null) {
  if (typeof value === "string") {
    const reason = text(value);
    const categories = forcedCategory
      ? [forcedCategory]
      : inferCategoriesFromText(reason);
    for (const category of categories) {
      const record = declarationRecord(category, reason, source, value);
      if (record) records.push(record);
    }
    return records;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDeclarationValue(item, source, records, forcedCategory);
    }
    return records;
  }
  if (!value || typeof value !== "object") return records;

  const explicitCategory = categoryForKey(
    value.category || value.field || value.type || value.dimension,
  );
  const explicitReason = text(
    value.reason || value.why || value.rationale || value.story_reason,
  );
  if (explicitCategory && explicitReason) {
    const record = declarationRecord(
      explicitCategory,
      explicitReason,
      source,
      value,
    );
    if (record) records.push(record);
  }

  for (const [key, child] of Object.entries(value)) {
    if (["category", "field", "type", "dimension", "reason", "why", "rationale", "story_reason"].includes(normalizedKey(key))) {
      continue;
    }
    const category = categoryForKey(key) || forcedCategory;
    if (typeof child === "string") {
      collectDeclarationValue(child, `${source}.${key}`, records, category);
      continue;
    }
    if (child && typeof child === "object" && !Array.isArray(child)) {
      const allowed = child.allowed ?? child.intentional ?? child.approved ?? true;
      const reason = text(
        child.reason || child.why || child.rationale || child.story_reason,
      );
      if (allowed !== false && category && reason) {
        const record = declarationRecord(
          category,
          reason,
          `${source}.${key}`,
          child,
        );
        if (record) records.push(record);
      } else {
        collectDeclarationValue(child, `${source}.${key}`, records, category);
      }
      continue;
    }
    if (Array.isArray(child)) {
      collectDeclarationValue(child, `${source}.${key}`, records, category);
    }
  }
  return records;
}

function intentionalChanges(shot = {}, task = {}) {
  const continuity = object(shot.continuity);
  const requirements = object(task.input?.requirements);
  const sceneContext = object(requirements.scene_context);
  const records = [];
  const structured = [
    [continuity.intentional_changes, "shot.continuity.intentional_changes"],
    [continuity.allowed_changes, "shot.continuity.allowed_changes"],
    [continuity.changes, "shot.continuity.changes"],
    [continuity.continuity_changes, "shot.continuity.continuity_changes"],
    [shot.metadata?.intentional_continuity_changes, "shot.metadata.intentional_continuity_changes"],
    [requirements.intentional_continuity_changes, "task.requirements.intentional_continuity_changes"],
    [sceneContext.continuity_from_previous?.intentional_changes, "scene.continuity_from_previous.intentional_changes"],
  ];
  for (const [value, source] of structured) {
    collectDeclarationValue(value, source, records);
  }

  const resetReason = text(
    continuity.reset_reason ||
    continuity.continuity_reset_reason ||
    continuity.change_reason,
  );
  if ((continuity.reset === true || continuity.continuity_reset === true) && resetReason) {
    const record = declarationRecord(
      "all",
      resetReason,
      "shot.continuity.reset",
      continuity,
    );
    if (record) records.push(record);
  }

  const narrative = [
    [sceneContext.state_change, "scene.state_change"],
    [sceneContext.transition_logic, "scene.transition_logic"],
    [sceneContext.continuity_from_previous?.reason, "scene.continuity_from_previous.reason"],
  ];
  for (const [value, source] of narrative) {
    if (text(value).length < MIN_REASON_LENGTH) continue;
    collectDeclarationValue(value, source, records);
  }

  const byCategory = {};
  for (const record of records) {
    if (!byCategory[record.category]) byCategory[record.category] = [];
    if (
      !byCategory[record.category].some(
        (candidate) => candidate.declaration_hash === record.declaration_hash,
      )
    ) {
      byCategory[record.category].push(record);
    }
  }
  return byCategory;
}

function authorizationFor(authorizations = {}, category) {
  return [
    ...list(authorizations[category]),
    ...list(authorizations.all),
  ];
}

function sourceStateForCategory(states = [], shot = {}, task = {}, category) {
  const sameScene = states.find(
    (state) => text(state.scene_id) === text(shot.scene_id),
  ) || null;
  if (![
    "identity",
    "wardrobe",
    "hair_makeup",
  ].includes(category)) {
    return sameScene;
  }
  const currentActors = actorKeysFromShot(shot, task);
  if (!currentActors.length) return sameScene;
  return states.find((state) =>
    intersects(currentActors, actorKeysFromState(state)),
  ) || sameScene;
}

function priorCategoryValue(state = {}, category) {
  if (!state) return null;
  switch (category) {
    case "identity":
      return object(state.identity?.requirements);
    case "wardrobe":
      return list(state.identity?.wardrobe);
    case "hair_makeup":
      return list(state.identity?.hair_makeup);
    case "products":
      return list(state.product?.products);
    case "props":
      return list(state.environment?.props);
    case "location":
      return object(state.environment?.location);
    case "lighting":
      return object(state.spatial?.lighting);
    case "spatial_orientation":
      return orientationSubset(state.spatial);
    default:
      return null;
  }
}

function currentCategoryValue(planned = {}, category) {
  switch (category) {
    case "identity":
      return object(planned.identity?.requirements);
    case "wardrobe":
      return list(planned.identity?.wardrobe);
    case "hair_makeup":
      return list(planned.identity?.hair_makeup);
    case "products":
      return list(planned.product?.products);
    case "props":
      return list(planned.environment?.props);
    case "location":
      return object(planned.environment?.location);
    case "lighting":
      return object(planned.spatial?.lighting);
    case "spatial_orientation":
      return orientationSubset(planned.spatial);
    default:
      return null;
  }
}

function strictArrayComparison(previous = [], current = []) {
  const priorTokens = arrayTokens(previous);
  const currentTokens = arrayTokens(current);
  return {
    changed: hash(priorTokens) !== hash(currentTokens),
    prior_tokens: priorTokens,
    current_tokens: currentTokens,
  };
}

function additiveArrayComparison(previous = [], current = []) {
  const priorTokens = arrayTokens(previous);
  const currentTokens = arrayTokens(current);
  const prior = new Set(priorTokens);
  const additions = currentTokens.filter((token) => !prior.has(token));
  return {
    changed: false,
    additions,
    prior_tokens: priorTokens,
    current_tokens: currentTokens,
  };
}

function categoryComparison(category, previous, current) {
  if (!hasData(previous)) {
    return { status: "NO_PRIOR_STATE", changed: false };
  }
  if (!hasData(current)) {
    return { status: "INHERIT", changed: false };
  }
  if (["wardrobe", "hair_makeup"].includes(category)) {
    const compared = strictArrayComparison(previous, current);
    return {
      status: compared.changed ? "CHANGED" : "PRESERVE",
      ...compared,
    };
  }
  if (["products", "props"].includes(category)) {
    const compared = additiveArrayComparison(previous, current);
    return {
      status: compared.additions.length ? "EXTEND" : "PRESERVE",
      ...compared,
    };
  }
  const compared = objectComparison(previous, current);
  return {
    status: compared.changed
      ? "CHANGED"
      : compared.augmented
        ? "EXTEND"
        : "PRESERVE",
    ...compared,
  };
}

function resolvedValue(category, previous, current, comparison, authorized) {
  if (!hasData(previous)) return current;
  if (!hasData(current)) return previous;
  if (authorized && comparison.changed) return current;
  if (["products", "props"].includes(category)) {
    return mergeArrays(previous, current);
  }
  if (["location", "lighting"].includes(category) && !comparison.changed) {
    return {
      ...object(previous),
      ...object(current),
    };
  }
  return current;
}

function setResolvedCategory(resolved, category, value) {
  switch (category) {
    case "identity":
      resolved.identity.requirements = value;
      break;
    case "wardrobe":
      resolved.identity.wardrobe = value;
      break;
    case "hair_makeup":
      resolved.identity.hair_makeup = value;
      break;
    case "products":
      resolved.product.products = value;
      break;
    case "props":
      resolved.environment.props = value;
      break;
    case "location":
      resolved.environment.location = value;
      break;
    case "lighting":
      resolved.spatial.lighting = value;
      break;
    case "spatial_orientation":
      resolved.spatial.orientation_constraints = value;
      break;
    default:
      break;
  }
}

function evaluateContinuity({ shot, task, ledger } = {}) {
  const states = list(ledger?.authoritative_states);
  const planned = plannedState(shot, task);
  const authorizations = intentionalChanges(shot, task);
  const resolved = {
    contract: RESOLUTION_CONTRACT,
    identity: {
      actors: planned.identity.actors,
      requirements: planned.identity.requirements,
      wardrobe: planned.identity.wardrobe,
      hair_makeup: planned.identity.hair_makeup,
    },
    product: {
      products: planned.product.products,
    },
    environment: {
      location: planned.environment.location,
      production_design: planned.environment.production_design,
      props: planned.environment.props,
    },
    spatial: {
      continuity: planned.spatial.continuity,
      camera: planned.spatial.camera,
      lighting: planned.spatial.lighting,
      orientation_constraints: orientationSubset(planned.spatial),
    },
  };

  const comparisons = [];
  const conflicts = [];
  const categories = [
    "identity",
    "wardrobe",
    "hair_makeup",
    "products",
    "props",
    "location",
    "lighting",
    "spatial_orientation",
  ];

  for (const category of categories) {
    const sourceState = sourceStateForCategory(states, shot, task, category);
    if (!sourceState) continue;
    const previous = priorCategoryValue(sourceState, category);
    const current = currentCategoryValue(planned, category);
    const comparison = categoryComparison(category, previous, current);
    const authorization = authorizationFor(authorizations, category);
    const authorized = authorization.length > 0;
    const unresolved = comparison.changed === true && !authorized;
    const resolvedCategory = resolvedValue(
      category,
      previous,
      current,
      comparison,
      authorized,
    );
    setResolvedCategory(resolved, category, resolvedCategory);
    const record = {
      category,
      source_shot_id: sourceState.shot_id || null,
      source_scene_id: sourceState.scene_id || null,
      source_state_hash: sourceState.state_hash || null,
      source_chain_hash: sourceState.chain_hash || null,
      same_scene: text(sourceState.scene_id) === text(shot.scene_id),
      status: comparison.status,
      changed: comparison.changed === true,
      inherited: comparison.status === "INHERIT",
      authorized_intentional_change: authorized && comparison.changed === true,
      authorization,
      unresolved_conflict: unresolved,
      previous_hash: hasData(previous) ? hash(previous) : null,
      current_hash: hasData(current) ? hash(current) : null,
      resolved_hash: hasData(resolvedCategory) ? hash(resolvedCategory) : null,
      detail: comparison,
    };
    comparisons.push(record);
    if (unresolved) conflicts.push(record);
  }

  const base = {
    contract: GATE_CONTRACT,
    version: 1,
    passed: conflicts.length === 0,
    pre_gpu: true,
    provider_calls_added: 0,
    current_shot_id: shot.id,
    current_scene_id: shot.scene_id || null,
    cinematic_state_ledger_hash: ledger?.ledger_hash || null,
    authoritative_state_count: states.length,
    intentional_change_contract: INTENTIONAL_CHANGE_CONTRACT,
    intentional_changes: authorizations,
    comparisons,
    conflicts,
    conflict_categories: unique(conflicts.map((item) => item.category)),
    inherited_categories: unique(
      comparisons.filter((item) => item.inherited).map((item) => item.category),
    ),
    intentional_change_categories: unique(
      comparisons
        .filter((item) => item.authorized_intentional_change)
        .map((item) => item.category),
    ),
    policy: {
      omitted_planned_state_inherits_reviewed_state: true,
      explicit_conflicting_state_requires_story_authority: true,
      same_scene_environment_continuity_enforced: true,
      cross_scene_identity_continuity_enforced_when_identity_matches: true,
      accidental_conflicts_block_before_provider_submission: true,
      promptless_source_of_truth: true,
    },
    resolved_state: resolved,
  };
  return {
    ...base,
    analysis_hash: hash(base),
  };
}

async function bindOrReject(task = {}) {
  if (!cinemaTask(task) || !task.shot_id) return task;
  if (["RUNNING", "COMPLETED"].includes(text(task.status).toUpperCase())) {
    return task;
  }

  task = await CreativeCinematicStateMemoryBootstrap.bindLedger(task);
  const [fresh, shot] = await Promise.all([
    ProductionTaskRuntime.get(task.id),
    ShotRepository.get(task.shot_id),
  ]);
  task = fresh || task;
  if (!shot) {
    throw new Error(`CREATIVE_CINEMATIC_CONTINUITY_SHOT_NOT_FOUND:${task.shot_id}`);
  }
  if (
    text(shot.organization_id) !== text(task.organization_id) ||
    text(shot.creative_project_id) !== text(task.creative_project_id)
  ) {
    throw new Error("CREATIVE_CINEMATIC_CONTINUITY_SHOT_SCOPE_MISMATCH");
  }

  const ledger = object(
    task.input?.cinematic_state_memory ||
    task.input?.requirements?.cinematic_state_memory,
  );
  if (text(ledger.contract) !== LEDGER_CONTRACT) return task;
  const evaluation = evaluateContinuity({ shot, task, ledger });

  task = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      cinematic_continuity_resolution: evaluation.resolved_state,
      requirements: {
        ...object(task.input?.requirements),
        cinematic_continuity_resolution: evaluation.resolved_state,
        cinematic_continuity_gate: {
          contract: GATE_CONTRACT,
          analysis_hash: evaluation.analysis_hash,
          passed: evaluation.passed,
          conflict_categories: evaluation.conflict_categories,
          inherited_categories: evaluation.inherited_categories,
          intentional_change_categories:
            evaluation.intentional_change_categories,
        },
      },
    },
    metadata: {
      ...object(task.metadata),
      cinematic_continuity_conflict_gate_contract: GATE_CONTRACT,
      cinematic_continuity_resolution_contract: RESOLUTION_CONTRACT,
      cinematic_continuity_gate_analysis_hash: evaluation.analysis_hash,
      cinematic_continuity_gate_passed: evaluation.passed,
      cinematic_continuity_conflict_count: evaluation.conflicts.length,
      cinematic_continuity_conflict_categories:
        evaluation.conflict_categories,
      cinematic_continuity_inherited_categories:
        evaluation.inherited_categories,
      cinematic_continuity_intentional_change_categories:
        evaluation.intentional_change_categories,
      cinematic_continuity_checked_before_provider_submission: true,
    },
    output: {
      ...object(task.output),
      cinematic_continuity_gate: evaluation,
    },
  });

  if (evaluation.passed) return task;
  return ProductionTaskRuntime.fail(
    task.id,
    new Error(
      `CREATIVE_CINEMATIC_CONTINUITY_CONFLICT:${evaluation.conflict_categories.join(",")}`,
    ),
    {
      cinematic_continuity_gate: evaluation,
      provider_submission_blocked: true,
      gpu_spend_blocked: true,
    },
  );
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutConflictGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithCinematicContinuityConflictGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    if (
      cinemaTask(task) &&
      !["RUNNING", "COMPLETED"].includes(text(task.status).toUpperCase())
    ) {
      task = await bindOrReject(task);
      if (text(task.status).toUpperCase() === "FAILED") return task;
    }
    return dispatchWithoutConflictGate(task.id);
  };
}

install();

export const CreativeCinematicContinuityConflictGate = Object.freeze({
  installed: true,
  gateContract: GATE_CONTRACT,
  resolutionContract: RESOLUTION_CONTRACT,
  intentionalChangeContract: INTENTIONAL_CHANGE_CONTRACT,
  plannedState,
  intentionalChanges,
  evaluateContinuity,
  bindOrReject,
});
