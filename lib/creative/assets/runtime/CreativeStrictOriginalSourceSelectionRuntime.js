import {
  CreativeAssetAutoSelectionRuntime,
} from "./CreativeAssetAutoSelectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.strict-original-source-selection.v1",
);
const CONTRACT = "CREATIVE_STRICT_ORIGINAL_SOURCE_SELECTION_V1";

const DERIVED_TERMS = Object.freeze([
  "approved master motion",
  "brand motion",
  "delivery master",
  "derived",
  "derivative",
  "final master",
  "generated",
  "logo animation",
  "logo reveal",
  "master video",
  "motion logo",
  "opener",
  "preview render",
  "release master",
  "stinger",
  "template composition",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "";
  }
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function instructionCorpus(input = {}) {
  return normalized([
    input.intent,
    input.command,
    input.prompt,
    input.request,
    input.objective,
    input.business_goal,
    input.mission?.objective,
    input.mission?.business_goal,
    input.mission?.metadata?.original_intent,
    input.project?.objective,
    input.project?.business_goal,
    input.project?.metadata?.original_intent,
    input.brief?.objective,
    input.brief?.creative_objective,
    input.brief?.description,
    input.brief?.requirements,
    input.brief?.constraints,
  ].map((value) =>
    typeof value === "string" ? value : safeJson(value),
  ).join(" "));
}

function strictOriginalSourceOnly(input = {}) {
  const source = instructionCorpus(input);
  if (!source) return false;

  const originalOnly = Boolean(
    /\b(?:verified\s+)?original\b[^.;\n]{0,100}\bassets?\s+only\b/.test(source) ||
    /\bsource\s+assets?\s+only\b/.test(source) ||
    /\bonly\s+(?:verified\s+)?original\b[^.;\n]{0,100}\bassets?\b/.test(source)
  );
  const derivedExcluded = Boolean(
    /\b(?:exclude|excluding|prohibit|prohibited|without|no)\b[^.;\n]{0,240}\b(?:derived|generated|poster|campaign\s+layout|key\s*frame|crop|cropped|reframe|preview\s+render)\w*\b/.test(source) ||
    /\b(?:derived|generated|poster|campaign\s+layout|key\s*frame|crop|cropped|reframe|preview\s+render)\w*\b[^.;\n]{0,240}\b(?:exclude|excluding|prohibit|prohibited|not\s+allowed)\b/.test(source)
  );

  return originalOnly && derivedExcluded;
}

function identity(asset = {}, selected = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.asset_type,
    asset.type,
    asset.metadata?.original_file_name,
    asset.metadata?.asset_role,
    asset.metadata?.role,
    asset.metadata?.source_type,
    asset.metadata?.generation_type,
    asset.metadata?.render_role,
    selected.name,
    selected.file_name,
    selected.original_file_name,
    selected.selected_role,
    selected.source_class,
    selected.direct_use_policy,
    selected.source_type,
    selected.generation_type,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function derived(asset = {}, selected = {}) {
  if (selected.approved_master_motion === true) return true;
  if (selected.original_source === false) return true;
  if (selected.source_node_is_root === false) return true;
  if (text(selected.source_class).toUpperCase() === "APPROVED_MASTER_MOTION") {
    return true;
  }
  if (
    normalized(selected.direct_use_policy) ===
    "immutable direct composite"
  ) return true;
  if (asset.parent_asset_node_id) return true;

  const evidence = identity(asset, selected);
  return DERIVED_TERMS.some((term) => evidence.includes(term));
}

function install() {
  if (CreativeAssetAutoSelectionRuntime[INSTALL_FLAG]) return;

  const resolveWithoutStrictSourceSelection =
    CreativeAssetAutoSelectionRuntime.resolve.bind(
      CreativeAssetAutoSelectionRuntime,
    );

  Object.defineProperty(CreativeAssetAutoSelectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAssetAutoSelectionRuntime.resolve =
    async function resolveWithStrictOriginalSourceSelection(input = {}) {
      const result = await resolveWithoutStrictSourceSelection(input);
      if (!strictOriginalSourceOnly(input)) return result;
      if (
        !text(result.source).startsWith(
          "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE",
        )
      ) return result;

      const assetById = new Map(
        list(result.assets).map((asset) => [text(asset.id), asset]),
      );
      const removed = [];
      const selectedAssets = list(result.selected_assets).filter(
        (selected) => {
          const asset = assetById.get(text(selected.asset_id)) || {};
          if (!derived(asset, selected)) return true;
          removed.push({
            asset_id: selected.asset_id,
            name: selected.name || selected.file_name || null,
            source_class: selected.source_class || null,
            reason: "STRICT_ORIGINAL_SOURCE_ONLY_DERIVED_ASSET",
          });
          return false;
        },
      );
      const selectedIds = selectedAssets
        .map((selected) => text(selected.asset_id))
        .filter(Boolean);
      const selectedIdSet = new Set(selectedIds);
      const assets = list(result.assets).filter((asset) =>
        selectedIdSet.has(text(asset.id)),
      );

      const minimum = 10;
      if (selectedIds.length < minimum) {
        throw new Error(
          `CREATIVE_STRICT_ORIGINAL_SOURCE_COVERAGE_INSUFFICIENT:` +
          `selected=${selectedIds.length};required=${minimum};` +
          `removed=${removed.length}`,
        );
      }
      if (assets.length !== selectedIds.length) {
        throw new Error(
          `CREATIVE_STRICT_ORIGINAL_SOURCE_SELECTION_MATERIALIZATION_MISMATCH:` +
          `selected=${selectedIds.length};assets=${assets.length}`,
        );
      }

      return {
        ...result,
        source: "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE_V6",
        selected_asset_ids: selectedIds,
        selected_assets: selectedAssets,
        assets,
        long_form_asset_expansion: {
          ...object(result.long_form_asset_expansion),
          contract:
            result.long_form_asset_expansion?.contract ||
            "CREATIVE_LONG_FORM_ASSET_SELECTION_V6",
          strict_original_source_only: true,
          approved_master_motion_allowed_as_immutable_composite: false,
          strict_source_policy_overrides_master_motion_reuse: true,
          strict_original_source_selection_contract: CONTRACT,
          strict_original_source_selected_count: selectedIds.length,
          strict_original_source_removed_count: removed.length,
          strict_original_source_removed_assets: removed,
        },
      };
    };
}

install();

export const CreativeStrictOriginalSourceSelectionRuntime = {
  installed: true,
  strictOriginalSourceOnly,
};
