import {
  CreativeAssetGraphRuntime,
} from "../graph/runtime/CreativeAssetGraphRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedSet(values) {
  return new Set(
    list(values)
      .map((value) => text(value).toLowerCase())
      .filter(Boolean),
  );
}

function overlap(required, available) {
  const expected = normalizedSet(required);
  const actual = normalizedSet(available);
  if (!expected.size) return { ratio: 1, matched: [], missing: [] };
  const matched = [...expected].filter((value) => actual.has(value));
  const missing = [...expected].filter((value) => !actual.has(value));
  return {
    ratio: matched.length / expected.size,
    matched,
    missing,
  };
}

function comparable(value) {
  return text(value).toLowerCase();
}

function sameRequired(required, actual) {
  const expected = comparable(required);
  if (!expected) return true;
  return expected === comparable(actual);
}

function dimensions(asset = {}) {
  const width = Number(asset.technical?.width || 0);
  const height = Number(asset.technical?.height || 0);
  return {
    width,
    height,
    aspect_ratio: width > 0 && height > 0 ? width / height : null,
  };
}

function requestedAspect(node = {}) {
  const spec = object(
    node.generation?.output_spec ||
    node.requirements?.output_spec,
  );
  const width = Number(spec.width || node.requirements?.width || 0);
  const height = Number(spec.height || node.requirements?.height || 0);
  if (width > 0 && height > 0) return width / height;
  const ratio = Number(spec.aspect_ratio || node.requirements?.aspect_ratio);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function requiredAssetType(node = {}, policy = {}) {
  const explicit = text(
    policy.asset_node_type ||
    node.requirements?.asset_node_type ||
    node.generation?.output_spec?.asset_node_type,
  ).toUpperCase();
  if (explicit) return explicit;

  const capability = text(
    node.generation?.capability ||
    node.generation?.service ||
    node.metadata?.capability,
  ).toLowerCase();
  if (capability.includes("image")) return "IMAGE";
  if (capability.includes("video") || capability.includes("render")) return "VIDEO";
  if (capability.includes("voice")) return "VOICE";
  if (capability.includes("music")) return "MUSIC";
  if (capability.includes("sfx")) return "SFX";
  if (capability.includes("audio")) return "AUDIO";
  if (capability.includes("subtitle") || capability.includes("speech.to.text")) {
    return "SUBTITLE";
  }
  if (capability.includes("logo")) return "LOGO";
  if (capability.includes("template")) return "TEMPLATE";
  return null;
}

function reusePolicy(node = {}) {
  const policy = object(
    node.metadata?.reuse_policy ||
    node.requirements?.reuse_policy,
  );
  const weights = object(policy.weights);
  const normalizedWeights = {
    tags: Math.max(0, finite(weights.tags) ?? 0),
    actors: Math.max(0, finite(weights.actors) ?? 0),
    products: Math.max(0, finite(weights.products) ?? 0),
    location: Math.max(0, finite(weights.location) ?? 0),
    aspect: Math.max(0, finite(weights.aspect) ?? 0),
    quality: Math.max(0, finite(weights.quality) ?? 0),
    brand: Math.max(0, finite(weights.brand) ?? 0),
  };
  const weightTotal = Object.values(normalizedWeights)
    .reduce((sum, value) => sum + value, 0);

  return {
    enabled: policy.enabled === true,
    minimum_score: finite(policy.minimum_score),
    require_rights: policy.require_rights !== false,
    require_consent: policy.require_consent !== false,
    asset_node_type: requiredAssetType(node, policy),
    weights: normalizedWeights,
    weight_total: weightTotal,
  };
}

function assertPolicy(policy) {
  if (!policy.enabled) return;
  if (policy.minimum_score === null) {
    throw new Error("CREATIVE_REUSE_MINIMUM_SCORE_REQUIRED");
  }
  if (policy.minimum_score < 0 || policy.minimum_score > 100) {
    throw new Error("CREATIVE_REUSE_MINIMUM_SCORE_INVALID");
  }
  if (!policy.asset_node_type) {
    throw new Error("CREATIVE_REUSE_ASSET_NODE_TYPE_REQUIRED");
  }
  if (policy.weight_total <= 0) {
    throw new Error("CREATIVE_REUSE_SCORING_WEIGHTS_REQUIRED");
  }
}

function hardConstraintEvaluation(node, asset, policy) {
  const requirements = object(node.requirements);
  const restrictions = object(
    asset.metadata?.restrictions || asset.restrictions,
  );
  const rights = object(asset.metadata?.rights || asset.rights);
  const consent = object(asset.metadata?.consent || asset.consent);
  const intelligence = object(asset.intelligence);
  const review = object(asset.review);
  const reuse = object(asset.reuse);
  const failures = [];

  if (asset.type !== policy.asset_node_type) {
    failures.push("ASSET_NODE_TYPE_MISMATCH");
  }
  if (reuse.approved_for_reuse !== true || reuse.reusable !== true) {
    failures.push("NOT_APPROVED_FOR_REUSE");
  }
  if (review.approved !== true || review.human_reviewed !== true) {
    failures.push("HUMAN_REUSE_APPROVAL_REQUIRED");
  }
  if (asset.status !== "APPROVED") {
    failures.push("ASSET_STATUS_NOT_APPROVED");
  }
  if (
    ["BLOCKED", "REJECTED", "UNSAFE", "UNVERIFIED"]
      .includes(text(intelligence.safety_status).toUpperCase())
  ) {
    failures.push("SAFETY_STATUS_BLOCKS_REUSE");
  }
  if (restrictions.no_reuse === true || restrictions.reuse_prohibited === true) {
    failures.push("REUSE_PROHIBITED");
  }
  if (
    restrictions.expires_at &&
    Date.parse(restrictions.expires_at) <= Date.now()
  ) {
    failures.push("REUSE_RIGHTS_EXPIRED");
  }
  if (policy.require_rights && rights.verified !== true) {
    failures.push("VERIFIED_RIGHTS_REQUIRED");
  }
  if (policy.require_consent && consent.verified !== true) {
    failures.push("VERIFIED_CONSENT_REQUIRED");
  }
  if (
    !sameRequired(
      requirements.identity_id,
      intelligence.identity_id || asset.metadata?.identity_id,
    )
  ) {
    failures.push("IDENTITY_MISMATCH");
  }
  if (
    !sameRequired(
      requirements.product_id,
      intelligence.product_id || asset.metadata?.product_id,
    )
  ) {
    failures.push("PRODUCT_MISMATCH");
  }
  if (
    !sameRequired(
      requirements.product_version,
      intelligence.product_version || asset.metadata?.product_version,
    )
  ) {
    failures.push("PRODUCT_VERSION_MISMATCH");
  }
  if (
    !sameRequired(
      requirements.location_id,
      intelligence.location_id || asset.metadata?.location_id,
    )
  ) {
    failures.push("LOCATION_MISMATCH");
  }
  if (
    !sameRequired(
      requirements.wardrobe_id,
      intelligence.wardrobe_id || asset.metadata?.wardrobe_id,
    )
  ) {
    failures.push("WARDROBE_MISMATCH");
  }

  const minimumQuality = Number(requirements.minimum_quality || 0);
  const quality = Number(intelligence.quality_score || 0);
  if (minimumQuality > 0 && quality < minimumQuality) {
    failures.push("QUALITY_BELOW_MINIMUM");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function weightedEvaluation(node, asset, policy) {
  const requirements = object(node.requirements);
  const intelligence = object(asset.intelligence);
  const requestedTags = requirements.tags || node.metadata?.tags || [];
  const tagFit = overlap(requestedTags, intelligence.tags);
  const actorFit = overlap(
    list(requirements.actors)
      .map((item) => item?.id || item?.name || item),
    intelligence.detected_people,
  );
  const productFit = overlap(
    list(requirements.products)
      .map((item) => item?.id || item?.name || item),
    intelligence.detected_products,
  );
  const locationFit = overlap(
    Object.values(object(requirements.location)),
    intelligence.detected_locations,
  );
  const targetAspect = requestedAspect(node);
  const actual = dimensions(asset);
  const aspectFit = targetAspect && actual.aspect_ratio
    ? Math.max(
        0,
        1 - Math.min(
          1,
          Math.abs(targetAspect - actual.aspect_ratio) / targetAspect,
        ),
      )
    : 1;
  const quality = Math.max(
    0,
    Math.min(1, Number(intelligence.quality_score || 0) / 100),
  );
  const brand = Math.max(
    0,
    Math.min(1, Number(intelligence.brand_match_score || 0) / 100),
  );
  const values = {
    tags: tagFit.ratio,
    actors: actorFit.ratio,
    products: productFit.ratio,
    location: locationFit.ratio,
    aspect: aspectFit,
    quality,
    brand,
  };
  const weightedTotal = Object.entries(policy.weights)
    .reduce((sum, [key, weight]) => sum + values[key] * weight, 0);
  const score = Math.round(100 * weightedTotal / policy.weight_total);

  return {
    score,
    evidence: {
      tag_fit: tagFit,
      actor_fit: actorFit,
      product_fit: productFit,
      location_fit: locationFit,
      requested_aspect_ratio: targetAspect,
      actual_aspect_ratio: actual.aspect_ratio,
      aspect_fit: aspectFit,
      quality_score: Number(intelligence.quality_score || 0),
      brand_match_score: Number(intelligence.brand_match_score || 0),
      weights: policy.weights,
    },
  };
}

export const AssetReuseEngine = {
  async resolveNode(node, organization_id) {
    if (!node.generation?.required) return node;

    const policy = reusePolicy(node);
    if (!policy.enabled) {
      return {
        ...node,
        metadata: {
          ...(node.metadata || {}),
          reuse_decision: {
            status: "DISABLED",
            reason: "Automatic reuse requires an explicit node reuse policy.",
          },
        },
      };
    }
    assertPolicy(policy);

    const reusable = await CreativeAssetGraphRuntime.findReusable({
      organization_id,
      type: policy.asset_node_type,
      tags: [],
    });

    const evaluations = reusable.map((asset) => {
      const hard = hardConstraintEvaluation(node, asset, policy);
      const weighted = hard.passed
        ? weightedEvaluation(node, asset, policy)
        : { score: 0, evidence: {} };
      return {
        asset,
        asset_id: asset.id,
        hard_constraints_passed: hard.passed,
        rejection_reasons: hard.failures,
        score: weighted.score,
        evidence: weighted.evidence,
      };
    });

    const accepted = evaluations
      .filter((item) => item.hard_constraints_passed)
      .filter((item) => item.score >= policy.minimum_score)
      .sort((left, right) => right.score - left.score);
    const selected = accepted[0] || null;

    if (!selected) {
      return {
        ...node,
        metadata: {
          ...(node.metadata || {}),
          reuse_decision: {
            status: "NO_SAFE_MATCH",
            asset_node_type: policy.asset_node_type,
            minimum_score: policy.minimum_score,
            weights: policy.weights,
            candidates: evaluations.map(({ asset, ...item }) => item),
          },
        },
      };
    }

    return {
      ...node,
      generation: {
        ...node.generation,
        required: false,
        reused: true,
        asset_id: selected.asset.id,
        status: "REUSED",
      },
      assets: [
        ...(node.assets || []),
        selected.asset.id,
      ],
      metadata: {
        ...(node.metadata || {}),
        reuse_decision: {
          status: "REUSED",
          asset_node_type: policy.asset_node_type,
          selected_asset_id: selected.asset.id,
          selected_score: selected.score,
          minimum_score: policy.minimum_score,
          weights: policy.weights,
          evidence: selected.evidence,
          approved_by: selected.asset.review?.approved_by || null,
          evaluated_at: new Date().toISOString(),
          candidates: evaluations.map(({ asset, ...item }) => item),
        },
      },
    };
  },

  async optimizeGraph({
    organization_id,
    graph,
  }) {
    graph.nodes = await Promise.all(
      (graph.nodes || []).map((node) =>
        this.resolveNode(node, organization_id),
      ),
    );
    return graph;
  },
};
