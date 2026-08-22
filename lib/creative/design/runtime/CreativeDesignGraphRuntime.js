import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { CreativeDesignSpecificationRuntime } from "./CreativeDesignSpecificationRuntime.js";
import {
  CreativeDesignGovernanceValidationRuntime,
} from "./CreativeDesignGovernanceValidationRuntime.js";
import {
  CreativeDesignMenuDataSourceRuntime,
} from "../data-sources/CreativeDesignMenuDataSourceRuntime.js";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.design.graph.v3");

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function nodeCapability(node = {}) {
  return text(node.generation?.capability || node.generation?.service).toLowerCase();
}

function declaredSourceMap(project = {}, brief = {}) {
  return object(
    brief.governed_data_sources ||
    brief.metadata?.governed_data_sources ||
    project.metadata?.governed_data_sources,
  );
}

async function automaticSourceMap({ organization_id, workflow }) {
  const sources = {};
  if (workflow === "DOCUMENT") {
    const menu = await CreativeDesignMenuDataSourceRuntime.resolve({ organization_id });
    if (menu) sources[menu.source_id] = menu;
  }
  return sources;
}

async function governedSourceMap({ organization_id, workflow, project, brief }) {
  const automatic = await automaticSourceMap({ organization_id, workflow });
  const declared = declaredSourceMap(project, brief);
  return {
    ...automatic,
    ...declared,
  };
}

function planningDescription(source = {}) {
  const summary = object(source.planning_summary);
  if (!Object.keys(summary).length) return text(source.description) || null;
  const categories = list(summary.categories)
    .map((entry) => `${text(entry.category) || "uncategorized"}:${Number(entry.item_count || 0)}`)
    .join(", ");
  return [
    text(source.description),
    `Planning summary: ${Number(summary.item_count || 0)} items across ${Number(summary.category_count || 0)} categories${categories ? ` (${categories})` : ""}.`,
    "Use the supplied category/items paths for pagination. Do not invent or reclassify categories.",
  ].filter(Boolean).join(" ");
}

function directorSourceMap(sources = {}) {
  return Object.fromEntries(
    Object.entries(object(sources)).map(([sourceId, source]) => [
      sourceId,
      {
        ...object(source),
        description: planningDescription(source),
      },
    ]),
  );
}

async function loadContext(input = {}) {
  const [project, mission, briefs] = await Promise.all([
    CreativeProjectRuntime.get(input.creative_project_id),
    input.creative_mission_id
      ? CreativeMissionRuntime.get(input.creative_mission_id)
      : null,
    CreativeBriefRuntime.list({
      organization_id: input.organization_id,
      creative_mission_id: input.creative_mission_id || null,
      creative_project_id: input.creative_project_id,
    }),
  ]);

  if (!project || text(project.organization_id) !== text(input.organization_id)) {
    throw new Error("CREATIVE_DESIGN_PROJECT_CONTEXT_REQUIRED");
  }
  return {
    project,
    mission: mission || {},
    brief: briefs[0] || {},
  };
}

async function enrich(input, graph) {
  const workflow = text(input.creative_plan?.workflow_kind).toUpperCase();
  if (!CreativeDesignSpecificationRuntime.supports(workflow)) return graph;
  if (!list(graph.nodes).some((node) => nodeCapability(node).startsWith("creative.design."))) {
    return graph;
  }

  const context = await loadContext(input);
  const sources = await governedSourceMap({
    organization_id: input.organization_id,
    workflow,
    project: context.project,
    brief: context.brief,
  });
  const design = await CreativeDesignSpecificationRuntime.create({
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
    creative_mission_id: input.creative_mission_id || null,
    workflow_kind: workflow,
    master: { plan: input.creative_plan },
    mission: context.mission,
    project: context.project,
    brief: context.brief,
    governed_data_sources: directorSourceMap(sources),
  });

  const governance = CreativeDesignGovernanceValidationRuntime.validate({
    specification: design.specification,
  });

  const nodes = list(graph.nodes).map((node) => {
    const capability = nodeCapability(node);
    if (capability === "creative.design.compose") {
      return {
        ...node,
        requirements: {
          ...object(node.requirements),
          design_specification: design.specification,
          design_specification_hash: design.specification_hash,
          design_governance_contract: governance.contract,
        },
      };
    }
    if (capability === "creative.design.data.bind") {
      return {
        ...node,
        requirements: {
          ...object(node.requirements),
          governed_sources: sources,
          governed_source_ids: Object.keys(sources),
        },
      };
    }
    return node;
  });

  return ProductionGraphRuntime.update(graph.id, {
    nodes,
    metadata: {
      ...object(graph.metadata),
      design_specification_hash: design.specification_hash,
      design_compiled_preview_hash: design.compiled_document_hash,
      design_governance_contract: governance.contract,
      creative_partner_design_direction: true,
      governed_design_source_ids: Object.keys(sources),
      automatic_menu_source_attached:
        Object.prototype.hasOwnProperty.call(
          sources,
          CreativeDesignMenuDataSourceRuntime.source_id,
        ),
    },
  });
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const originalPlan = ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);
  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
  });
  ProductionGraphRuntime.plan = async function planWithDesign(input = {}) {
    const graph = await originalPlan(input);
    return enrich(input, graph);
  };
}

install();

export const CreativeDesignGraphRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_DESIGN_GRAPH_RUNTIME_V3",
  automatic_data_sources: Object.freeze([
    CreativeDesignMenuDataSourceRuntime.source_id,
  ]),
});
