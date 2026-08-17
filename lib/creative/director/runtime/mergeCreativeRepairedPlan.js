function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// An entry is matched to the one it revises by a stable identifier when it carries
// one, so a repair that reorders a list still revises the right entry instead of
// overwriting a neighbour by position.
const IDENTITY_KEYS = ["id", "code", "step_key", "deliverable_id", "scene_id", "shot_id"];

// Scenes and shots are structural arrays. A repair response is intentionally asked to
// return only the keys it changes, so a repair containing one broken shot must not mean
// "delete every other shot in the scene". That was exactly what happened on short
// temporal work: direction produced good shots plus one incomplete shot, the contract
// repair returned only that shot's missing camera/frame_plan fields, and the array merge
// truncated the scene to the repair fragment. Validation then rejected the repair for
// damage it had created itself, spending another reasoning call without moving closer
// to production.
//
// Other arrays keep the existing replacement semantics because their length can itself
// be a deliberate decision. Empty arrays remain an explicit clear everywhere.
const STRUCTURAL_PATCH_ARRAY_KEYS = new Set(["scenes", "shots"]);

function identity(entry) {
  if (!isObject(entry)) return null;
  for (const key of IDENTITY_KEYS) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return `${key}:${value.trim()}`;
  }
  return null;
}

// Replacing an array wholesale is right for a list of decisions -- clearing
// repair_before_production has to mean something, and a shorter list has to be able
// to remove an entry. It is destructive for a list of structures. A repair that
// returned deliverables as a skeleton, carrying the shape without the content,
// erased the real deliverable: validation then reported every field of
// deliverables.0 absent, down to a nested production_steps.0 that was also empty,
// for a plan that had been complete moments before.
//
// Entries are merged rather than substituted, so a partial entry inherits what it
// did not restate. For scenes and shots, unmentioned siblings are also preserved: a
// targeted repair is a patch, not a new cut of the film. Other non-empty arrays keep
// their historical replacement/truncation behaviour. An empty repaired array still
// clears explicitly.
function mergeArray(baseValue, repairedArray, { preserveUnmentioned = false } = {}) {
  if (!repairedArray.length) return repairedArray;

  const base = Array.isArray(baseValue) ? baseValue : [];
  const byIdentity = new Map();
  for (const entry of base) {
    const key = identity(entry);
    if (key && !byIdentity.has(key)) byIdentity.set(key, entry);
  }

  if (preserveUnmentioned) {
    const repairEntries = repairedArray.map((entry) => ({
      entry,
      key: identity(entry),
    }));

    // Structural patch semantics are safe only when every returned entry identifies
    // what it is revising. If the provider omits an id, fall back to the established
    // positional replacement behaviour rather than guessing which scene or shot it
    // intended to mutate.
    if (repairEntries.every(({ key }) => Boolean(key))) {
      const patches = new Map();
      const additions = [];

      for (const { entry, key } of repairEntries) {
        const matched = byIdentity.get(key);
        if (isObject(matched)) {
          patches.set(key, mergeCreativeRepairedPlan(matched, entry));
        } else {
          additions.push(entry);
        }
      }

      return [
        ...base.map((entry) => {
          const key = identity(entry);
          return key && patches.has(key) ? patches.get(key) : entry;
        }),
        ...additions,
      ];
    }
  }

  return repairedArray.map((entry, index) => {
    if (!isObject(entry)) return entry;
    const key = identity(entry);
    const matched = (key && byIdentity.get(key)) || base[index];
    return isObject(matched) ? mergeCreativeRepairedPlan(matched, entry) : entry;
  });
}

export function mergeCreativeRepairedPlan(basePlan = {}, repairedPlan = {}) {
  if (!isObject(basePlan)) {
    return isObject(repairedPlan) ? repairedPlan : basePlan;
  }
  if (!isObject(repairedPlan)) return basePlan;

  const merged = { ...basePlan };

  for (const [key, repairedValue] of Object.entries(repairedPlan)) {
    const baseValue = basePlan[key];

    if (Array.isArray(repairedValue)) {
      merged[key] = mergeArray(baseValue, repairedValue, {
        preserveUnmentioned: STRUCTURAL_PATCH_ARRAY_KEYS.has(key),
      });
      continue;
    }

    if (isObject(repairedValue) && isObject(baseValue)) {
      merged[key] = mergeCreativeRepairedPlan(baseValue, repairedValue);
      continue;
    }

    if (repairedValue !== undefined) {
      merged[key] = repairedValue;
    }
  }

  return merged;
}

export default mergeCreativeRepairedPlan;
