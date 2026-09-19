const CONTRACT = "CREATIVE_VISUAL_PRODUCTION_ROUTE_V1";

export const CREATIVE_VISUAL_PRODUCTION_MODES = Object.freeze({
  DIRECT_AUTHENTIC: "DIRECT_AUTHENTIC",
  ENHANCE_AUTHENTIC: "ENHANCE_AUTHENTIC",
  CINEMATIC_RECONSTRUCTION: "CINEMATIC_RECONSTRUCTION",
  ORIGINAL_WORLD_BUILDING: "ORIGINAL_WORLD_BUILDING",
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  if (typeof value === "boolean" || value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolean(value) {
  return value === true;
}

function score(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return Math.max(0, Math.min(100, number));
  }
  return null;
}

function assetQuality(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(asset.intelligence);
  const metadata = object(asset.metadata);
  return score(
    analysis.quality_score,
    analysis.quality?.score,
    intelligence.quality_score,
    metadata.quality_score,
  );
}

function assetComposition(asset = {}) {
  const analysis = object(asset.analysis);
  const intelligence = object(asset.intelligence);
  return score(
    analysis.composition_score,
    analysis.composition?.score,
    intelligence.composition_score,
  );
}

function assetSemanticFit(asset = {}, binding = {}) {
  const analysis = object(asset.analysis);
  return score(
    binding.score,
    binding.semantic_score,
    binding.confidence_score,
    binding.confidence,
    analysis.semantic_score,
    analysis.relevance_score,
  );
}

function productionReferenceFitness(asset = {}) {
  const analysis = object(asset.analysis);
  const metadata = object(asset.metadata);
  const fit = object(analysis.production_reference_fitness || metadata.production_reference_fitness);
  return {
    production_use_allowed: fit.production_use_allowed !== false && analysis.production_use_allowed !== false && metadata.production_use_allowed !== false,
    production_use_score: score(fit.production_use_score, analysis.production_use_score, metadata.production_use_score),
    cinematic_usefulness_score: score(fit.cinematic_usefulness_score, analysis.cinematic_usefulness_score),
    behavioral_authenticity_score: score(fit.behavioral_authenticity_score, analysis.behavioral_authenticity_score),
    environmental_density_score: score(fit.environmental_density_score, analysis.environmental_density_score),
    scene_state_fit_score: score(fit.scene_state_fit_score, analysis.scene_state_fit_score),
    truth_reference_only: boolean(fit.truth_reference_only) || boolean(analysis.truth_reference_only) || boolean(metadata.truth_reference_only),
    blockers: Array.isArray(fit.blockers) ? fit.blockers.filter(Boolean) : [],
  };
}

function weakProductionReference(fitness = {}) {
  if (fitness.production_use_allowed === false || fitness.truth_reference_only === true) return true;
  const thresholds = [
    [fitness.production_use_score, 80],
    [fitness.cinematic_usefulness_score, 75],
    [fitness.behavioral_authenticity_score, 75],
    [fitness.environmental_density_score, 65],
    [fitness.scene_state_fit_score, 80],
  ];
  return thresholds.some(([value, minimum]) => value !== null && value < minimum);
}

function provenance(asset = {}) {
  return object(
    asset.metadata?.brand_fidelity_asset ||
    asset.brand_fidelity_asset ||
    asset.provenance,
  );
}

function authentic(asset = {}) {
  return provenance(asset).classification === "AUTHENTIC_UPLOAD";
}

function trustedDerived(asset = {}) {
  return provenance(asset).classification === "TRUSTED_DERIVED";
}

function directUseBlocked(asset = {}) {
  const analysis = object(asset.analysis);
  const metadata = object(asset.metadata);
  return boolean(asset.direct_use_blocked) ||
    boolean(analysis.direct_use_blocked) ||
    boolean(metadata.direct_use_blocked) ||
    text(asset.use_mode).toUpperCase() === "REFERENCE_ONLY" ||
    text(analysis.use_mode).toUpperCase() === "REFERENCE_ONLY" ||
    text(metadata.use_mode).toUpperCase() === "REFERENCE_ONLY";
}

function storyRequiresReconstruction(shot = {}) {
  const generation = object(shot.generation);
  const providerParameters = object(generation.provider_parameters);
  const productionDesign = object(shot.production_design);
  const sourceMode = text(generation.output_spec?.source_mode).toLowerCase();
  return boolean(providerParameters.force_reconstruction) ||
    boolean(providerParameters.new_environment_required) ||
    boolean(productionDesign.new_environment_required) ||
    ["text_to_video", "world_building"].includes(sourceMode);
}

function routeFor(mode, evidence = {}) {
  const keyframeRequired = [
    CREATIVE_VISUAL_PRODUCTION_MODES.CINEMATIC_RECONSTRUCTION,
    CREATIVE_VISUAL_PRODUCTION_MODES.ORIGINAL_WORLD_BUILDING,
  ].includes(mode);
  const enhancementRequired =
    mode === CREATIVE_VISUAL_PRODUCTION_MODES.ENHANCE_AUTHENTIC;

  return {
    contract: CONTRACT,
    mode,
    principle: "LEAST_DESTRUCTIVE_TRANSFORMATION",
    paid_generation_authorized: false,
    source_truth_must_be_preserved: mode !== CREATIVE_VISUAL_PRODUCTION_MODES.ORIGINAL_WORLD_BUILDING,
    enhancement_required: enhancementRequired,
    premium_keyframe_required: keyframeRequired,
    keyframe_provider_strategy: keyframeRequired
      ? {
          provider_family: "avantiqo-image",
          model: "avantiqo-image-v1",
          role: "PREMIUM_VALIDATED_KEYFRAME",
          owned_only_required: true,
        }
      : null,
    video_provider_strategy: {
      default: {
        provider_family: "avantiqo-video",
        model: "avantiqo-ltx-2.5",
        role: "DEFAULT_VIDEO_GENERATION",
        owned_only_required: true,
      },
      precision_frame_control: {
        provider_family: "avantiqo-video",
        model: "avantiqo-ltx-2.5",
        role: "FIRST_LAST_FRAME_OR_EXTENSION",
        owned_only_required: true,
      },
    },
    post_transform_brand_review_required:
      enhancementRequired || keyframeRequired,
    trusted_derived_promotion_allowed_only_after_review: keyframeRequired,
    evidence,
  };
}

export function resolveCreativeVisualProductionRoute({
  shot = {},
  primary_asset = {},
  binding = {},
} = {}) {
  const quality = assetQuality(primary_asset);
  const composition = assetComposition(primary_asset);
  const semanticFit = assetSemanticFit(primary_asset, binding);
  const referenceFitness = productionReferenceFitness(primary_asset);
  const productionReferenceWeak = weakProductionReference(referenceFitness);
  const hasTrustedVisual = authentic(primary_asset) || trustedDerived(primary_asset);
  const reconstructionRequired = storyRequiresReconstruction(shot);
  const referenceOnly = directUseBlocked(primary_asset);

  const evidence = {
    primary_source_asset_id:
      primary_asset.id || primary_asset.asset_id || shot.primary_source_asset_id || null,
    provenance_classification: provenance(primary_asset).classification || "UNKNOWN",
    quality_score: quality,
    composition_score: composition,
    semantic_fit_score: semanticFit,
    production_reference_fitness: referenceFitness,
    production_reference_weak: productionReferenceWeak,
    direct_use_blocked: referenceOnly,
    story_requires_reconstruction: reconstructionRequired,
  };

  if (!hasTrustedVisual) {
    return routeFor(
      CREATIVE_VISUAL_PRODUCTION_MODES.ORIGINAL_WORLD_BUILDING,
      {
        ...evidence,
        reason: "No authentic or trusted-derived primary visual is available for direct pixel use.",
      },
    );
  }

  if (reconstructionRequired || referenceOnly || productionReferenceWeak) {
    return routeFor(
      CREATIVE_VISUAL_PRODUCTION_MODES.CINEMATIC_RECONSTRUCTION,
      {
        ...evidence,
        reason: reconstructionRequired
          ? "The approved story requires a materially different production frame than the source image provides."
          : productionReferenceWeak
            ? "The source remains truthful evidence, but its cinematic usefulness, behavioral authenticity, environmental density or scene-state fit is insufficient for production composition."
            : "The source is trusted evidence but is restricted to reference use rather than direct pixel use.",
      },
    );
  }

  const strongQuality = quality === null || quality >= 82;
  const strongComposition = composition === null || composition >= 75;
  const strongSemanticFit = semanticFit === null || semanticFit >= 80;

  if (strongQuality && strongComposition && strongSemanticFit) {
    return routeFor(
      CREATIVE_VISUAL_PRODUCTION_MODES.DIRECT_AUTHENTIC,
      {
        ...evidence,
        reason: "The trusted source already satisfies direct production quality, composition and story-fit requirements.",
      },
    );
  }

  const compositionUsable = composition === null || composition >= 65;
  const semanticUsable = semanticFit === null || semanticFit >= 75;
  const qualityRepairable = quality === null || quality >= 45;

  if (compositionUsable && semanticUsable && qualityRepairable) {
    return routeFor(
      CREATIVE_VISUAL_PRODUCTION_MODES.ENHANCE_AUTHENTIC,
      {
        ...evidence,
        reason: "The source composition and story match are usable; improve technical image quality without redesigning the scene.",
      },
    );
  }

  return routeFor(
    CREATIVE_VISUAL_PRODUCTION_MODES.CINEMATIC_RECONSTRUCTION,
    {
      ...evidence,
      reason: "The source remains trusted brand evidence, but its composition or technical quality is insufficient for premium direct use.",
    },
  );
}

export const CreativeVisualProductionRouteRuntime = Object.freeze({
  contract: CONTRACT,
  modes: CREATIVE_VISUAL_PRODUCTION_MODES,
  resolve: resolveCreativeVisualProductionRoute,
});