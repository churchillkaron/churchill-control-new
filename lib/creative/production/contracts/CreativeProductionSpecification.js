const SPECIFICATION_VERSION =
  "CREATIVE_PRODUCTION_SPECIFICATION_V1";

const MOTION_PRODUCT_TYPES = new Set([
  "FILM",
  "TRAILER",
  "CUTDOWN",
  "PRODUCT_FILM",
  "SOCIAL_VIDEO",
  "VIDEO_AD",
]);

const AUDIO_PRODUCT_TYPES = new Set([
  "AUDIO_AD",
  "PODCAST",
  "VOICEOVER",
]);

const VISUAL_PRODUCT_TYPES = new Set([
  ...MOTION_PRODUCT_TYPES,
  "IMAGE_CAMPAIGN",
  "BANNER_SET",
  "MENU",
  "BROCHURE",
  "LANDING_PAGE",
  "WEBSITE",
  "BRAND_SYSTEM",
  "PRESENTATION",
  "OOH",
  "EMAIL_CAMPAIGN",
]);

const PRODUCT_ALIASES = Object.freeze({
  VIDEO: "FILM",
  MASTER_VIDEO: "FILM",
  MASTER_FILM: "FILM",
  MOVIE: "FILM",
  COMMERCIAL: "VIDEO_AD",
  AD_FILM: "VIDEO_AD",
  SOCIAL_FILM: "SOCIAL_VIDEO",
  SOCIAL_CLIP: "SOCIAL_VIDEO",
  IMAGE: "IMAGE_CAMPAIGN",
  IMAGES: "IMAGE_CAMPAIGN",
  POSTER: "IMAGE_CAMPAIGN",
  BANNERS: "BANNER_SET",
  WEBPAGE: "LANDING_PAGE",
  WEB_PAGE: "LANDING_PAGE",
  WEB: "WEBSITE",
  SITE: "WEBSITE",
  DECK: "PRESENTATION",
  SLIDES: "PRESENTATION",
  OUT_OF_HOME: "OOH",
  EMAIL: "EMAIL_CAMPAIGN",
  OPEN_CREATIVE_MISSION: "OPEN_CREATIVE_MISSION",
});

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(
        (entry) =>
          entry !== undefined &&
          entry !== null &&
          entry !== "",
      )
    : [value];
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [
    ...new Set(
      values
        .map((value) => text(value))
        .filter(Boolean),
    ),
  ];
}

function positiveNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function positiveInteger(value, fallback = null) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function normalizeToken(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function productionError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          stableValue(value[key]),
        ]),
    );
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function compactHash(value) {
  const source = stableStringify(value);
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

function normalizeProductType(value) {
  const token = normalizeToken(value);
  if (!token) return null;
  return PRODUCT_ALIASES[token] || token;
}

function inferProductType(input = {}) {
  const explicit = normalizeProductType(
    input.product_type ||
    input.deliverable_type ||
    input.output_type ||
    input.brief?.product_type ||
    input.brief?.deliverable_type,
  );

  if (explicit) return explicit;

  for (const output of list(
    input.requested_outputs ||
    input.deliverables,
  )) {
    const candidate = normalizeProductType(
      typeof output === "string"
        ? output
        : output?.product_type ||
          output?.type ||
          output?.deliverable_type ||
          output?.format,
    );

    if (candidate) return candidate;
  }

  if (
    positiveNumber(
      input.target_duration_seconds ||
      input.duration_seconds ||
      input.duration,
    )
  ) {
    return "FILM";
  }

  return "OPEN_CREATIVE_MISSION";
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function canonicalReferenceIds(assets = []) {
  return unique(
    list(assets).map(assetId),
  );
}

function normalizeReferenceIds(value) {
  return unique(
    list(value).map((entry) =>
      typeof entry === "string" ||
      typeof entry === "number"
        ? entry
        : entry?.id ||
          entry?.asset_id ||
          entry?.reference_asset_id,
    ),
  );
}

function normalizeDeliverable(
  value,
  index,
  defaults,
) {
  const source = typeof value === "string"
    ? { product_type: value }
    : object(value);
  const productType = normalizeProductType(
    source.product_type ||
    source.type ||
    source.deliverable_type ||
    source.format ||
    defaults.product_type,
  );
  const duration = positiveNumber(
    source.target_duration_seconds ||
    source.duration_seconds ||
    source.duration,
    MOTION_PRODUCT_TYPES.has(productType)
      ? defaults.target_duration_seconds
      : null,
  );

  return {
    id:
      text(source.id) ||
      `deliverable_${index + 1}`,
    product_type: productType,
    title:
      text(source.title || source.name) ||
      null,
    channel:
      text(source.channel || source.platform) ||
      null,
    target_duration_seconds: duration,
    aspect_ratios: unique([
      ...list(source.aspect_ratios),
      ...list(source.aspect_ratio),
    ]),
    dimensions: object(source.dimensions),
    formats: unique([
      ...list(source.formats),
      ...list(source.format),
    ]),
    locales: unique([
      ...list(source.locales),
      ...list(source.languages),
      ...list(source.language),
    ]),
    quantity:
      positiveInteger(
        source.quantity || source.count,
        1,
      ),
    required: source.required !== false,
    metadata: object(source.metadata),
  };
}

function normalizeDeliverables(
  input,
  defaults,
) {
  const values = list(
    input.deliverables ||
    input.requested_outputs,
  );

  const deliverables = values.map(
    (value, index) =>
      normalizeDeliverable(
        value,
        index,
        defaults,
      ),
  );

  if (deliverables.length) {
    return deliverables;
  }

  return [
    normalizeDeliverable(
      {
        product_type:
          defaults.product_type,
        target_duration_seconds:
          defaults.target_duration_seconds,
      },
      0,
      defaults,
    ),
  ];
}

function referenceIdsFromPlan(plan = {}) {
  const ids = [];

  for (const scene of list(plan.scenes)) {
    for (const actor of list(scene?.actors)) {
      ids.push(
        ...normalizeReferenceIds(
          actor?.identity_reference_asset_ids ||
          actor?.reference_asset_ids,
        ),
      );
    }

    for (const shot of list(scene?.shots)) {
      ids.push(
        ...normalizeReferenceIds(
          shot?.reference_asset_ids ||
          shot?.assets,
        ),
        ...normalizeReferenceIds(
          shot?.master_still_contract
            ?.reference_asset_ids,
        ),
      );

      for (const actor of list(shot?.actors)) {
        ids.push(
          ...normalizeReferenceIds(
            actor?.identity_reference_asset_ids ||
            actor?.reference_asset_ids,
          ),
        );
      }
    }
  }

  return unique(ids);
}

export function compileCreativeProductionSpecification({
  organization_id,
  input = {},
  assets = [],
  existing = null,
} = {}) {
  if (!organization_id) {
    throw productionError(
      "CREATIVE_PRODUCTION_SPECIFICATION_ORGANIZATION_REQUIRED",
    );
  }

  const source = {
    ...object(input.production_specification),
    ...object(existing),
  };
  const brief = object(input.brief);
  const productType = normalizeProductType(
    source.product_type ||
    inferProductType(input),
  );
  const temporal =
    source.temporal === true ||
    MOTION_PRODUCT_TYPES.has(productType) ||
    AUDIO_PRODUCT_TYPES.has(productType);
  const targetDuration = positiveNumber(
    source.target_duration_seconds ||
    input.target_duration_seconds ||
    input.duration_seconds ||
    input.duration ||
    brief.target_duration_seconds,
    temporal ? 30 : null,
  );
  const fps = positiveInteger(
    source.fps || input.fps || brief.fps,
    temporal ? 30 : null,
  );
  const maxShotDuration = positiveNumber(
    source.max_shot_duration_seconds ||
    input.max_shot_duration_seconds ||
    brief.max_shot_duration_seconds,
    temporal ? 15 : null,
  );
  const canonicalIds = canonicalReferenceIds(
    assets,
  );
  const requiredReferenceIds = normalizeReferenceIds(
    source.required_reference_asset_ids ||
    input.required_reference_asset_ids ||
    brief.required_reference_asset_ids,
  );
  const unknownRequiredReferences =
    requiredReferenceIds.filter(
      (id) => !canonicalIds.includes(id),
    );

  if (unknownRequiredReferences.length) {
    throw productionError(
      "CREATIVE_PRODUCTION_SPECIFICATION_UNKNOWN_REQUIRED_REFERENCE",
      {
        unknown_reference_asset_ids:
          unknownRequiredReferences,
        canonical_reference_asset_ids:
          canonicalIds,
      },
    );
  }

  if (
    temporal &&
    (!targetDuration || !fps)
  ) {
    throw productionError(
      "CREATIVE_PRODUCTION_SPECIFICATION_TEMPORAL_VALUES_REQUIRED",
      {
        product_type: productType,
        target_duration_seconds:
          targetDuration,
        fps,
      },
    );
  }

  const defaults = {
    product_type: productType,
    target_duration_seconds:
      targetDuration,
  };
  const deliverables = normalizeDeliverables(
    {
      ...input,
      deliverables:
        source.deliverables ||
        input.deliverables,
    },
    defaults,
  );
  const channels = unique([
    ...list(source.channels),
    ...list(input.channels),
    ...deliverables.map(
      (deliverable) => deliverable.channel,
    ),
    ![
      "",
      "multi-channel",
      "multichannel",
    ].includes(
      text(input.platform).toLowerCase(),
    )
      ? input.platform
      : null,
  ]);
  const aspectRatios = unique([
    ...list(source.aspect_ratios),
    ...list(input.aspect_ratios),
    ...list(input.aspect_ratio),
    ...deliverables.flatMap(
      (deliverable) =>
        deliverable.aspect_ratios,
    ),
  ]);
  const locales = unique([
    ...list(source.locales),
    ...list(input.locales),
    ...list(input.languages),
    ...list(input.language),
    ...deliverables.flatMap(
      (deliverable) =>
        deliverable.locales,
    ),
  ]);
  const specification = {
    version: SPECIFICATION_VERSION,
    organization_id,
    product_type: productType,
    temporal,
    visual:
      source.visual !== false &&
      VISUAL_PRODUCT_TYPES.has(productType),
    deliverables,
    target_duration_seconds:
      targetDuration,
    fps,
    expected_total_frames:
      temporal
        ? Math.round(targetDuration * fps)
        : null,
    max_shot_duration_seconds:
      maxShotDuration,
    minimum_required_shot_count:
      temporal
        ? Math.max(
            1,
            Math.ceil(
              targetDuration /
              maxShotDuration,
            ),
          )
        : 0,
    channels,
    aspect_ratios:
      aspectRatios.length
        ? aspectRatios
        : source.visual !== false &&
          VISUAL_PRODUCT_TYPES.has(productType)
          ? ["16:9"]
          : [],
    dimensions: object(
      source.dimensions ||
      input.dimensions,
    ),
    formats: unique([
      ...list(source.formats),
      ...list(input.formats),
      ...deliverables.flatMap(
        (deliverable) =>
          deliverable.formats,
      ),
    ]),
    locales,
    required_beats: list(
      source.required_beats ||
      input.required_beats ||
      brief.required_beats,
    ),
    factual_constraints: list(
      source.factual_constraints ||
      input.factual_constraints ||
      brief.factual_constraints,
    ),
    brand_constraints: list(
      source.brand_constraints ||
      input.brand_constraints ||
      brief.brand_constraints,
    ),
    canonical_reference_asset_ids:
      canonicalIds,
    required_reference_asset_ids:
      requiredReferenceIds,
    rights_policy: object(
      source.rights_policy ||
      input.rights_policy ||
      brief.rights_policy,
    ),
    quality_tier:
      text(
        source.quality_tier ||
        input.quality_tier ||
        brief.quality_tier,
      ) || "WORLD_CLASS",
    quality_policy: object(
      source.quality_policy ||
      input.quality_policy ||
      brief.quality_policy,
    ),
    budget_mode:
      text(
        source.budget_mode ||
        input.budget_mode,
      ) || "quality-first",
    budget: object(
      source.budget || input.budget,
    ),
    deadline:
      source.deadline ||
      input.deadline ||
      null,
    provider_restrictions: object(
      source.provider_restrictions ||
      input.provider_restrictions,
    ),
    approval_gates: list(
      source.approval_gates ||
      input.approval_gates,
    ),
    legal: object(
      source.legal || input.legal,
    ),
    accessibility: object(
      source.accessibility ||
      input.accessibility,
    ),
    version_matrix: list(
      source.version_matrix ||
      input.version_matrix,
    ),
    immutable_constraints: unique([
      "ORIGINAL_WORK_ONLY",
      "NO_LIVING_ARTIST_IDENTITY_OR_STYLE_IMITATION",
      "PRESERVE_DECLARED_FACTUAL_TRUTH",
      "EXACT_CANONICAL_REFERENCE_IDS_ONLY",
      ...list(source.immutable_constraints),
      ...list(input.immutable_constraints),
    ]),
  };

  return {
    specification_key:
      `cps_${compactHash(specification)}`,
    ...specification,
  };
}

export function inspectCreativePlanAgainstProductionSpecification({
  plan = {},
  specification = {},
  duration_tolerance_seconds = 0.1,
} = {}) {
  const spec = object(specification);
  const failures = [];
  const scenes = list(plan.scenes);
  let shotCount = 0;
  let plannedDuration = 0;

  if (
    spec.version !==
    SPECIFICATION_VERSION
  ) {
    failures.push(
      "PRODUCTION_SPECIFICATION_VERSION_INVALID",
    );
  }

  if (!scenes.length) {
    failures.push("SCENES_REQUIRED");
  }

  for (
    let sceneIndex = 0;
    sceneIndex < scenes.length;
    sceneIndex += 1
  ) {
    const shots = list(
      scenes[sceneIndex]?.shots,
    );

    if (!shots.length) {
      failures.push(
        `SCENE_${sceneIndex + 1}_SHOTS_REQUIRED`,
      );
    }

    for (
      let shotIndex = 0;
      shotIndex < shots.length;
      shotIndex += 1
    ) {
      shotCount += 1;
      const duration = positiveNumber(
        shots[shotIndex]?.duration_seconds ||
        shots[shotIndex]?.duration,
      );

      if (!duration) {
        failures.push(
          `SCENE_${sceneIndex + 1}_SHOT_${shotIndex + 1}_DURATION_REQUIRED`,
        );
        continue;
      }

      plannedDuration += duration;

      if (
        spec.temporal === true &&
        positiveNumber(
          spec.max_shot_duration_seconds,
        ) &&
        duration >
          Number(
            spec.max_shot_duration_seconds,
          ) +
          duration_tolerance_seconds
      ) {
        failures.push(
          `SCENE_${sceneIndex + 1}_SHOT_${shotIndex + 1}_DURATION_EXCEEDS_MAXIMUM`,
        );
      }
    }
  }

  if (
    spec.temporal === true &&
    Math.abs(
      plannedDuration -
      Number(
        spec.target_duration_seconds || 0,
      ),
    ) > duration_tolerance_seconds
  ) {
    failures.push(
      "PLANNED_DURATION_DOES_NOT_MATCH_TARGET",
    );
  }

  if (
    spec.temporal === true &&
    shotCount <
      Number(
        spec.minimum_required_shot_count || 0,
      )
  ) {
    failures.push(
      "SHOT_COUNT_BELOW_DYNAMIC_MINIMUM",
    );
  }

  const usedReferenceIds =
    referenceIdsFromPlan(plan);
  const canonicalReferenceSet = new Set(
    list(
      spec.canonical_reference_asset_ids,
    ).map(String),
  );
  const unknownReferenceIds =
    usedReferenceIds.filter(
      (id) =>
        !canonicalReferenceSet.has(id),
    );

  if (unknownReferenceIds.length) {
    failures.push(
      "PLAN_CONTAINS_UNKNOWN_REFERENCE_ASSETS",
    );
  }

  const requiredReferenceIds = list(
    spec.required_reference_asset_ids,
  ).map(String);
  const missingRequiredReferenceIds =
    requiredReferenceIds.filter(
      (id) =>
        !usedReferenceIds.includes(id),
    );

  if (missingRequiredReferenceIds.length) {
    failures.push(
      "PLAN_OMITS_REQUIRED_REFERENCE_ASSETS",
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    specification_key:
      spec.specification_key || null,
    product_type:
      spec.product_type || null,
    temporal: spec.temporal === true,
    target_duration_seconds:
      spec.target_duration_seconds || null,
    planned_duration_seconds:
      plannedDuration,
    fps: spec.fps || null,
    expected_total_frames:
      spec.expected_total_frames || null,
    shot_count: shotCount,
    minimum_required_shot_count:
      spec.minimum_required_shot_count || 0,
    max_shot_duration_seconds:
      spec.max_shot_duration_seconds || null,
    used_reference_asset_ids:
      usedReferenceIds,
    unknown_reference_asset_ids:
      unknownReferenceIds,
    missing_required_reference_asset_ids:
      missingRequiredReferenceIds,
  };
}

export function assertCreativePlanMatchesProductionSpecification(
  values = {},
) {
  const report =
    inspectCreativePlanAgainstProductionSpecification(
      values,
    );

  if (!report.passed) {
    throw productionError(
      "CREATIVE_PRODUCTION_SPECIFICATION_PLAN_MISMATCH",
      report,
    );
  }

  return report;
}

export const CreativeProductionSpecification =
  Object.freeze({
    version: SPECIFICATION_VERSION,
    compile:
      compileCreativeProductionSpecification,
    inspectPlan:
      inspectCreativePlanAgainstProductionSpecification,
    assertPlan:
      assertCreativePlanMatchesProductionSpecification,
  });
