function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// An entry is matched to the one it revises by a stable identifier when it carries
// one, so a repair that reorders a list still revises the right entry instead of
// overwriting a neighbour by position.
const IDENTITY_KEYS = ["id", "code", "step_key", "deliverable_id", "scene_id", "shot_id"];

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
// did not restate. The two intentional behaviours are kept: an empty repaired array
// still clears, and a shorter one still truncates.
function mergeArray(baseValue, repairedArray) {
  if (!repairedArray.length) return repairedArray;

  const base = Array.isArray(baseValue) ? baseValue : [];
  const byIdentity = new Map();
  for (const entry of base) {
    const key = identity(entry);
    if (key && !byIdentity.has(key)) byIdentity.set(key, entry);
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
      // Arrays are intentional production decisions, so the repaired list governs
      // its own length and never silently restores the old one. Entries within it
      // still merge -- see mergeArray.
      merged[key] = mergeArray(baseValue, repairedValue);
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
