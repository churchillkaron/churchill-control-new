import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-currency-runtime.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim().toUpperCase();
}

function projectCurrency(project = {}) {
  return text(
    project.currency ||
    project.default_currency ||
    project.base_currency ||
    project.metadata?.currency ||
    project.metadata?.default_currency ||
    project.metadata?.base_currency ||
    project.metadata?.business_context?.currency,
  );
}

function graphCurrency(graph = {}) {
  return text(
    graph.cost_plan?.currency ||
    graph.metadata?.approval_plan_snapshot?.production?.currency,
  );
}

function organizationCurrency(organization = {}) {
  const metadata = object(organization.metadata);
  const settings = object(
    organization.settings ||
    organization.organization_settings,
  );

  return text(
    organization.currency ||
    organization.default_currency ||
    organization.base_currency ||
    metadata.currency ||
    metadata.default_currency ||
    metadata.base_currency ||
    settings.currency ||
    settings.default_currency ||
    settings.base_currency,
  );
}

async function existingGraphCurrency({
  organization_id,
  creative_project_id,
}) {
  if (!organization_id || !creative_project_id) return "";

  const graphs = await ProductionGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });

  for (const graph of graphs) {
    const currency = graphCurrency(graph);
    if (currency) return currency;
  }

  return "";
}

async function configuredOrganizationCurrency(organization_id) {
  if (!organization_id) return "";

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organization_id)
    .maybeSingle();

  if (error) throw error;
  return organizationCurrency(data || {});
}

async function resolveProductionCurrency(input = {}, plan = {}) {
  const existing = text(plan.production?.currency);
  if (existing) return existing;

  const project = object(input.project);
  const projectValue = projectCurrency(project);
  if (projectValue) return projectValue;

  const graphValue = await existingGraphCurrency({
    organization_id: input.organization_id || project.organization_id,
    creative_project_id:
      input.creative_project_id ||
      project.id ||
      project.creative_project_id,
  });
  if (graphValue) return graphValue;

  return configuredOrganizationCurrency(
    input.organization_id || project.organization_id,
  );
}

function install() {
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutCurrencyHydration =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithProductionCurrency(input = {}) {
      const result = await createWithoutCurrencyHydration(input);
      const plan = object(result?.plan);
      const currency = await resolveProductionCurrency(input, plan);

      if (!currency) return result;

      return {
        ...result,
        plan: {
          ...plan,
          production: {
            ...object(plan.production),
            currency,
          },
        },
      };
    };
}

install();

export const CreativeProductionCurrencyRuntime = {
  installed: true,
};
