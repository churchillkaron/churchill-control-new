import "@/lib/creative/production/dossier/runtime/CreativeOptimizedGraphPersistencePatch";
import "@/lib/creative/production/dossier/runtime/CreativeWorldClassConceptDossierGuardRuntime";

import {
  buildExecutionPlan,
} from "../planner/ExecutionPlanner";

import {
  createExecutionPlan,
} from "../documents/ExecutionPlan";

import {
  CreativeProductionDossierRuntime,
} from "@/lib/creative/production/dossier/runtime/CreativeProductionDossierRuntime";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";

import * as Repository
from "../repositories/ExecutionRepository";
import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { getProviderPricing } from "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository";
import { ownedProviderForCapability } from "@/lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy";

function text(value) { return String(value ?? "").trim(); }
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quoteUsage(step = {}, pricing = {}) {
  const unit = text(pricing.unit).toLowerCase();
  if (unit === "second") {
    const quantity = finite(step.estimated_seconds);
    if (quantity === null || quantity <= 0) throw new Error(`PRODUCTION_QUOTE_DURATION_REQUIRED:${step.id}`);
    return { quantity };
  }
  return { quantity: 1 };
}

function stagedOwnedQuoteAllowed(pricing = {}) {
  const metadata = pricing.metadata || {};
  return pricing.active === false &&
    metadata.owned_inference === true &&
    metadata.runtime_compatible === true &&
    metadata.model_license_verified === true &&
    text(metadata.pricing_status).toUpperCase() === "MARKET_PARITY_READY" &&
    metadata.production_routing_allowed === false &&
    metadata.benchmark_review_preview_allowed === true;
}

async function quoteExecutionPlan(plan = {}) {
  const currency = text(plan.currency).toUpperCase();
  if (!currency) return plan;
  const steps = [];
  for (const step of plan.steps || []) {
    const capability = text(step.capability || step.service_code);
    if (!capability.startsWith("ai.") || Number(step.estimated_cost || 0) > 0) {
      steps.push(step);
      continue;
    }
    const provider = ownedProviderForCapability(capability);
    if (!provider) { steps.push(step); continue; }
    const pricing = await getProviderPricing({ provider, capability, currency, includeInactive: true });
    if (!pricing || (pricing.active !== true && !stagedOwnedQuoteAllowed(pricing))) {
      throw new Error(`OWNED_PRODUCTION_QUOTE_PRICING_REQUIRED:${capability}:${provider}`);
    }
    const usage = quoteUsage(step, pricing);
    const quote = PricingRuntime.resolveRecord({
      pricing: pricing.active === true ? pricing : { ...pricing, benchmark_review_preview_authorized: true },
      provider, capability, model: pricing.model || null, currency, usage,
    });
    steps.push({
      ...step,
      estimated_cost: quote.customer_price,
      metadata: {
        ...(step.metadata || {}),
        pricing_quote: {
          contract: "CREATIVE_OWNED_PREPRODUCTION_QUOTE_V1",
          provider, model: pricing.model || null, pricing_id: pricing.id,
          quantity: quote.quantity, unit: quote.unit, currency: quote.currency,
          customer_price: quote.customer_price, production_pricing_active: quote.production_pricing_active === true,
          production_routing_allowed: pricing.metadata?.production_routing_allowed === true,
        },
      },
    });
  }
  return {
    ...plan, steps,
    estimated_cost: Number(steps.reduce((sum, step) => sum + Number(step.estimated_cost || 0), 0).toFixed(6)),
  };
}

export const ExecutionRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async create(input = {}) {
    const basePlan = Array.isArray(input.steps)
      ? {
          ...input,
          updated_at: new Date().toISOString(),
        }
      : createExecutionPlan(input);
    const plan = await quoteExecutionPlan(basePlan);

    const execution = await Repository.create(plan);
    if (!execution.production_graph_id) return execution;

    const graph = await ProductionGraphRepository.getById(
      execution.production_graph_id,
    );
    if (!graph) throw new Error("PRODUCTION_DOSSIER_GRAPH_NOT_FOUND");
    const dossier = await CreativeProductionDossierRuntime.materialize({
      organization_id: execution.organization_id,
      creative_project_id: execution.creative_project_id,
      production_graph: graph,
      execution_plan: execution,
    });

    return {
      ...execution,
      production_dossier: {
        asset_node_id: dossier.dossier_asset_node.id,
        dossier_hash: dossier.dossier.dossier_hash,
        plan_hash: dossier.dossier.immutable_evidence.plan_hash,
        graph_hash: dossier.dossier.immutable_evidence.graph_hash,
        execution_hash: dossier.dossier.immutable_evidence.execution_hash,
        estimated_cost: dossier.dossier.cost.estimated_total,
        currency: dossier.dossier.cost.currency,
        approval_required: true,
        approved: false,
      },
    };
  },

  async update(id, values) {
    return Repository.update(id, values);
  },

  async plan({
    organization_id,
    creative_project_id,
    production_graph,
  }) {
    return buildExecutionPlan({
      organization_id,
      creative_project_id,
      production_graph,
    });
  },
};
