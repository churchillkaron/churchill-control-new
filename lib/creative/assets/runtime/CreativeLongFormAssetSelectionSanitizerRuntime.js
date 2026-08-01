import "./CreativeLongFormAssetSelectionRuntimeV3";
import { CreativeAssetAutoSelectionRuntime } from "./CreativeAssetAutoSelectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.long-form-asset-selection-sanitizer.v1",
);

const GENERIC_CONTAINER_WORDS = new Set([
  "asset",
  "assets",
  "file",
  "files",
  "gallery",
  "galleries",
  "image",
  "images",
  "media",
  "photo",
  "photos",
  "upload",
  "uploads",
  "video",
  "videos",
]);

const CONTAINER_TYPES = new Set([
  "album",
  "collection",
  "folder",
  "gallery",
  "library",
  "media collection",
  "media folder",
]);

const INTERMEDIATE_TERMS = [
  "campaign design",
  "campaign layout",
  "campaign creative",
  "content package",
  "content pack",
  "asset pack",
  "facebook feed",
  "instagram feed",
  "social feed",
  "social post",
  "facebook post",
  "instagram post",
  "poster",
  "flyer",
  "banner",
  "thumbnail",
  "storyboard",
  "layout",
  "mockup",
  "keyframe",
  "key frame",
  "still frame",
  "extracted frame",
  "generated frame",
  "contact sheet",
  "crop",
  "cropped",
  "reframe",
  "reframed",
  "preview render",
  "template composition",
];

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function primaryIdentity(asset = {}, selected = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.metadata?.original_file_name,
    asset.metadata?.asset_role,
    asset.metadata?.role,
    asset.metadata?.category,
    asset.metadata?.purpose,
    selected.name,
    selected.file_name,
    selected.original_file_name,
    selected.selected_role,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function genericContainer(asset = {}, selected = {}) {
  const declaredType = normalized(
    asset.asset_type ||
    asset.type ||
    asset.metadata?.asset_type ||
    asset.metadata?.collection_type,
  );
  if (CONTAINER_TYPES.has(declaredType)) return true;

  const identity = normalized(
    asset.name ||
    asset.title ||
    selected.name ||
    selected.file_name ||
    selected.original_file_name,
  );
  const words = identity.split(/\s+/).filter(Boolean);
  const meaningfulRoles = list(selected.roles).filter((role) =>
    !["LONG_FORM_SOURCE", "SOURCE", "VIDEO_SOURCE"].includes(
      text(role).toUpperCase(),
    ),
  );

  return Boolean(
    words.length > 0 &&
    words.every((word) => GENERIC_CONTAINER_WORDS.has(word)) &&
    meaningfulRoles.length === 0 &&
    text(selected.media_kind).toUpperCase() !== "VIDEO"
  );
}

function intermediateArtifact(asset = {}, selected = {}) {
  if (selected.approved_master_motion === true) return false;
  const identity = primaryIdentity(asset, selected);
  return INTERMEDIATE_TERMS.some((term) => identity.includes(term));
}

function install() {
  if (CreativeAssetAutoSelectionRuntime[INSTALL_FLAG]) return;

  const resolveWithoutSanitizer =
    CreativeAssetAutoSelectionRuntime.resolve.bind(
      CreativeAssetAutoSelectionRuntime,
    );

  Object.defineProperty(CreativeAssetAutoSelectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAssetAutoSelectionRuntime.resolve =
    async function resolveWithSanitizedLongFormSelection(input = {}) {
      const result = await resolveWithoutSanitizer(input);
      if (
        !text(result.source).startsWith(
          "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE",
        )
      ) return result;

      const assetById = new Map(
        list(result.assets).map((asset) => [text(asset.id), asset]),
      );
      const removed = [];
      const selectedAssets = list(result.selected_assets).filter((selected) => {
        const asset = assetById.get(text(selected.asset_id)) || {};
        const reason = genericContainer(asset, selected)
          ? "GENERIC_CONTAINER_WITHOUT_SEMANTIC_ROLE"
          : intermediateArtifact(asset, selected)
            ? "INTERMEDIATE_DELIVERABLE"
            : null;
        if (reason) {
          removed.push({
            asset_id: selected.asset_id,
            name: selected.name || selected.file_name || null,
            reason,
          });
          return false;
        }
        return true;
      });

      const selectedIds = new Set(
        selectedAssets.map((selected) => text(selected.asset_id)),
      );
      const assets = list(result.assets).filter((asset) =>
        selectedIds.has(text(asset.id)),
      );

      const required = 10;
      if (selectedAssets.length < required) {
        throw new Error(
          `CREATIVE_LONG_FORM_SANITIZED_COVERAGE_INSUFFICIENT:` +
          `selected=${selectedAssets.length};required=${required};` +
          `removed=${removed.length}`,
        );
      }

      return {
        ...result,
        source: "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE_V4",
        selected_asset_ids: selectedAssets.map((selected) => selected.asset_id),
        selected_assets: selectedAssets,
        assets,
        long_form_asset_expansion: {
          ...(result.long_form_asset_expansion || {}),
          contract: "CREATIVE_LONG_FORM_ASSET_SELECTION_V4",
          final_asset_count: selectedAssets.length,
          generic_containers_excluded: true,
          intermediate_deliverables_excluded: true,
          sanitized_removed_count: removed.length,
          sanitized_removed_assets: removed,
          filename_or_asset_id_override_used: false,
        },
      };
    };
}

install();

export const CreativeLongFormAssetSelectionSanitizerRuntime = {
  installed: true,
};
