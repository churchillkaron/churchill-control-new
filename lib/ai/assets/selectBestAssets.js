function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function includesAny(source, terms) {
  const text = normalize(source);
  return terms.some((term) => term && text.includes(term));
}

function assetText(asset = {}) {
  const analysis = asset.analysis || {};
  return normalize([
    asset.name,
    asset.title,
    asset.description,
    asset.asset_type,
    analysis.description,
    analysis.sceneType,
    analysis.scene_type,
    analysis.mood,
    analysis.visual_style,
    analysis.lighting,
    ...list(asset.tags),
    ...list(analysis.tags),
    ...list(analysis.objects),
    ...list(analysis.activities),
    ...list(analysis.environments),
    ...list(analysis.application_contexts),
    ...list(analysis.recommended_uses),
    ...list(analysis.commercial_use_cases),
    ...list(analysis.campaign_fit),
  ].filter(Boolean).join(" "));
}

function identityText(asset = {}) {
  const identity = asset.analysis?.identity || {};
  return normalize([
    identity.name,
    identity.business_role,
    identity.hospitality_role,
    identity.subject_id,
    identity.confirmed_name,
    identity.reusable_identity_prompt,
  ].filter(Boolean).join(" "));
}

function hardReject(asset = {}, requirements = {}) {
  const url = asset.file_url || asset.image_url || asset.thumbnail_url || asset.url;
  if (!asset || !asset.id || !url) return "missing_asset_or_url";
  if (asset.archived) return "archived";

  const analysis = asset.analysis || {};
  const risks = list(analysis.visual_risks).map(normalize);
  const blocked = list(requirements.mustAvoid).map(normalize);
  const text = `${assetText(asset)} ${risks.join(" ")}`;
  if (blocked.some((term) => term && text.includes(term))) return "blocked_content";

  const minimumQuality = Number(requirements.minimumQuality || 0);
  const quality = Number(
    analysis.quality_score ??
    analysis.overall_score ??
    asset.score ??
    asset.performance_score ??
    0
  );
  if (minimumQuality > 0 && quality < minimumQuality) return "quality_below_threshold";

  const requiredIdentity = normalize(requirements.identity || requirements.person || "");
  if (requiredIdentity && !identityText(asset).includes(requiredIdentity) && !assetText(asset).includes(requiredIdentity)) {
    return "required_identity_missing";
  }

  return null;
}

function scoreAsset(asset = {}, requirements = {}) {
  const analysis = asset.analysis || {};
  const text = assetText(asset);
  let score = 0;
  const reasons = [];

  const desiredTerms = [
    requirements.mood,
    requirements.sceneType,
    requirements.subject,
    requirements.action,
    requirements.location,
    requirements.role,
    ...(requirements.keywords || []),
  ].map(normalize).filter(Boolean);

  for (const term of desiredTerms) {
    if (text.includes(term)) {
      score += 14;
      reasons.push(`matches:${term}`);
    }
  }

  const mood = normalize(requirements.mood);
  if (mood && normalize(analysis.mood).includes(mood)) {
    score += 18;
    reasons.push("mood_match");
  }

  const sceneType = normalize(requirements.sceneType);
  if (sceneType && includesAny([analysis.sceneType, analysis.scene_type].join(" "), [sceneType])) {
    score += 18;
    reasons.push("scene_match");
  }

  const quality = Number(
    analysis.quality_score ??
    analysis.overall_score ??
    asset.score ??
    0
  );
  score += Math.max(0, Math.min(100, quality)) * 0.25;
  if (quality > 0) reasons.push(`quality:${quality}`);

  const confidence = Number(analysis.asset_confidence || 0);
  score += Math.max(0, Math.min(100, confidence)) * 0.1;

  const brand = Number(analysis.brand_alignment_score ?? analysis.brand_relevance_score ?? 0);
  score += Math.max(0, Math.min(100, brand)) * 0.15;

  const performance = Number(asset.performance_score || 0);
  score += Math.max(0, performance) * 0.05;

  const risks = list(analysis.visual_risks);
  score -= risks.length * 8;
  if (risks.length) reasons.push(`risks:${risks.length}`);

  return { score, reasons };
}

export function rankBestAssets({
  assets = [],
  mood = null,
  sceneType = null,
  limit = 4,
  requirements = {},
} = {}) {
  const normalizedRequirements = {
    ...requirements,
    mood: requirements.mood || mood,
    sceneType: requirements.sceneType || sceneType,
  };

  return assets
    .filter(Boolean)
    .map((asset) => {
      const rejection = hardReject(asset, normalizedRequirements);
      if (rejection) {
        return { asset, score: -Infinity, rejected: true, rejection, reasons: [] };
      }
      const ranked = scoreAsset(asset, normalizedRequirements);
      return { asset, ...ranked, rejected: false, rejection: null };
    })
    .filter((entry) => !entry.rejected)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit));
}

export function selectBestAssets(input = {}) {
  return rankBestAssets(input).map((entry) => ({
    ...entry.asset,
    selection_score: entry.score,
    selection_reasons: entry.reasons,
  }));
}
