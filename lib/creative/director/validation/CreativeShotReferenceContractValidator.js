export const CREATIVE_SHOT_REFERENCE_ROLES = Object.freeze([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "BRAND_REFERENCE",
  "SUBJECT_REFERENCE",
  "AUDIO_REFERENCE",
]);

const REFERENCE_ROLE_SET = new Set(CREATIVE_SHOT_REFERENCE_ROLES);

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

function push(failures, code, path, message, evidence = null) {
  failures.push({ code, path, message, evidence });
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

function evidenceText(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(analysis.intelligence);
  const identity = object(analysis.identity || intelligence.identity);
  const observations = [
    ...list(analysis.detected_people || analysis.people || analysis.persons || analysis.subjects),
    ...list(analysis.detected_products || analysis.products || analysis.objects),
    ...list(analysis.detected_locations || analysis.locations),
    ...list(intelligence.detected_people || intelligence.people || intelligence.persons || intelligence.subjects),
    ...list(intelligence.detected_products || intelligence.products || intelligence.objects),
    ...list(intelligence.detected_locations || intelligence.locations || intelligence.venues),
  ].flatMap((value) => {
    if (typeof value === "string" || typeof value === "number") return [value];
    return [
      value?.name,
      value?.label,
      value?.title,
      value?.description,
      value?.summary,
      value?.category,
      value?.type,
      value?.role,
      value?.location,
      value?.subject,
    ];
  });

  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    analysis.description,
    analysis.summary,
    analysis.caption,
    analysis.scene_description,
    intelligence.description,
    intelligence.summary,
    intelligence.caption,
    intelligence.scene_description,
    intelligence.content_description,
    identity.name,
    identity.label,
    ...list(asset.tags),
    ...list(analysis.tags),
    ...list(intelligence.tags),
    ...list(intelligence.labels),
    ...list(intelligence.categories),
    ...observations,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function personEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(analysis.intelligence);
  return Boolean(
    list(analysis.faces || analysis.face_annotations || analysis.faceAnnotations || analysis.vision?.faces).length ||
    list(analysis.detected_people || analysis.people || analysis.persons || analysis.subjects).length ||
    list(intelligence.detected_people || intelligence.people || intelligence.persons || intelligence.subjects).length ||
    Object.keys(object(analysis.identity || intelligence.identity)).length ||
    /\b(face|portrait|person|people|performer|artist|singer|actor|actress|model|dancer|staff|employee|founder|owner|woman|man|girl|boy)\b/.test(evidenceText(asset))
  );
}

function productEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(analysis.intelligence);
  return Boolean(
    list(analysis.detected_products || analysis.products || analysis.objects).length ||
    list(intelligence.detected_products || intelligence.products || intelligence.objects).length ||
    /\b(product|bottle|package|dish|food|drink|vehicle|equipment|furniture|menu item|merchandise)\b/.test(evidenceText(asset))
  );
}

function locationEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(analysis.intelligence);
  return Boolean(
    list(analysis.detected_locations || analysis.locations).length ||
    list(intelligence.detected_locations || intelligence.locations || intelligence.venues).length ||
    /\b(location|venue|building|interior|exterior|restaurant|bar|hotel|office|factory|store|shop|room|landscape|street|stage|beach|pool)\b/.test(evidenceText(asset))
  );
}

function brandEvidence(asset = {}) {
  const type = text(asset.asset_type || asset.type).toLowerCase();
  return Boolean(
    /logo|brand|wordmark|brandmark/.test(type) ||
    /\b(logo|wordmark|brand mark|brandmark|trademark|signage)\b/.test(evidenceText(asset))
  );
}

function roleSupported(role, asset = {}) {
  const kind = assetKind(asset);
  const visual = ["IMAGE", "VIDEO"].includes(kind);

  if (role === "PRIMARY_SOURCE") return visual;
  if (role === "IDENTITY_REFERENCE") return visual && personEvidence(asset);
  if (role === "LOCATION_REFERENCE") return visual && locationEvidence(asset);
  if (role === "PRODUCT_REFERENCE") return visual && productEvidence(asset);
  if (role === "BRAND_REFERENCE") return ["IMAGE", "VIDEO", "DOCUMENT"].includes(kind) && brandEvidence(asset);
  if (role === "AUDIO_REFERENCE") return kind === "AUDIO";
  if (["CONTINUITY_REFERENCE", "STYLE_REFERENCE", "SUBJECT_REFERENCE"].includes(role)) {
    return visual;
  }
  return false;
}

