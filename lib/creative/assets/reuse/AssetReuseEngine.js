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

function normalizedSet(values) {
  return new Set(list(values).map((value) => text(value).toLowerCase()).filter(Boolean));
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
  const spec = object(node.generation?.output_spec || node.requirements?.output_spec);
  const width = Number(spec.width || node.requirements?.width || 0);
  const height = Number(spec.height || node.requirements?.height || 0);
  if (width > 0 && height > 0) return width / height;
  const ratio = Number(spec.aspect_ratio || node.requirements?.aspect_ratio);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function hardConstraintEvaluation(node, asset) {
  const requirements = object(node.requirements);
  const restrictions = object(asset.metadata?.restrictions || asset.restrictions);
  const rights = object(asset.metadata?.rights || asset.rights);
  const consent = object(asset.metadata?.consent || asset.consent);
  const intelligence = object(asset.intelligence);
  const review = object(asset.review);
  const reuse = object(asset.reuse);
  const failures = [];

  if (reuse.approved_for_reuse !== true || reuse.reusable !== true) {
    failures.push("NOT_APPROVED_FOR_REUSE");
  }
  if (review.approved !== true || review.human_reviewed !== true) {
    failures.push("HUMAN_REUSE_APPROVAL_REQUIRED");
  }
  if (asset.status !== "APPROVED") {
    failures.push("ASSET_STATUS_NOT_APPROVED");
  }
  if (["BLOCKED", "REJECTED", "UNSAFE"].includes(text(intelligence.safety_status).toUpperCase())) {
    failures.push("SAFETY_STATUS_BLOCKS_REUSE");
  }
  if (restrictions.no_reuse === true || restrictions.reuse_prohibited === true) {
    failures.push("REUSE_PROHIBITED");
  }
  if (restrictions.expires_at && Date.parse(restrictions.expires_at) <= Date.now()) {
    failures.push("REUSE_RIGHTS_EXPIRED");
  }
  if (requirements.require_rights === true && rights.verified !== true) {
    failures.push("VERIFIED_RIGHTS_REQUIRED");
  }
  if (requirements.require_consent === true && consent.verified !== true) {
    failures.push("VERIFIED_CONSENT_REQUIRED");
  }
  if (!sameRequired(requirements.identity_id, intelligence.identity_id || asset.metadata?.identity_id)) {
    failures.push("IDENTITY_MISMATCH");
  }
  if (!sameRequired(requirements.product_id, intelligence.product_id || asset.metadata?.product_id)) {
    failures.push("PRODUCT_MISMATCH");
  }
  if (!sameRequired(requirements.product_version, intelligence.product_version || asset.metadata?.product_version)) {
    failures.push("PRODUCT_VERSION_MISMATCH");
  }
  if (!sameRequired(requirements.location_id, intelligence.location_id || asset.metadata?.location_id)) {
    failures.push("LOCATION_MISMATCH");
  }
  if (!sameRequired(requirements.wardrobe_id, intelligence.wardrobe_id || asset.metadata?.wardrobe_id)) {
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

function weightedEvaluation(node, asset) {
  const requirements = object(node.requirements);
  const intelligence = object(asset.intelligence);
  const requestedTags = requirements.tags || node.metadata?.tags || [];
  const tagFit = overlap(requestedTags, intelligence.tags);
  const actorFit = overlap(
    list(requirements.actors).map((item) => item?.id || item?.name || item),
    intelligence.detected_people,
  );
  const productFit = overlap(
    list(requirements.products).map((item) => item?.id || item?.name || item),
    intelligence.detected_products,
  );
  const locationFit = overlap(
    Object.values(object(requirements.location)),
    intelligence.detected_locations,
  );
  const targetAspect = requestedAspect(node);
  const actual = dimensions(asset);
  const aspectFit = targetAspect && actual.aspect_ratio
    ? Math.max(0, 1 - Math.min(1, Math.abs(targetAspect - actual.aspect_ratio) / targetAspect))
    : 1;
  const quality = Math.max(0, Math.min(1, Number(intelligence.quality_score || 0) / 100));
  const brand = Math.max(0, Math.min(1, Number(intelligence.brand_match_score || 0) / 100));

  const score = Math.round(100 * (
    tagFit.ratio * 0.20 +
    actorFit.ratio * 0.20 +
    productFit.ratio * 0.20 +
    locationFit.ratio * 0.10 +
    aspectFit * 0.10 +
    quality * 0.10 +
    brand * 0.10
  ));

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
    },
  };
}

function reusePolicy(node = {}) {
  const policy = object(node.metadata?.reuse_policy || node.requirements?.reuse_policy);
  return {
    enabled: policy.enabled === true,
    minimum_score: Number(policy.minimum_score ?? 85),
    require_rights: policy.require_rights !== false,
    require_consent: policy.require_consent !== false,
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

    const requirements = {
      ...object(node.requirements),
      require_rights: policy.require_rights,
      require_consent: policy.require_consent,
    };
    const reusable = await CreativeAssetGraphRuntime.findReusable({
      organization_id,
      type: node.type,
      tags: [],
    });

    const evaluations = reusable.map((asset) => {
      const hard = hardConstraintEvaluation({ ...node, requirements }, asset);
      const weighted = hard.passed
        ? weightedEvaluation({ ...node, requirements }, asset)
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
      .sort((a, b) => b.score - a.score);
    const selected = accepted[0] || null;

    if (!selected) {
      return {
        ...node,
        metadata: {
          ...(node.metadata || {}),
          reuse_decision: {
            status: "NO_SAFE_MATCH",
            minimum_score: policy.minimum_score,
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
          selected_asset_id: selected.asset.id,
          selected_score: selected.score,
          minimum_score: policy.minimum_score,
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
