import "./CreativeLongFormAssetSelectionRuntimeV3";
import { CreativeAssetAutoSelectionRuntime } from "./CreativeAssetAutoSelectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.long-form-asset-selection-sanitizer.v3",
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
  "library",
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

const MEDIA_EXTENSIONS = new Set([
  "avif",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "png",
  "webm",
  "webp",
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

const DERIVED_TERMS = [
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
  "release master",
  "stinger",
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

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "";
  }
}

function instructionCorpus(input = {}) {
  return normalized([
    input.intent,
    input.command,
    input.prompt,
    input.request,
    input.brief?.objective,
    input.brief?.description,
    input.brief?.requirements,
    input.brief?.constraints,
    input.project?.objective,
    input.project?.description,
  ].map((value) =>
    typeof value === "string" ? value : safeJson(value),
  ).join(" "));
}

function strictOriginalSourceOnly(input = {}) {
  const source = instructionCorpus(input);
  if (!source) return false;

  const originalOnly = Boolean(
    /\b(?:verified\s+)?original\s+(?:source\s+)?assets?\s+only\b/.test(source) ||
    /\bsource\s+assets?\s+only\b/.test(source) ||
    /\bonly\s+(?:verified\s+)?original\s+(?:source\s+)?assets?\b/.test(source)
  );
  const derivedExclusion = Boolean(
    /\b(?:exclude|excluding|prohibit|prohibited|without|no)\b[^.]{0,180}\b(?:derived|generated|poster|campaign\s+layout|key\s*frame|crop|cropped|reframe|preview\s+render)\w*\b/.test(source) ||
    /\b(?:derived|generated|poster|campaign\s+layout|key\s*frame|crop|cropped|reframe|preview\s+render)\w*\b[^.]{0,180}\b(?:exclude|excluding|prohibit|prohibited|not\s+allowed)\b/.test(source)
  );

  return originalOnly && derivedExclusion;
}

function extension(value) {
  const source = text(value).toLowerCase().split(/[?#]/)[0];
  return source.match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function genericWords(value) {
  const words = normalized(value).split(/\s+/).filter(Boolean);
  return Boolean(
    words.length &&
    words.every((word) => GENERIC_CONTAINER_WORDS.has(word)),
  );
}

function fileStem(value) {
  const source = text(value).split(/[?#]/)[0].split("/").pop() || "";
  return source.replace(/\.[a-z0-9]+$/i, "");
}

function concreteOriginalFileIdentity(asset = {}, selected = {}) {
  const candidates = [
    asset.metadata?.original_file_name,
    asset.analysis?.storage_evidence?.original_file_name,
    asset.file_name,
    selected.original_file_name,
    selected.file_name,
  ].map(text).filter(Boolean);

  return candidates.some((candidate) => {
    const ext = extension(candidate);
    return MEDIA_EXTENSIONS.has(ext) && !genericWords(fileStem(candidate));
  });
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
    selected.source_class,
    selected.direct_use_policy,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function approvedMasterMotion(selected = {}) {
  return Boolean(
    selected.approved_master_motion === true ||
    normalized(selected.source_class) === "approved master motion" ||
    normalized(selected.direct_use_policy) === "immutable direct composite"
  );
}

function genericContainer(
  asset = {},
  selected = {},
  { allowApprovedMasterMotion = true } = {},
) {
  if (allowApprovedMasterMotion && approvedMasterMotion(selected)) return false;

  const declaredType = normalized(
    asset.asset_type ||
    asset.type ||
    asset.metadata?.asset_type ||
    asset.metadata?.collection_type,
  );
  if (CONTAINER_TYPES.has(declaredType)) return true;

  const displayIdentity =
    asset.name ||
    asset.title ||
    selected.name ||
    selected.file_name ||
    selected.original_file_name;

  return Boolean(
    genericWords(displayIdentity) &&
    !concreteOriginalFileIdentity(asset, selected)
  );
}

function intermediateArtifact(
  asset = {},
  selected = {},
  { allowApprovedMasterMotion = true } = {},
) {
  if (allowApprovedMasterMotion && approvedMasterMotion(selected)) return false;
  const identity = primaryIdentity(asset, selected);
  return INTERMEDIATE_TERMS.some((term) => identity.includes(term));
}

function strictDerivedArtifact(asset = {}, selected = {}) {
  if (approvedMasterMotion(selected)) return true;
  if (selected.original_source === false) return true;
  if (selected.source_node_is_root === false) return true;

  const identity = primaryIdentity(asset, selected);
  return DERIVED_TERMS.some((term) => identity.includes(term));
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

      const sourceOnly = strictOriginalSourceOnly(input);
      const assetById = new Map(
        list(result.assets).map((asset) => [text(asset.id), asset]),
      );
      const removed = [];
      const selectedAssets = list(result.selected_assets).filter((selected) => {
        const asset = assetById.get(text(selected.asset_id)) || {};
        const reason = sourceOnly && strictDerivedArtifact(asset, selected)
          ? "STRICT_ORIGINAL_SOURCE_ONLY_DERIVED_ASSET"
          : genericContainer(asset, selected, {
              allowApprovedMasterMotion: !sourceOnly,
            })
            ? "GENERIC_CONTAINER_WITHOUT_CONCRETE_FILE_IDENTITY"
            : intermediateArtifact(asset, selected, {
                allowApprovedMasterMotion: !sourceOnly,
              })
              ? "INTERMEDIATE_DELIVERABLE"
              : null;
        if (reason) {
          removed.push({
            asset_id: selected.asset_id,
            name: selected.name || selected.file_name || null,
            source_class: selected.source_class || null,
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
          `removed=${removed.length};strict_original_source_only=${sourceOnly}`,
        );
      }

      return {
        ...result,
        source: "AUTOMATIC_VERIFIED_LONG_FORM_COVERAGE_INTELLIGENCE_V6",
        selected_asset_ids: selectedAssets.map((selected) => selected.asset_id),
        selected_assets: selectedAssets,
        assets,
        long_form_asset_expansion: {
          ...(result.long_form_asset_expansion || {}),
          contract: "CREATIVE_LONG_FORM_ASSET_SELECTION_V6",
          final_asset_count: selectedAssets.length,
          generic_containers_excluded: true,
          generic_inferred_roles_cannot_override_container_identity: true,
          concrete_original_file_identity_required_for_generic_labels: true,
          intermediate_deliverables_excluded: true,
          strict_original_source_only: sourceOnly,
          approved_master_motion_allowed_as_immutable_composite: !sourceOnly,
          strict_source_policy_overrides_master_motion_reuse: sourceOnly,
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
  strictOriginalSourceOnly,
};
