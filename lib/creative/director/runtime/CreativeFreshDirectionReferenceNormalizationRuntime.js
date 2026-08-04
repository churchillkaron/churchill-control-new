import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  validateCreativeShotReferenceContract,
} from "../validation/CreativeShotReferenceContractValidator";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.fresh-direction-reference-normalization.v1",
);

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

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
      asset.technical?.mime_type ||
      asset.metadata?.mime_type ||
      asset.analysis?.technical_inspection?.mime_type ||
      asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(
    asset.url ||
      asset.file_url ||
      asset.image_url ||
      asset.thumbnail_url,
  ).toLowerCase();

  if (
    mime.startsWith("video/") ||
    type.includes("video") ||
    /\.(mp4|mov|m4v|webm|mkv)(\?|$)/.test(source)
  ) return "VIDEO";

  if (
    mime.startsWith("audio/") ||
    /audio|music|voice|sfx/.test(type) ||
    /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)
  ) return "AUDIO";

  if (
    mime.startsWith("image/") ||
    /image|logo|brand/.test(type) ||
    /\.(jpg|jpeg|png|webp|heic|avif)(\?|$)/.test(source)
  ) return "IMAGE";

  if (/pdf|document|presentation|spreadsheet/.test(`${mime} ${type}`)) {
    return "DOCUMENT";
  }

  return "OTHER";
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
  const visualRoles = new Set([
    "PRIMARY_SOURCE",
    "IDENTITY_REFERENCE",
    "LOCATION_REFERENCE",
    "CONTINUITY_REFERENCE",
    "PRODUCT_REFERENCE",
    "STYLE_REFERENCE",
    "SUBJECT_REFERENCE",
  ]);
  return Boolean(
    references.some((reference) =>
      visualRoles.has(text(reference?.role).toUpperCase()),
    ) ||
      medium === "LIVE-ASSET" ||
      medium === "ASSET-LED-MOTION" ||
      shot.source_required === true ||
      shot.generation?.source_required === true
  );
}

function fallbackRoleForAsset(asset = {}) {
  const kind = assetKind(asset);
  if (kind === "IMAGE" || kind === "VIDEO") return "STYLE_REFERENCE";
  if (kind === "AUDIO") return "AUDIO_REFERENCE";
  return null;
}

function pathIndexes(path = "") {
  const match = text(path).match(
    /^scenes\.(\d+)\.shots\.(\d+)(?:\.reference_assets\.(\d+))?/,
  );
  if (!match) return null;
  return {
    sceneIndex: Number(match[1]),
    shotIndex: Number(match[2]),
    referenceIndex: match[3] === undefined ? null : Number(match[3]),
  };
}

function clonePlan(plan = {}) {
  return {
    ...object(plan),
    scenes: list(plan.scenes).map((scene) => ({
      ...object(scene),
      shots: list(scene?.shots).map((shot) => ({
        ...object(shot),
        reference_assets: list(shot?.reference_assets).map((reference) =>
          reference && typeof reference === "object" && !Array.isArray(reference)
            ? { ...reference }
            : reference,
        ),
        reference_asset_ids: list(shot?.reference_asset_ids),
        generation: {
          ...object(shot?.generation),
          provider_parameters: {
            ...object(shot?.generation?.provider_parameters),
          },
        },
        metadata: {
          ...object(shot?.metadata),
        },
      })),
    })),
    metadata: {
      ...object(plan.metadata),
    },
  };
}

