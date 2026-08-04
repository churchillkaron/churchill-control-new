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

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .flat(Infinity)
      .map((value) => text(value))
      .filter(Boolean),
  )];
}

function uniqueObjects(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values.flat(Infinity)) {
    if (!value) continue;
    const key = typeof value === "object"
      ? JSON.stringify(value)
      : text(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function observationLabels(values = []) {
  return list(values).flatMap((value) => {
    if (typeof value === "string" || typeof value === "number") {
      return [text(value)];
    }
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
    ].map(text).filter(Boolean);
  });
}

function firstText(values = []) {
  return values.map(text).find(Boolean) || "";
}

function meaningfulText(value) {
  const source = text(value)
    .replace(/\.(jpg|jpeg|png|webp|heic|avif|mp4|mov|m4v|webm|mkv)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!source) return "";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(source)) return "";
  if (/^(img|dsc|photo|video|file|asset|image|clip)[ -]?\d+$/i.test(source)) return "";
  if (/^\d+$/.test(source)) return "";
  return source;
}

function semanticEvidence(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(
    analysis.intelligence ||
    asset.intelligence ||
    asset.metadata?.intelligence,
  );
  const identity = object(analysis.identity || intelligence.identity);

  const people = uniqueObjects([
    analysis.detected_people,
    analysis.people,
    analysis.persons,
    analysis.subjects,
    intelligence.detected_people,
    intelligence.people,
    intelligence.persons,
    intelligence.subjects,
    asset.metadata?.people,
  ]);
  const products = uniqueObjects([
    analysis.detected_products,
    analysis.products,
    analysis.objects,
    intelligence.detected_products,
    intelligence.products,
    intelligence.objects,
    asset.metadata?.products,
  ]);
  const locations = uniqueObjects([
    analysis.detected_locations,
    analysis.locations,
    intelligence.detected_locations,
    intelligence.locations,
    intelligence.venues,
    asset.metadata?.locations,
  ]);

  const strings = uniqueStrings([
    meaningfulText(asset.name),
    meaningfulText(asset.title),
    meaningfulText(asset.file_name),
    meaningfulText(asset.metadata?.original_file_name),
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
    asset.tags,
    analysis.tags,
    intelligence.tags,
    intelligence.labels,
    intelligence.categories,
    observationLabels(people),
    observationLabels(products),
    observationLabels(locations),
  ]);

  return {
    description: firstText([
      analysis.description,
      intelligence.description,
      intelligence.scene_description,
      intelligence.content_description,
      asset.description,
    ]),
    summary: firstText([
      analysis.summary,
      intelligence.summary,
      intelligence.caption,
      analysis.caption,
    ]),
    tags: uniqueStrings([
      asset.tags,
      analysis.tags,
      intelligence.tags,
      intelligence.labels,
      intelligence.categories,
    ]),
    people,
    products,
    locations,
    strings,
    substantive: strings.some((value) => meaningfulText(value).length >= 3),
  };
}

export function enrichCreativeAssetForUniversalIntelligence(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(
    analysis.intelligence ||
    asset.intelligence ||
    asset.metadata?.intelligence,
  );
  const vision = object(analysis.vision || intelligence.vision);
  const evidence = semanticEvidence(asset);

  const faces = uniqueObjects([
    analysis.faces,
    analysis.face_annotations,
    analysis.faceAnnotations,
    vision.faces,
    intelligence.faces,
    intelligence.face_annotations,
    asset.metadata?.faces,
  ]);

  return {
    ...asset,
    analysis: {
      ...analysis,
      intelligence: {
        ...intelligence,
      },
      description: analysis.description || evidence.description || undefined,
      summary: analysis.summary || evidence.summary || undefined,
      tags: uniqueStrings([analysis.tags, evidence.tags]),
      identity: {
        ...object(intelligence.identity),
        ...object(analysis.identity),
      },
      detected_people: uniqueObjects([
        analysis.detected_people,
        evidence.people,
      ]),
      detected_products: uniqueObjects([
        analysis.detected_products,
        evidence.products,
      ]),
      detected_locations: uniqueObjects([
        analysis.detected_locations,
        evidence.locations,
      ]),
      faces,
      vision: {
        ...vision,
        faces: list(vision.faces).length ? vision.faces : faces,
      },
    },
  };
}

