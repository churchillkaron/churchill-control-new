import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { CreativeDesignSpecificationRuntime } from "./CreativeDesignSpecificationRuntime.js";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.design.graph.v1");

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

function sourceMap(project = {}, brief = {}) {
  return object(
    brief.governed_data_sources ||
    brief.metadata?.governed_data_sources ||
    project.metadata?.governed_data_sources,
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
  const sources = sourceMap(context.project, context.brief);
  const design = await CreativeDesignSpecificationRuntime.create({
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
    creative_mission_id: input.creative_mission_id || null,
    workflow_kind: workflow,
    master: { plan: input.creative_plan },
    mission: context.mission,
    project: context.project,
    brief: context.brief,
    governed_data_sources: sources,
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
      creative_partner_design_direction: true,
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
  contract: "CREATIVE_DESIGN_GRAPH_RUNTIME_V1",
});
