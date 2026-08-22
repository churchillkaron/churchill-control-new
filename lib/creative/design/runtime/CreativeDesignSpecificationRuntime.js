import crypto from "node:crypto";

import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  composeCreativeDesignDocument,
} from "./CreativeDesignCompositionRuntime.js";

const CONTRACT = "CREATIVE_PARTNER_DESIGN_SPECIFICATION_V1";
const DESIGN_WORKFLOWS = new Set(["STILL", "DOCUMENT"]);
const FORBIDDEN_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "provider",
  "provider_id",
  "preferred_provider",
  "preferred_providers",
  "provider_parameters",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value, prefix = "design") {
  return `${prefix}:${crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function assertNoForbiddenKeys(value, path = "design_specification") {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertNoForbiddenKeys(child, `${path}.${index}`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) && child != null && child !== "") {
      throw new Error(`CREATIVE_DESIGN_SPECIFICATION_FORBIDDEN_KEY:${path}.${key}`);
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function renderableAsset(node = {}) {
  return Boolean(
    text(node.id) &&
    text(node.url) &&
    ![
      CREATIVE_ASSET_NODE_STATUS.REJECTED,
      CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ].includes(node.status),
  );
}

function assetSummary(node = {}) {
  return {
    asset_id: node.id,
    type: node.type,
    name: text(node.name) || null,
    description: text(node.description) || null,
    asset_reference: node.url,
    mime_type: node.technical?.mime_type || null,
    width: node.technical?.width || null,
    height: node.technical?.height || null,
    checksum: node.technical?.checksum || null,
    approved: node.status === CREATIVE_ASSET_NODE_STATUS.APPROVED ||
      node.review?.approved === true,
    tags: list(node.intelligence?.tags),
    restrictions: object(node.metadata?.restrictions),
    rights: object(node.metadata?.rights),
  };
}

function compactMasterPlan(master = {}) {
  const plan = object(master.plan || master);
  return {
    workflow_kind: plan.workflow_kind,
    concept: object(plan.concept),
    role_decisions: object(plan.role_decisions),
    deliverables: list(plan.deliverables),
    asset_manifest: list(plan.asset_manifest),
    quality: object(plan.quality),
    production: object(plan.production),
    creative_review: object(plan.creative_review),
    validation: object(plan.validation),
  };
}

function roleDecision(plan, roleId) {
  const decision = object(plan.role_decisions)[roleId];
  return object(decision);
}

function authorityFor(plan) {
  const art = roleDecision(plan, "art_director");
  const brand = roleDecision(plan, "brand_director");
  const copy = roleDecision(plan, "copy_director");
  if (text(art.status).toUpperCase() !== "ACTIVE") {
    throw new Error("CREATIVE_DESIGN_ART_DIRECTOR_DECISION_REQUIRED");
  }
  if (text(brand.status).toUpperCase() !== "ACTIVE") {
    throw new Error("CREATIVE_DESIGN_BRAND_DIRECTOR_DECISION_REQUIRED");
  }
  return {
    creative_master_plan_hash: digest(plan, "creative-master-plan"),
    art_direction_id: digest(art, "art-direction"),
    brand_direction_id: digest(brand, "brand-direction"),
    copy_direction_id:
      text(copy.status).toUpperCase() === "ACTIVE"
        ? digest(copy, "copy-direction")
        : null,
  };
}

function designDeliverables(plan = {}) {
  return list(plan.deliverables).map((deliverable) => ({
    id: deliverable.id || null,
    type: deliverable.type || null,
    purpose: deliverable.purpose || null,
    channels: list(deliverable.channels),
    languages: list(deliverable.languages),
    output_spec: object(deliverable.output_spec),
    production_steps: list(deliverable.production_steps).map((step) => ({
      id: step.id || null,
      title: step.title || null,
      purpose: step.purpose || null,
      service: step.service || null,
      capability: step.capability || null,
      output_spec: object(step.output_spec),
    })),
  }));
}

function dataSourceCatalog({ project = {}, brief = {}, input = {} } = {}) {
  const declared = object(
    input.governed_data_sources ||
    brief.governed_data_sources ||
    brief.metadata?.governed_data_sources ||
    project.metadata?.governed_data_sources,
  );
  return Object.entries(declared).map(([sourceId, source]) => ({
    source_id: sourceId,
    source_type: source?.source_type || null,
    description: source?.description || null,
    available_paths: list(source?.available_paths),
    dynamic: source?.dynamic !== false,
  }));
}

function resolveDecisionSpecification(decision = {}) {
  const result = object(decision.result || decision);
  return object(
    result.design_specification ||
    result.specification ||
    result.layout_specification,
  );
}

function materializeAssetReferences(specification, assetById) {
  const output = structuredClone(specification);
  for (const page of list(output.pages)) {
    for (const node of list(page.nodes)) {
      if (!["IMAGE", "VECTOR"].includes(text(node.type).toUpperCase())) continue;
      const binding = object(node.binding);
      if (Object.keys(binding).length) continue;
      const assetId = text(node.asset_id);
      if (!assetId) {
        throw new Error(`CREATIVE_DESIGN_SPECIFICATION_ASSET_ID_REQUIRED:${node.id || "unknown"}`);
      }
      const asset = assetById.get(assetId);
      if (!asset) {
        throw new Error(`CREATIVE_DESIGN_SPECIFICATION_UNKNOWN_ASSET:${node.id || "unknown"}:${assetId}`);
      }
      node.asset_id = assetId;
      node.asset_reference = asset.url;
    }
  }
  return output;
}

function assertFontBindings(specification, fontIds) {
  let textNodeCount = 0;
  for (const page of list(specification.pages)) {
    for (const node of list(page.nodes)) {
      const type = text(node.type).toUpperCase();
      if (type === "TEXT") {
        textNodeCount += 1;
        const fontId = text(node.typography?.font_asset_id);
        if (!fontIds.has(fontId)) {
          throw new Error(
            `CREATIVE_DESIGN_SPECIFICATION_FONT_NOT_VERIFIED:${node.id || "unknown"}:${fontId || "missing"}`,
          );
        }
      }
      if (type === "TABLE" && Object.keys(object(node.typography)).length) {
        const fontId = text(node.typography?.font_asset_id);
        if (!fontIds.has(fontId)) {
          throw new Error(
            `CREATIVE_DESIGN_SPECIFICATION_TABLE_FONT_NOT_VERIFIED:${node.id || "unknown"}:${fontId || "missing"}`,
          );
        }
      }
    }
  }
  if (textNodeCount > 0 && fontIds.size === 0) {
    throw new Error("CREATIVE_DESIGN_EXACT_FONT_ASSET_REQUIRED");
  }
}

function assertBindingSources(specification, availableSources) {
  if (!availableSources.size) return;
  const documentBindings = object(specification.data_bindings);
  for (const page of list(specification.pages)) {
    for (const node of list(page.nodes)) {
      const binding = object(node.binding || documentBindings[node.id]);
      if (!Object.keys(binding).length) continue;
      const sourceId = text(binding.source_id || binding.source);
      if (!availableSources.has(sourceId)) {
        throw new Error(
          `CREATIVE_DESIGN_SPECIFICATION_DATA_SOURCE_NOT_GOVERNED:${node.id || "unknown"}:${sourceId || "missing"}`,
        );
      }
    }
  }
}

function normalizeSpecification({
  decision,
  authority,
  workflowKind,
  assetNodes,
  dataSources,
}) {
  const raw = resolveDecisionSpecification(decision);
  if (!Object.keys(raw).length) {
    throw new Error("CREATIVE_DESIGN_SPECIFICATION_REASONING_RESULT_REQUIRED");
  }
  assertNoForbiddenKeys(raw);

  const assetById = new Map(assetNodes.map((node) => [text(node.id), node]));
  const fontIds = new Set(
    assetNodes
      .filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.FONT)
      .map((node) => text(node.id)),
  );
  const availableSources = new Set(dataSources.map((source) => source.source_id));
  const specification = materializeAssetReferences({
    ...raw,
    authority,
    metadata: {
      ...object(raw.metadata),
      workflow_kind: workflowKind,
      design_specification_contract: CONTRACT,
      generated_by: "AVANTIQO_CREATIVE_PARTNER_AND_DIRECTORS",
      provider_selection_exposed: false,
      prompt_persisted: false,
    },
  }, assetById);

  assertFontBindings(specification, fontIds);
  assertBindingSources(specification, availableSources);
  return specification;
}

async function availableAssetNodes({ organization_id, creative_project_id, asset_nodes }) {
  const nodes = Array.isArray(asset_nodes)
    ? asset_nodes
    : await CreativeAssetGraphRuntime.list({
        organization_id,
        creative_project_id,
      });
  return list(nodes).filter((node) =>
    text(node.organization_id) === text(organization_id) &&
    (!node.creative_project_id ||
      text(node.creative_project_id) === text(creative_project_id)) &&
    renderableAsset(node),
  );
}

function reasoningOutputShape() {
  return {
    result: {
      design_specification: {
        title: "string",
        unit: "px|pt|mm|cm|in",
        pages: [
          {
            id: "string",
            width: "positive number",
            height: "positive number",
            unit: "px|pt|mm|cm|in",
            background: "color or null",
            bleed: "object",
            safe_area: "object",
            nodes: [
              {
                id: "string",
                type: "TEXT|IMAGE|VECTOR|SHAPE|TABLE|QR|BARCODE",
                frame: { x: "number", y: "number", width: "positive number", height: "positive number" },
                content: "exact verified copy when static; omit for governed dynamic binding",
                asset_id: "exact supplied asset id for IMAGE/VECTOR",
                typography: {
                  font_asset_id: "exact supplied FONT asset id",
                  font_size: "positive number",
                  font_weight: "number|string",
                  line_height: "number",
                  letter_spacing: "number",
                  align: "left|center|right",
                },
                binding: {
                  source_id: "exact supplied governed source id",
                  path: "exact available data path",
                  format: "TEXT|UPPERCASE|LOWERCASE|NUMBER|CURRENCY|DATE",
                },
                locked: "boolean",
              },
            ],
          },
        ],
        data_bindings: "object",
        export_spec: "object",
        metadata: "object",
      },
      design_decisions: ["concise inspectable decision"],
      missing_requirements: ["only genuine blocker"],
    },
  };
}

async function createReasonedSpecification({
  organization_id,
  workflowKind,
  masterPlan,
  mission,
  project,
  brief,
  assetNodes,
  dataSources,
}) {
  const authority = authorityFor(masterPlan);
  const assets = assetNodes.map(assetSummary);
  const fonts = assets.filter((asset) => asset.type === CREATIVE_ASSET_NODE_TYPES.FONT);

  const decision = await reason({
    task:
      "Act as the Avantiqo Art/Brand/Copy design-direction worker behind the Creative Partner. Convert the approved Creative Master Plan into one exact editable design specification for the Avantiqo Layout & Typesetting Engine. Make the composition decision: page/artboard geometry, hierarchy, grid, typography, exact source-asset placement, data-bound regions and export intent. Do not use a fixed poster/menu/brochure template. Do not choose AI providers. Do not write image-generator prompts. Never invent a logo, font, price, product, date, legal fact or other business truth. Use only exact supplied asset ids and governed data source ids. Generated imagery, when the master plan requires it, is represented only as a later governed asset dependency and must never contain final typography or exact logos inside pixels.",
    input: {
      organization_id,
      workflow_kind: workflowKind,
      mission: object(mission),
      project: object(project),
      brief: object(brief),
      creative_master_plan: compactMasterPlan(masterPlan),
      director_authority: authority,
      deliverables: designDeliverables(masterPlan),
      available_assets: assets,
      exact_font_assets: fonts,
      governed_data_sources: dataSources,
      architecture: {
        image_engine_role: "VISUAL_ASSET_GENERATION_AND_REPAIR_ONLY",
        design_engine_role: "EXACT_LAYOUT_TYPESETTING_VECTOR_DATA_AND_EXPORT",
        structured_design_document: "CREATIVE_DESIGN_DOCUMENT_V1",
        final_text_generated_inside_image_pixels: false,
        exact_logo_redrawing_by_generation: false,
        repair_model: "BOUNDED_NODE_LEVEL",
      },
    },
    constraints: {
      preserve_master_plan: true,
      preserve_locked_brand_assets: true,
      exact_fonts_only_from_available_assets: true,
      exact_business_data_only_from_governed_sources_or_verified_master_plan: true,
      no_templates: true,
      no_provider_selection: true,
      no_generator_prompts: true,
      output_must_be_editable_structured_composition: true,
      raw_reasoning_persisted: false,
    },
    outputShape: reasoningOutputShape(),
    temperature: 0.35,
  });

  const missing = list(decision?.result?.missing_requirements).map(text).filter(Boolean);
  if (missing.length) {
    const error = new Error(`CREATIVE_DESIGN_SPECIFICATION_BLOCKED:${missing.join(" | ")}`);
    error.missing_requirements = missing;
    throw error;
  }

  const specification = normalizeSpecification({
    decision,
    authority,
    workflowKind,
    assetNodes,
    dataSources,
  });
  const compiled = composeCreativeDesignDocument({
    organization_id,
    creative_project_id: project.id || project.creative_project_id,
    creative_mission_id:
      mission.id || project.creative_mission_id || null,
    specification,
  });

  return {
    success: true,
    contract: CONTRACT,
    specification,
    specification_hash: digest(specification, "design-specification"),
    compiled_document_hash: compiled.document_hash,
    compiled_preview: compiled.document,
    design_decisions: list(decision?.result?.design_decisions).map(text).filter(Boolean),
    authority,
    reasoning_source: decision.execution_source || "governed_service_runtime",
    reasoning_confidence: Number(decision.confidence || 0),
    raw_reasoning_persisted: false,
    provider_selection_exposed: false,
    prompt_persisted: false,
  };
}

export const CreativeDesignSpecificationRuntime = Object.freeze({
  contract: CONTRACT,
  workflows: Object.freeze([...DESIGN_WORKFLOWS]),

  supports(workflowKind) {
    return DESIGN_WORKFLOWS.has(text(workflowKind).toUpperCase());
  },

  async create({
    organization_id,
    creative_project_id,
    creative_mission_id = null,
    workflow_kind,
    master,
    mission = {},
    project = {},
    brief = {},
    asset_nodes = null,
    governed_data_sources = null,
  } = {}) {
    const organizationId = text(organization_id);
    const projectId = text(creative_project_id || project.id);
    const workflowKind = text(workflow_kind || master?.plan?.workflow_kind || master?.workflow_kind).toUpperCase();
    if (!organizationId) throw new Error("CREATIVE_DESIGN_SPECIFICATION_ORGANIZATION_REQUIRED");
    if (!projectId) throw new Error("CREATIVE_DESIGN_SPECIFICATION_PROJECT_REQUIRED");
    if (!DESIGN_WORKFLOWS.has(workflowKind)) {
      throw new Error(`CREATIVE_DESIGN_SPECIFICATION_WORKFLOW_UNSUPPORTED:${workflowKind || "UNKNOWN"}`);
    }

    const masterPlan = compactMasterPlan(master);
    if (masterPlan.validation?.passed !== true) {
      throw new Error("CREATIVE_DESIGN_SPECIFICATION_VALIDATED_MASTER_PLAN_REQUIRED");
    }

    const nodes = await availableAssetNodes({
      organization_id: organizationId,
      creative_project_id: projectId,
      asset_nodes,
    });
    const sources = Array.isArray(governed_data_sources)
      ? governed_data_sources
      : dataSourceCatalog({ project, brief, input: { governed_data_sources } });

    return createReasonedSpecification({
      organization_id: organizationId,
      workflowKind,
      masterPlan,
      mission: { ...object(mission), id: creative_mission_id || mission.id || null },
      project: { ...object(project), id: projectId },
      brief,
      assetNodes: nodes,
      dataSources: sources,
    });
  },

  normalizeDecision({
    decision,
    master,
    workflow_kind,
    asset_nodes = [],
    governed_data_sources = [],
  } = {}) {
    const masterPlan = compactMasterPlan(master);
    return normalizeSpecification({
      decision,
      authority: authorityFor(masterPlan),
      workflowKind: text(workflow_kind || masterPlan.workflow_kind).toUpperCase(),
      assetNodes: list(asset_nodes).filter(renderableAsset),
      dataSources: list(governed_data_sources),
    });
  },
});

export default CreativeDesignSpecificationRuntime;
