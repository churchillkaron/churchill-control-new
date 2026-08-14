// Which selected assets a plan has not accounted for in its manifest.
//
// SELECTED_ASSET_UNACCOUNTED was the most persistent failure in this contract, and it stayed
// unfixed while repairs were handed the rule and the full list of selected ids but never the
// difference between them. Naming the missing ids fixed that for the universal path -- and then
// the temporal path kept failing on it, because the computation lived inside the master plan
// runtime's execution checklist and the temporal repair had no checklist.
//
// It lives here so both paths compute the gap the same way, and so a third path cannot
// reintroduce the same omission by having its own idea of what counts as accounted for.
//
// Only the omission is reported. The disposition of each asset is a creative decision: filling
// one in to satisfy the gate would invent direction, and an asset silently dropped is exactly
// what the check exists to catch.

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

// The manifest may key an entry by asset_id, by id, or be a bare id string. This mirrors how
// the validator reads it, so the reported gap cannot disagree with the gate that enforces it.
function manifestAssetId(entry) {
  if (typeof entry === "string") return text(entry);
  return text(entry?.asset_id || entry?.id);
}

function manifestEntries(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return [value];
  return [];
}

export function unaccountedSelectedAssetIds(plan = {}, assets = []) {
  const manifested = new Set(
    manifestEntries(plan?.asset_manifest).map(manifestAssetId).filter(Boolean),
  );
  return list(assets)
    .map((asset) => text(asset?.asset_id || asset?.id))
    .filter((id) => id && !manifested.has(id));
}

export default unaccountedSelectedAssetIds;