function normalizedTypedReferences(shot = {}, assetById) {
  const rows = [];
  const byId = new Map();

  for (const entry of list(shot.reference_assets)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        "CREATIVE_FRESH_REFERENCE_NORMALIZATION_UNTYPED_REFERENCE_UNSAFE",
      );
    }
    const id = assetId(entry);
    if (!id || !assetById.has(id)) {
      throw new Error(
        `CREATIVE_FRESH_REFERENCE_NORMALIZATION_ASSET_UNKNOWN:${id || "MISSING"}`,
      );
    }
    if (byId.has(id)) {
      throw new Error(
        `CREATIVE_FRESH_REFERENCE_NORMALIZATION_DUPLICATE_ASSET:${id}`,
      );
    }
    const row = {
      ...entry,
      asset_id: id,
      role: text(
        entry.role || entry.asset_role || entry.binding_role,
      ).toUpperCase(),
    };
    rows.push(row);
    byId.set(id, row);
  }

  const legacyIds = list(shot.reference_asset_ids)
    .map(assetId)
    .filter(Boolean);
  const typedIds = new Set(rows.map((row) => row.asset_id));
  const unrepresentedLegacy = legacyIds.filter((id) => !typedIds.has(id));
  if (unrepresentedLegacy.length) {
    throw new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_LEGACY_AUTHORITY_UNSAFE:${unrepresentedLegacy.join(",")}`,
    );
  }

  return rows;
}

function normalizePrimaryAuthority({
  shot,
  references,
  assetById,
  evidence,
  sceneIndex,
  shotIndex,
}) {
  const explicit = explicitPrimaryIds(shot);
  if (explicit.length > 1) {
    throw new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_PRIMARY_AMBIGUOUS:${sceneIndex + 1}:${shotIndex + 1}:${explicit.join(",")}`,
    );
  }

  const rolePrimary = references
    .filter((row) => text(row.role).toUpperCase() === "PRIMARY_SOURCE")
    .map((row) => row.asset_id);
  const flagPrimary = references
    .filter((row) =>
      row.primary_source === true ||
      row.primarySource === true ||
      row.primary === true,
    )
    .map((row) => row.asset_id);

  let primaryId = explicit[0] || null;
  if (!primaryId && rolePrimary.length === 1) primaryId = rolePrimary[0];
  if (!primaryId && rolePrimary.length > 1) {
    throw new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_PRIMARY_ROLE_AMBIGUOUS:${sceneIndex + 1}:${shotIndex + 1}:${rolePrimary.join(",")}`,
    );
  }
  if (!primaryId && flagPrimary.length === 1) primaryId = flagPrimary[0];
  if (!primaryId && flagPrimary.length > 1) {
    throw new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_PRIMARY_FLAG_AMBIGUOUS:${sceneIndex + 1}:${shotIndex + 1}:${flagPrimary.join(",")}`,
    );
  }

  const required = sourceRequired(shot, references);
  if (!primaryId && required && references.length === 1) {
    primaryId = references[0].asset_id;
    evidence.primary_inferred_from_single_reference_count += 1;
  }
  if (!primaryId && required && references.length !== 1) {
    throw new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_PRIMARY_UNRESOLVED:${sceneIndex + 1}:${shotIndex + 1}:reference_count=${references.length}`,
    );
  }

  if (!primaryId) {
    return {
      shot: {
        ...shot,
        reference_assets: references,
        reference_asset_ids: [],
      },
      references,
    };
  }

  const primaryAsset = assetById.get(primaryId);
  if (!primaryAsset || !["IMAGE", "VIDEO"].includes(assetKind(primaryAsset))) {
    throw new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_PRIMARY_NOT_VISUAL:${sceneIndex + 1}:${shotIndex + 1}:${primaryId}`,
    );
  }

  let primaryFound = false;
  const normalizedReferences = references.map((reference) => {
    if (reference.asset_id === primaryId) {
      primaryFound = true;
      if (text(reference.role).toUpperCase() !== "PRIMARY_SOURCE") {
        evidence.primary_role_promoted_count += 1;
      }
      return {
        ...reference,
        role: "PRIMARY_SOURCE",
        primary_source: true,
      };
    }

    if (text(reference.role).toUpperCase() !== "PRIMARY_SOURCE") {
      return {
        ...reference,
        primary_source: false,
      };
    }

    const fallbackRole = fallbackRoleForAsset(
      assetById.get(reference.asset_id),
    );
    if (!fallbackRole) {
      throw new Error(
        `CREATIVE_FRESH_REFERENCE_NORMALIZATION_SECONDARY_ROLE_UNSAFE:${sceneIndex + 1}:${shotIndex + 1}:${reference.asset_id}`,
      );
    }
    evidence.extra_primary_demoted_count += 1;
    return {
      ...reference,
      role: fallbackRole,
      primary_source: false,
    };
  });

  if (!primaryFound) {
    normalizedReferences.unshift({
      asset_id: primaryId,
      role: "PRIMARY_SOURCE",
      primary_source: true,
    });
    evidence.primary_reference_inserted_count += 1;
  }

  const generation = object(shot.generation);
  const providerParameters = object(generation.provider_parameters);

  return {
    shot: {
      ...shot,
      primary_source_asset_id: primaryId,
      reference_assets: normalizedReferences,
      reference_asset_ids: [],
      generation: {
        ...generation,
        primary_source_asset_id: primaryId,
        provider_parameters: {
          ...providerParameters,
          primary_source_asset_id: primaryId,
        },
      },
      metadata: {
        ...object(shot.metadata),
        primary_source_asset_id: primaryId,
      },
    },
    references: normalizedReferences,
  };
}

