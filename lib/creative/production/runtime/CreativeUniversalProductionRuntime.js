import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";
import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";
import {
  CreativeProductionLifecycleRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionLifecycleRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function mediumFromProject(project = {}) {
  const explicit = String(
    project.metadata?.creative_medium || project.production_type || "MULTIMEDIA",
  ).toUpperCase();
  return explicit === "VIDEO" ? "FILM" : explicit;
}

function deliverableFromProject(project = {}) {
  const metadata = project.metadata || {};
  return {
    id: metadata.deliverable_id || project.id,
    title: project.name || "Creative Deliverable",
    name: project.name || "Creative Deliverable",
    description: project.description || project.objective || "",
    objective: project.objective || project.description || "",
    medium: mediumFromProject(project),
    production_type: project.production_type,
    formats: list(metadata.formats),
    channels: list(project.target_channels),
    capabilities: list(metadata.capabilities),
    execution_capabilities: list(metadata.execution_capabilities),
    dependencies: list(metadata.dependencies),
    success_criteria: list(metadata.success_criteria),
    specifications: {
      ...(metadata.specifications || {}),
      target_duration: project.target_duration || 0,
      target_languages: list(project.target_languages),
      quality_profile: project.quality_profile,
    },
    metadata: {
      ...(metadata.deliverable_metadata || {}),
      production_role: metadata.production_role || "INDEPENDENT",
      source_project_id: project.id,
      source_mission_id: project.creative_mission_id || null,
      source_request: metadata.source_request || null,
      creative_thesis: metadata.creative_thesis || null,
      quality_policy: metadata.quality_policy || {},
      business_truth_snapshot_id: metadata.business_truth_snapshot_id || null,
    },
  };
}

async function persistGraph({
  organization_id,
  creative_project_id,
  graph,
}) {
  const existing = await ProductionGraphRuntime.list({
    organization_id,
    creative_project_id,
  });

  if (existing[0]) {
    return ProductionGraphRuntime.update(existing[0].id, {
      ...graph,
      id: existing[0].id,
      created_at: existing[0].created_at || graph.created_at,
    });
  }

  return ProductionGraphRuntime.create(graph);
}

async function persistExecution({
  organization_id,
  creative_project_id,
  graph,
}) {
  const nextPlan = await ExecutionRuntime.plan({
    organization_id,
    creative_project_id,
    production_graph: graph,
  });
  const existing = await ExecutionRuntime.list({
    organization_id,
    creative_project_id,
  });

  if (existing[0]) {
    return ExecutionRuntime.update(existing[0].id, {
      ...nextPlan,
      id: existing[0].id,
      created_at: existing[0].created_at || nextPlan.created_at,
    });
  }

  return ExecutionRuntime.create(nextPlan);
}

export const CreativeUniversalProductionRuntime = {
  isUniversalProject(project = {}) {
    return mediumFromProject(project) !== "FILM";
  },

  async execute({
    organization_id,
    creative_project_id,
    max_cycles = 1,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const project = await CreativeProjectRuntime.get(creative_project_id);
    if (!project) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
    if (project.organization_id !== organization_id) {
      throw new Error("CREATIVE_PROJECT_ORGANIZATION_MISMATCH");
    }

    const deliverable = deliverableFromProject(project);
    if (deliverable.medium === "FILM") {
      throw new Error("CREATIVE_UNIVERSAL_RUNTIME_FILM_PROJECT_NOT_SUPPORTED");
    }

    const plannedGraph = await ProductionGraphRuntime.plan({
      organization_id,
      creative_project_id,
      storyboard: null,
      scenes: [],
      shots: [],
      deliverables: [deliverable],
      creative_plan: {
        title: project.name,
        objective: project.objective,
        deliverables: [deliverable],
        quality_profile: project.quality_profile,
      },
    });
    const graph = await persistGraph({
      organization_id,
      creative_project_id,
      graph: plannedGraph,
    });
    const execution = await persistExecution({
      organization_id,
      creative_project_id,
      graph,
    });

    await CreativeProductionLifecycleRuntime.markPlanReady({
      organization_id,
      creative_project_id,
    });

    const production = await ProductionRuntime.runProduction({
      organization_id,
      creative_project_id,
      max_cycles,
    });

    return {
      success: production.failed === 0 && production.blocked === 0,
      universal: true,
      medium: deliverable.medium,
      pipeline: {
        creative_mission_id: project.creative_mission_id || null,
        creative_project_id,
        deliverable,
        graph,
        execution,
        production_lifecycle: production.lifecycle || null,
      },
      production,
    };
  },
};