function sourceRequired(shot = {}, references = []) {
  const medium = text(shot.medium).toUpperCase().replaceAll("_", "-");
  const visualReferenceRoles = new Set([
    "PRIMARY_SOURCE",
    "IDENTITY_REFERENCE",
    "LOCATION_REFERENCE",
    "CONTINUITY_REFERENCE",
    "PRODUCT_REFERENCE",
    "STYLE_REFERENCE",
    "SUBJECT_REFERENCE",
  ]);
  const visualReferences = list(references).filter((reference) =>
    visualReferenceRoles.has(text(reference?.role).toUpperCase()),
  );
  return Boolean(
    visualReferences.length ||
    medium === "LIVE-ASSET" ||
    medium === "ASSET-LED-MOTION" ||
    shot.source_required === true ||
    shot.generation?.source_required === true
  );
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

function findLegacyRepairMarkers(value, path = "plan", markers = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findLegacyRepairMarkers(item, `${path}.${index}`, markers),
    );
    return markers;
  }
  if (!value || typeof value !== "object") return markers;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("-", "_");
    if (normalized === "repair_version" || normalized === "legacy_repair_version") {
      markers.push({ path: `${path}.${key}`, value: child });
    }
    findLegacyRepairMarkers(child, `${path}.${key}`, markers);
  }
  return markers;
}

function validateShot({ shot, sceneIndex, shotIndex, assetById, failures }) {
  const base = `scenes.${sceneIndex}.shots.${shotIndex}`;
  const typed = list(shot.reference_assets);
  const legacyIds = list(shot.reference_asset_ids).map(assetId).filter(Boolean);

  if (legacyIds.length) {
    push(
      failures,
      "LEGACY_REFERENCE_IDS_REJECTED",
      `${base}.reference_asset_ids`,
      "Raw reference_asset_ids are context-only legacy data and must be empty in a fresh direction",
      legacyIds,
    );
  }

  const primitiveReferences = typed.filter((entry) =>
    typeof entry === "string" || typeof entry === "number",
  );
  if (primitiveReferences.length) {
    push(
      failures,
      "UNTYPED_SHOT_REFERENCE_REJECTED",
      `${base}.reference_assets`,
      "Every shot reference must be an object with asset_id and an explicit typed role",
      primitiveReferences,
    );
  }

  const rows = typed
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      raw: entry,
      asset_id: assetId(entry),
      role: text(entry.role || entry.asset_role || entry.binding_role).toUpperCase(),
    }));

  const rowIds = rows.map((row) => row.asset_id).filter(Boolean);
  if (new Set(rowIds).size !== rowIds.length) {
    push(
      failures,
      "DUPLICATE_SHOT_REFERENCE_ASSET",
      `${base}.reference_assets`,
      "A shot may reference each asset only once; use one explicit role per asset",
      rowIds,
    );
  }

  for (const [referenceIndex, row] of rows.entries()) {
    const path = `${base}.reference_assets.${referenceIndex}`;
    if (!row.asset_id) {
      push(failures, "SHOT_REFERENCE_ASSET_ID_REQUIRED", `${path}.asset_id`, "asset_id is required");
      continue;
    }
    if (!REFERENCE_ROLE_SET.has(row.role)) {
      push(
        failures,
        "SHOT_REFERENCE_ROLE_INVALID",
        `${path}.role`,
        `Reference role must be ${CREATIVE_SHOT_REFERENCE_ROLES.join(", ")}`,
        row.role,
      );
      continue;
    }

    const asset = assetById.get(row.asset_id);
    if (!asset) {
      push(
        failures,
        "SHOT_REFERENCE_ASSET_UNKNOWN",
        `${path}.asset_id`,
        `Reference asset ${row.asset_id} is not in the selected project asset set`,
        row.asset_id,
      );
      continue;
    }

    if (!roleSupported(row.role, asset)) {
      push(
        failures,
        "SHOT_REFERENCE_ROLE_UNSUPPORTED_BY_ASSET",
        `${path}.role`,
        `Asset ${row.asset_id} does not contain evidence supporting role ${row.role}`,
        {
          asset_id: row.asset_id,
          role: row.role,
          asset_kind: assetKind(asset),
        },
      );
    }
  }

  const primaryRows = rows.filter((row) => row.role === "PRIMARY_SOURCE");
  const required = sourceRequired(shot, rows);
  if (required && primaryRows.length !== 1) {
    push(
      failures,
      "EXACTLY_ONE_PRIMARY_SOURCE_REQUIRED",
      `${base}.reference_assets`,
      "Every source-bearing shot must declare exactly one PRIMARY_SOURCE",
      primaryRows.map((row) => row.asset_id),
    );
  }
  if (!required && primaryRows.length) {
    push(
      failures,
      "SYNTHETIC_SHOT_PRIMARY_SOURCE_FORBIDDEN",
      `${base}.reference_assets`,
      "A source-free synthetic shot must not declare a primary source",
      primaryRows.map((row) => row.asset_id),
    );
  }

  const explicit = explicitPrimaryIds(shot);
  if (explicit.length > 1) {
    push(
      failures,
      "PRIMARY_SOURCE_FIELDS_AMBIGUOUS",
      `${base}.primary_source_asset_id`,
      "All explicit primary-source fields must resolve to one asset",
      explicit,
    );
  }
  if (explicit.length === 1) {
    if (primaryRows.length !== 1 || primaryRows[0].asset_id !== explicit[0]) {
      push(
        failures,
        "PRIMARY_SOURCE_FIELD_MISMATCH",
        `${base}.primary_source_asset_id`,
        "Explicit primary_source_asset_id must match the PRIMARY_SOURCE reference row",
        {
          explicit: explicit[0],
          typed_primary: primaryRows[0]?.asset_id || null,
        },
      );
    }
  }

  const providerParameters = object(shot.generation?.provider_parameters);
  for (const field of ["source_asset_ids", "reference_asset_ids", "asset_ids", "image_urls", "reference_images"]) {
    if (list(providerParameters[field]).length) {
      push(
        failures,
        "PROVIDER_MULTI_SOURCE_FIELDS_FORBIDDEN",
        `${base}.generation.provider_parameters.${field}`,
        "Provider source arrays are forbidden; dispatch may expose only the canonical primary source",
        providerParameters[field],
      );
    }
  }

  const legacyAssets = list(shot.assets).filter((entry) =>
    typeof entry === "string" || typeof entry === "number",
  );
  if (legacyAssets.length) {
    push(
      failures,
      "UNTYPED_SHOT_ASSETS_REJECTED",
      `${base}.assets`,
      "Raw shot.assets values cannot establish source authority",
      legacyAssets,
    );
  }
}