export function enrichCreativeAssetsForUniversalIntelligence(assets = []) {
  return list(assets).map(enrichCreativeAssetForUniversalIntelligence);
}

const SEMANTIC_ROLES = new Set([
  "PERSON_IDENTITY_REFERENCE",
  "PRODUCT_IDENTITY_REFERENCE",
  "BRAND_MARK_REFERENCE",
  "LOCATION_REFERENCE",
  "STYLE_REFERENCE",
  "SUBJECT_REFERENCE",
]);

function visualKind(kind) {
  return ["IMAGE", "VIDEO"].includes(text(kind).toUpperCase());
}

function hasSemanticRole(roles = []) {
  return list(roles).some((role) => SEMANTIC_ROLES.has(text(role).toUpperCase()));
}

export function enforceUniversalAssetSemanticCoverage(
  result = {},
  assets = [],
) {
  const assetById = new Map(
    list(assets).map((asset) => [text(asset.id || asset.asset_id), asset]),
  );

  const manifest = list(result.asset_manifest).map((entry) => {
    const id = text(entry.asset_id);
    const asset = assetById.get(id) || {};
    const evidence = semanticEvidence(asset);
    const roles = uniqueStrings(entry.roles).map((role) => role.toUpperCase());

    if (visualKind(entry.kind) && !hasSemanticRole(roles) && evidence.substantive) {
      roles.push("SUBJECT_REFERENCE");
    }

    return {
      ...entry,
      roles: uniqueStrings(roles),
      semantic_evidence: {
        substantive: evidence.substantive,
        description: evidence.description || null,
        summary: evidence.summary || null,
        tags: evidence.tags,
        observed_people_count: evidence.people.length,
        observed_product_count: evidence.products.length,
        observed_location_count: evidence.locations.length,
        evidence_excerpt: evidence.strings.slice(0, 8),
      },
    };
  });

  const uncoveredVisualAssets = manifest
    .filter((entry) => visualKind(entry.kind))
    .filter((entry) => !hasSemanticRole(entry.roles));

  const blockers = uniqueStrings([
    result.blocking_issues,
    uncoveredVisualAssets.map((entry) =>
      `VISUAL_ASSET_SEMANTIC_CLASSIFICATION_REQUIRED:${entry.asset_id}`,
    ),
  ]);

  const subjectProfiles = manifest
    .filter((entry) => list(entry.roles).includes("SUBJECT_REFERENCE"))
    .map((entry, index) => ({
      id: `subject-profile-${index + 1}`,
      subject_type: "SUBJECT",
      reference_asset_ids: [entry.asset_id],
      semantic_evidence: entry.semantic_evidence,
      verification_required: true,
      background_reference_policy: "USE_ONLY_WHEN_EXPLICITLY_ASSIGNED",
    }));

  const audioSources = manifest
    .filter((entry) => list(entry.roles).includes("AUDIO_SOURCE"))
    .map((entry) => ({
      asset_id: entry.asset_id,
      kind: entry.kind,
      roles: entry.roles,
      semantic_evidence: entry.semantic_evidence,
    }));

  return {
    ...result,
    asset_manifest: manifest,
    subject_profiles: subjectProfiles,
    audio_sources: audioSources,
    semantic_coverage: {
      contract: "UNIVERSAL_ASSET_SEMANTIC_COVERAGE_V1",
      selected_asset_count: manifest.length,
      visual_asset_count: manifest.filter((entry) => visualKind(entry.kind)).length,
      semantically_covered_visual_asset_count: manifest
        .filter((entry) => visualKind(entry.kind) && hasSemanticRole(entry.roles))
        .length,
      uncovered_visual_asset_ids: uncoveredVisualAssets.map((entry) => entry.asset_id),
      nested_intelligence_evidence_enabled: true,
      arbitrary_subject_reference_supported: true,
    },
    blocking_issues: blockers,
    passed: blockers.length === 0,
  };
}

export const UniversalAssetSemanticEvidencePlanner = Object.freeze({
  enrichAsset: enrichCreativeAssetForUniversalIntelligence,
  enrichAssets: enrichCreativeAssetsForUniversalIntelligence,
  enforceCoverage: enforceUniversalAssetSemanticCoverage,
});
