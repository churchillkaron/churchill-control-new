// Both repair paths -- the master plan contract repair and the dynamic tribunal
// repair -- ask a model for a repaired Creative Master Plan and then replaced the
// plan wholesale with what came back. A complete plan carries 21 agency role
// decisions plus concept, deliverables, scenes and production structure, and a
// repair focused on one weakness routinely returned the improvement with some of
// that scaffolding dropped. The plan that had just passed validation was then
// replaced by one that failed it, on fields nobody had asked the repair to touch.
//
// Repairing direction is not the same as re-emitting the contract. A repair is
// merged onto the plan that went in: an omitted key keeps its reviewed value, and
// only what the repair actually returned changes.
//
// Arrays replace wholesale, because a returned list is the new intended list --
// deliverables and scenes must be replaceable, and
// creative_review.repair_before_production must be able to become empty. Objects
// merge per key, so a repair revising three roles does not erase the other
// eighteen. An explicit null replaces: it is a deliberate value, and validation
// is what judges it.

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const MAXIMUM_MERGE_DEPTH = 6;

export function mergeCreativeRepairedPlan(base, repair, depth = 0) {
  const source = plainObject(base);
  const patch = plainObject(repair);
  if (depth > MAXIMUM_MERGE_DEPTH) return patch;

  const merged = { ...source };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = source[key];
    const mergeable =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing);
    merged[key] = mergeable
      ? mergeCreativeRepairedPlan(existing, value, depth + 1)
      : value;
  }
  return merged;
}

export default mergeCreativeRepairedPlan;
