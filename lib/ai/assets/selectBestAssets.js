function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function flattenValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenValues);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenValues);
  }

  return list(value);
}

function tokens(value) {
  return [...new Set(
    flattenValues(value)
      .flatMap((item) => normalize(item).split(/\s+/))
      .filter(Boolean),
  )];
}

function numericSignals(...values) {
  return values
    .flatMap(list)
    .map(Number)
    .filter(Number.isFinite)
    .map((value) => Math.max(0, Math.min(100, value)));
}

function average(values = []) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assetDocument(asset = {}) {
  const analysis = asset.analysis || {};
  const intelligence = asset.intelligence || {};
  const identity = analysis.identity || intelligence.identity || {};

  return normalize([
    asset.name,
    asset.title,
    asset.description,
    asset.asset_type,
    asset.media_type,
    asset.mime_type,
    asset.source,
    ...flattenValues(asset.tags),
    ...flattenValues(analysis),
    ...flattenValues(intelligence),
    ...flattenValues(identity),
    ...flattenValues(asset.metadata),
  ].filter(Boolean).join(" "));
}

function requirementDocument(requirements = {}) {
  const ignored = new Set([
    "mustavoid",
    "must_avoid",
    "forbidden",
    "minimumquality",
    "minimum_quality",
    "requiredidentity",
    "required_identity",
    "identity",
    "person",
    "policy",
    "weights",
    "maxassets",
    "max_assets",
  ]);

  return Object.entries(requirements)
    .filter(([key]) => !ignored.has(normalize(key).replace(/\s+/g, "")))
    .flatMap(([, value]) => flattenValues(value));
}

function mediaUrl(asset = {}) {
  return (
    asset.file_url ||
    asset.fileUrl ||
    asset.video_url ||
    asset.videoUrl ||
    asset.audio_url ||
    asset.audioUrl ||
    asset.image_url ||
    asset.imageUrl ||
    asset.thumbnail_url ||
    asset.thumbnailUrl ||
    asset.url ||
    null
  );
}

function mediaKind(asset = {}) {
  return normalize(
    asset.media_kind ||
    asset.mediaKind ||
    asset.media_type ||
    asset.mediaType ||
    asset.asset_type ||
    asset.type ||
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.metadata?.media_kind ||
    "",
  );
}

function hardReject(asset = {}, requirements = {}) {
  if (!asset || !asset.id || !mediaUrl(asset)) {
    return "missing_asset_or_url";
  }

  if (asset.archived || asset.status === "ARCHIVED") {
    return "archived";
  }

  const analysis = asset.analysis || {};
  const intelligence = asset.intelligence || {};
  const document = assetDocument(asset);
  const blockedTerms = tokens([
    requirements.mustAvoid,
    requirements.must_avoid,
    requirements.forbidden,
  ]);

  if (blockedTerms.some((term) => document.includes(term))) {
    return "blocked_content";
  }

  const quality = average(numericSignals(
    analysis.quality_score,
    analysis.overall_score,
    intelligence.quality_score,
    asset.quality_score,
  ));
  const minimumQuality = Number(
    requirements.minimumQuality ??
    requirements.minimum_quality,
  );

  if (
    Number.isFinite(minimumQuality) &&
    quality !== null &&
    quality < minimumQuality
  ) {
    return "quality_below_threshold";
  }

  const requiredIdentityTokens = tokens([
    requirements.requiredIdentity,
    requirements.required_identity,
    requirements.identity,
    requirements.person,
  ]);

  if (
    requiredIdentityTokens.length &&
    !requiredIdentityTokens.every((term) => document.includes(term))
  ) {
    return "required_identity_missing";
  }

  const allowedMedia = tokens(
    requirements.mediaKinds ||
    requirements.media_kinds ||
    requirements.mediaKind ||
    requirements.media_kind,
  );

  if (
    allowedMedia.length &&
    !allowedMedia.some((term) => mediaKind(asset).includes(term))
  ) {
    return "media_kind_mismatch";
  }

  const safetyStatus = normalize(
    intelligence.safety_status ||
    analysis.safety_status ||
    asset.safety_status ||
    "",
  );
  const allowedSafetyStatuses = tokens(
    requirements.allowedSafetyStatuses ||
    requirements.allowed_safety_statuses,
  );

  if (
    safetyStatus &&
    allowedSafetyStatuses.length &&
    !allowedSafetyStatuses.includes(safetyStatus)
  ) {
    return "safety_status_not_allowed";
  }

  return null;
}

