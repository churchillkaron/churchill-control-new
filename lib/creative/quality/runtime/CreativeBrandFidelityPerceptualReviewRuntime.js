import {
  CreativeGeneratedMediaPerceptualGraphRuntime,
} from "./CreativeGeneratedMediaPerceptualGraphRuntime";
import {
  CreativeBrandFidelityRuntime,
} from "@/lib/creative/assets/intelligence/runtime/CreativeBrandFidelityRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.brand-fidelity.perceptual-review.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function rule(rules = [], contract) {
  return list(rules).find((item) => item?.contract === contract) || null;
}

function sourceNodeFor(reviewNode = {}, nodes = []) {
  const id = text(
    reviewNode.metadata?.source_generation_node_id ||
    reviewNode.requirements?.source_generation_node_id,
  );
  return list(nodes).find((node) => text(node.id) === id) || null;
}

function install() {
  if (CreativeGeneratedMediaPerceptualGraphRuntime[FLAG]) return;
  const applyWithoutBrandFidelity =
    CreativeGeneratedMediaPerceptualGraphRuntime.apply.bind(
      CreativeGeneratedMediaPerceptualGraphRuntime,
    );
  Object.defineProperty(CreativeGeneratedMediaPerceptualGraphRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeGeneratedMediaPerceptualGraphRuntime.apply = function applyBrandGroundedPerceptualReview(input = {}) {
    const graph = applyWithoutBrandFidelity(input);
    const contracts = CreativeBrandFidelityRuntime.contracts;
    let brandReviewCount = 0;

    const nodes = list(graph.nodes).map((node) => {
      if (text(node.type).toUpperCase() !== "GENERATED_MEDIA_PERCEPTUAL_REVIEW") {
        return node;
      }

      const source = sourceNodeFor(node, graph.nodes);
      if (!source) return node;
      const brandRules = list(source.requirements?.brand_rules);
      const fidelity = rule(brandRules, contracts.brand_fidelity);
      const truth = rule(brandRules, contracts.brand_truth);
      if (fidelity?.required !== true) return node;
      if (
        !truth ||
        text(truth.brand_truth_hash) !== text(fidelity.brand_truth_hash)
      ) {
        throw new Error(
          `CREATIVE_BRAND_REVIEW_TRUTH_REQUIRED:${source.id || "unknown"}`,
        );
      }

      brandReviewCount += 1;
      const expected = object(node.requirements?.expected_contract);
      const thresholds = {
        ...object(node.requirements?.thresholds),
        minimum_brand_fit_score: Number(
          source.requirements?.minimum_quality ||
          expected.thresholds?.minimum_overall_score ||
          88,
        ),
      };

      return {
        ...node,
        requirements: {
          ...object(node.requirements),
          expected_contract: {
            ...expected,
            brand_fit_required: true,
            brand_truth: truth,
            brand_fidelity: fidelity,
            brand_rules: brandRules,
            story_lineage:
              source.requirements?.story_lineage ||
              source.metadata?.story_lineage ||
              {},
          },
          thresholds,
          brand_truth_required: true,
          brand_fit_review_required: true,
        },
        generation: {
          ...object(node.generation),
          provider_parameters: {
            ...object(node.generation?.provider_parameters),
            brand_fit_required: true,
            brand_truth_hash: truth.brand_truth_hash,
            provenance_hash: fidelity.provenance_hash,
          },
        },
        metadata: {
          ...object(node.metadata),
          brand_fit_review_required: true,
          brand_truth_hash: truth.brand_truth_hash,
          provenance_hash: fidelity.provenance_hash,
          research_report_id: fidelity.research_report_id,
        },
      };
    });

    return {
      ...graph,
      nodes,
      metadata: {
        ...object(graph.metadata),
        brand_fidelity_perceptual_review_contract: brandReviewCount
          ? "CREATIVE_BRAND_FIDELITY_PERCEPTUAL_REVIEW_V1"
          : null,
        brand_fidelity_perceptual_review_count: brandReviewCount,
        brand_fidelity_review_is_post_generation: true,
      },
    };
  };
}

install();

export const CreativeBrandFidelityPerceptualReviewRuntime = Object.freeze({
  installed: true,
});