export function normalizeCreativeFreshDirectionReferences(
  plan = {},
  assets = [],
) {
  const assetById = new Map(
    list(assets)
      .map((asset) => [assetId(asset), asset])
      .filter(([id]) => Boolean(id)),
  );
  const normalized = clonePlan(plan);
  const before = validateCreativeShotReferenceContract({
    plan: normalized,
    assets,
  });
  const evidence = {
    contract: "CREATIVE_FRESH_REFERENCE_NORMALIZATION_V1",
    initial_failure_count: before.failures.length,
    initial_failure_codes: unique(
      before.failures.map((failure) => failure.code),
    ),
    primary_role_promoted_count: 0,
    primary_reference_inserted_count: 0,
    primary_inferred_from_single_reference_count: 0,
    extra_primary_demoted_count: 0,
    unsupported_role_downgraded_count: 0,
    cleared_legacy_reference_id_field_count: 0,
  };

  normalized.scenes = list(normalized.scenes).map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) => {
      const references = normalizedTypedReferences(shot, assetById);
      if (list(shot.reference_asset_ids).length) {
        evidence.cleared_legacy_reference_id_field_count += 1;
      }
      return normalizePrimaryAuthority({
        shot,
        references,
        assetById,
        evidence,
        sceneIndex,
        shotIndex,
      }).shot;
    }),
  }));

  let intermediate = validateCreativeShotReferenceContract({
    plan: normalized,
    assets,
  });

  for (const failure of intermediate.failures) {
    if (failure.code !== "SHOT_REFERENCE_ROLE_UNSUPPORTED_BY_ASSET") {
      continue;
    }
    const indexes = pathIndexes(failure.path);
    if (!indexes || indexes.referenceIndex === null) {
      throw new Error(
        `CREATIVE_FRESH_REFERENCE_NORMALIZATION_FAILURE_PATH_INVALID:${failure.path}`,
      );
    }
    const reference = normalized
      .scenes[indexes.sceneIndex]
      ?.shots[indexes.shotIndex]
      ?.reference_assets[indexes.referenceIndex];
    const id = assetId(reference);
    const fallbackRole = fallbackRoleForAsset(assetById.get(id));
    if (!fallbackRole || text(reference?.role).toUpperCase() === "PRIMARY_SOURCE") {
      throw new Error(
        `CREATIVE_FRESH_REFERENCE_NORMALIZATION_UNSUPPORTED_ROLE_UNSAFE:${failure.path}:${id}`,
      );
    }
    reference.role = fallbackRole;
    reference.primary_source = false;
    evidence.unsupported_role_downgraded_count += 1;
  }

  intermediate = validateCreativeShotReferenceContract({
    plan: normalized,
    assets,
  });
  if (!intermediate.passed) {
    const codes = unique(
      intermediate.failures.map((failure) => failure.code),
    );
    const error = new Error(
      `CREATIVE_FRESH_REFERENCE_NORMALIZATION_UNSAFE:${codes.join(",")}`,
    );
    error.validation = intermediate;
    throw error;
  }

  evidence.final_failure_count = 0;
  normalized.metadata = {
    ...object(normalized.metadata),
    fresh_reference_normalization: evidence,
  };

  return {
    plan: normalized,
    evidence,
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;

  const originalCreate = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithFreshReferenceNormalization(input = {}) {
      const result = await originalCreate(input);
      if (!result?.plan) return result;

      const normalized = normalizeCreativeFreshDirectionReferences(
        result.plan,
        list(input.assets),
      );
      console.log(
        `CREATIVE_FRESH_REFERENCE_NORMALIZED=${JSON.stringify(normalized.evidence)}`,
      );
      return {
        ...result,
        plan: normalized.plan,
        fresh_direction_reference_normalization: normalized.evidence,
      };
    };
}

install();

export const CreativeFreshDirectionReferenceNormalizationRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_FRESH_REFERENCE_NORMALIZATION_V1",
  normalize: normalizeCreativeFreshDirectionReferences,
});