function weightedAverage(signals = {}, weights = {}) {
  const active = Object.entries(signals)
    .filter(([, value]) => Number.isFinite(value));

  if (!active.length) return 0;

  const suppliedWeights = active
    .map(([name]) => Number(weights?.[name]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const useSuppliedWeights = suppliedWeights.length > 0;

  let total = 0;
  let totalWeight = 0;

  for (const [name, value] of active) {
    const weight = useSuppliedWeights
      ? Math.max(0, Number(weights?.[name]) || 0)
      : 1;

    if (!weight) continue;
    total += value * weight;
    totalWeight += weight;
  }

  return totalWeight ? total / totalWeight : 0;
}

function scoreAsset(asset = {}, requirements = {}) {
  const analysis = asset.analysis || {};
  const intelligence = asset.intelligence || {};
  const document = assetDocument(asset);
  const requiredTokens = tokens(requirementDocument(requirements));
  const matchedTokens = requiredTokens.filter((term) => document.includes(term));
  const semanticCoverage = requiredTokens.length
    ? (matchedTokens.length / requiredTokens.length) * 100
    : null;

  const quality = average(numericSignals(
    analysis.quality_score,
    analysis.overall_score,
    intelligence.quality_score,
    asset.quality_score,
  ));
  const confidence = average(numericSignals(
    analysis.asset_confidence,
    analysis.confidence,
    intelligence.confidence,
    asset.confidence,
  ));
  const brandFit = average(numericSignals(
    analysis.brand_alignment_score,
    analysis.brand_relevance_score,
    intelligence.brand_match_score,
    asset.brand_match_score,
  ));
  const performance = requirements.policy?.includePerformance
    ? average(numericSignals(
        asset.performance_score,
        asset.last_performance_score,
      ))
    : null;

  const riskValues = list(
    analysis.visual_risks ||
    intelligence.risks ||
    asset.risks,
  );
  const riskPenalty = riskValues.length
    ? Math.min(100, (riskValues.length / Math.max(1, tokens(document).length)) * 100)
    : 0;

  const score = weightedAverage(
    {
      semantic: semanticCoverage,
      quality,
      confidence,
      brand: brandFit,
      performance,
      safety: 100 - riskPenalty,
    },
    requirements.policy?.weights || {},
  );

  return {
    score,
    reasons: {
      matched_requirements: matchedTokens,
      missing_requirements: requiredTokens.filter(
        (term) => !matchedTokens.includes(term),
      ),
      signals: {
        semantic: semanticCoverage,
        quality,
        confidence,
        brand: brandFit,
        performance,
        safety: 100 - riskPenalty,
      },
      risks: riskValues,
    },
  };
}

export function rankBestAssets({
  assets = [],
  mood = null,
  sceneType = null,
  limit = null,
  requirements = {},
} = {}) {
  const normalizedRequirements = {
    ...requirements,
    mood: requirements.mood ?? mood,
    sceneType: requirements.sceneType ?? requirements.scene_type ?? sceneType,
  };
  const requestedLimit = Number(
    limit ??
    normalizedRequirements.maxAssets ??
    normalizedRequirements.max_assets ??
    assets.length,
  );
  const safeLimit = Number.isFinite(requestedLimit)
    ? Math.max(0, requestedLimit)
    : assets.length;

  return assets
    .filter(Boolean)
    .map((asset) => {
      const rejection = hardReject(asset, normalizedRequirements);
      if (rejection) {
        return {
          asset,
          score: Number.NEGATIVE_INFINITY,
          rejected: true,
          rejection,
          reasons: null,
        };
      }

      return {
        asset,
        ...scoreAsset(asset, normalizedRequirements),
        rejected: false,
        rejection: null,
      };
    })
    .filter((entry) => !entry.rejected)
    .sort((left, right) => right.score - left.score)
    .slice(0, safeLimit);
}

export function selectBestAssets(input = {}) {
  return rankBestAssets(input).map((entry) => ({
    ...entry.asset,
    selection_score: entry.score,
    selection_reasons: entry.reasons,
  }));
}