export function validateCreativeShotReferenceContract({ plan, assets = [] } = {}) {
  const failures = [];
  const assetById = new Map(
    list(assets)
      .map((asset) => [assetId(asset), asset])
      .filter(([id]) => Boolean(id)),
  );

  const repairMarkers = findLegacyRepairMarkers(plan);
  for (const marker of repairMarkers) {
    push(
      failures,
      "LEGACY_REPAIR_VERSION_REJECTED",
      marker.path,
      "Fresh creative direction must not contain repair_version metadata from a prior plan",
      marker.value,
    );
  }

  list(plan?.scenes).forEach((scene, sceneIndex) => {
    list(scene?.shots).forEach((shot, shotIndex) => {
      validateShot({ shot, sceneIndex, shotIndex, assetById, failures });
    });
  });

  return {
    contract: "CREATIVE_SHOT_REFERENCE_CONTRACT_V1",
    passed: failures.length === 0,
    scene_count: list(plan?.scenes).length,
    shot_count: list(plan?.scenes).reduce(
      (sum, scene) => sum + list(scene?.shots).length,
      0,
    ),
    failures,
  };
}

export function assertCreativeShotReferenceContract(input = {}) {
  const validation = validateCreativeShotReferenceContract(input);
  if (!validation.passed) {
    const codes = [...new Set(validation.failures.map((item) => item.code))];
    const error = new Error(
      `CREATIVE_SHOT_REFERENCE_CONTRACT_INVALID:${codes.join(",")}`,
    );
    error.validation = validation;
    throw error;
  }
  return validation;
}
