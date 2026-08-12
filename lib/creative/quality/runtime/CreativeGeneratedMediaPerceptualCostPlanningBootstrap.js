import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  ProviderResolver,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.generated-media-perceptual-cost-planning.v1",
);
const CONTRACT = "CREATIVE_GENERATED_MEDIA_PERCEPTUAL_COST_PLANNING_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";

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

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Number(number.toFixed(6))
    : 0;
}

function isReviewNode(node = {}) {
  return text(node.type).toUpperCase() === "GENERATED_MEDIA_PERCEPTUAL_REVIEW" ||
    text(node.metadata?.contract) === REVIEW_CONTRACT;
}

function preferredProvider(node = {}) {
  const provider = text(node.generation?.provider);
  return provider && provider.toUpperCase() !== "AUTO" ? provider : null;
}

function providerPolicy(node = {}) {
  return {
    ...object(node.generation?.provider_policy),
    ...object(node.metadata?.provider_policy),
    selection_weights: {
      preference: 5,
      quality: 5,
      reliability: 4,
      speed: 2,
      cost: 1,
      ...object(
        node.generation?.provider_policy?.selection_weights ||
        node.metadata?.provider_policy?.selection_weights,
      ),
    },
  };
}

async function pricedReviewNode({ organization_id, currency, node }) {
  const generation = object(node.generation);
  const capability = text(generation.capability || generation.service);
  if (!capability) {
    throw new Error(`PERCEPTUAL_REVIEW_CAPABILITY_REQUIRED:${node.id}`);
  }
  if (!currency) {
    throw new Error(`PERCEPTUAL_REVIEW_CURRENCY_REQUIRED:${node.id}`);
  }

  const selected = await ProviderResolver.resolveProvider({
    organization_id,
    capability,
    preferredProvider: preferredProvider(node),
    currency,
    policy: providerPolicy(node),
  });
  const pricing = await PricingRuntime.resolve({
    provider: selected.provider,
    capability,
    model: selected.model || null,
    currency,
    usage: {
      quantity: 1,
      estimated: true,
    },
  });

  if (!pricing.pricing_id) {
    throw new Error(`PERCEPTUAL_REVIEW_PRICING_ID_REQUIRED:${node.id}`);
  }
  if (text(pricing.currency).toUpperCase() !== text(currency).toUpperCase()) {
    throw new Error(`PERCEPTUAL_REVIEW_PRICING_CURRENCY_MISMATCH:${node.id}`);
  }

  return {
    ...node,
    generation: {
      ...generation,
      provider: selected.provider,
      model: selected.model || generation.model || null,
      estimated_cost: money(pricing.customer_price),
      provider_parameters: {
        ...object(generation.provider_parameters),
        model: selected.model || generation.model || null,
      },
    },
    metadata: {
      ...object(node.metadata),
      perceptual_review_pricing_planned: true,
      perceptual_review_pricing_contract: CONTRACT,
      perceptual_review_pricing_id: pricing.pricing_id,
      perceptual_review_provider: selected.provider,
      perceptual_review_model: selected.model || null,
      perceptual_review_estimated_customer_price: money(pricing.customer_price),
      perceptual_review_currency: pricing.currency,
      perceptual_review_provider_selection_owned_by_service_domain: true,
      perceptual_review_paid_execution_authorized: false,
    },
  };
}

export async function planGeneratedMediaPerceptualCosts({
  organization_id,
  graph,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!graph) throw new Error("production graph required");

  const currency = text(graph.cost_plan?.currency).toUpperCase();
  const nodes = [];
  const reviews = [];

  for (const node of list(graph.nodes)) {
    if (!isReviewNode(node)) {
      nodes.push(node);
      continue;
    }
    const priced = await pricedReviewNode({
      organization_id,
      currency,
      node,
    });
    nodes.push(priced);
    reviews.push(priced);
  }

  const totalEstimated = money(
    nodes
      .filter((node) => node.generation?.required === true)
      .reduce(
        (sum, node) => sum + money(node.generation?.estimated_cost),
        0,
      ),
  );
  const reviewEstimated = money(
    reviews.reduce(
      (sum, node) => sum + money(node.generation?.estimated_cost),
      0,
    ),
  );

  return {
    ...graph,
    nodes,
    cost_plan: {
      ...object(graph.cost_plan),
      estimated_cost: totalEstimated,
    },
    metadata: {
      ...object(graph.metadata),
      generated_media_perceptual_cost_planning_contract: CONTRACT,
      generated_media_perceptual_priced_review_count: reviews.length,
      generated_media_perceptual_review_estimated_cost: reviewEstimated,
      generated_media_perceptual_review_currency: currency || null,
      generated_media_perceptual_review_provider_calls_executed: false,
      generated_media_perceptual_review_pricing_resolved_before_approval: true,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[FLAG]) return;

  const preview = ProductionGraphRuntime.preview.bind(ProductionGraphRuntime);
  const create = ProductionGraphRuntime.create.bind(ProductionGraphRuntime);

  Object.defineProperty(ProductionGraphRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithPerceptualCostPlanning(
    input = {},
  ) {
    const graph = await preview(input);
    if (text(graph.metadata?.workflow_kind).toUpperCase() !== "TEMPORAL") {
      return graph;
    }
    return planGeneratedMediaPerceptualCosts({
      organization_id: input.organization_id,
      graph,
    });
  };

  ProductionGraphRuntime.plan = async function planWithPerceptualCostPlanning(
    input = {},
  ) {
    const graph = await ProductionGraphRuntime.preview(input);
    return create(graph);
  };
}

install();

export const CreativeGeneratedMediaPerceptualCostPlanningBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  plan: planGeneratedMediaPerceptualCosts,
});
