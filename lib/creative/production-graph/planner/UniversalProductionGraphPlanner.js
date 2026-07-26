import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

const SUPPORTED_WORKFLOWS = new Set([
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function slug(value, fallback = "deliverable") {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map(text).filter(Boolean))];
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  return text(value?.asset_id || value?.id);
}

function workflowKind(plan = {}) {
  return text(plan.workflow_kind).toUpperCase();
}

function deliverableType(deliverable = {}) {
  return text(deliverable.type).toUpperCase();
}

function normalizeStep(step = {}, index, deliverable) {
  const service = text(step.service || step.service_code || step.capability);
  const capability = text(step.capability || service);
  if (!service || !capability) {
    throw new Error(
      `CREATIVE_UNIVERSAL_STEP_CAPABILITY_REQUIRED:${deliverable.id}:${index + 1}`,
    );
  }

  return {
    id: text(step.id) || `step-${index + 1}`,
    title: text(step.title) || `Production step ${index + 1}`,
    purpose: text(step.purpose || step.description),
    service,
    capability,
    depends_on: unique(step.depends_on),
    output_spec: object(step.output_spec),
    requirements: object(step.requirements),
    provider_prompt: text(step.provider_prompt),
    provider_parameters: object(step.provider_parameters),
    estimated_cost: Number(step.estimated_cost || 0),
    estimated_seconds: Number(step.estimated_seconds || 0),
    quality_gate: step.quality_gate === true,
    metadata: object(step.metadata),
  };
}

function defaultSteps(kind, deliverable) {
  const type = deliverableType(deliverable);
  const output = object(deliverable.output_spec);
  const base = {
    deliverable_id: deliverable.id,
    deliverable_type: type,
    output_spec: output,
  };

  if (kind === "STILL" || ["IMAGE", "POSTER", "BANNER", "KEY_ART"].includes(type)) {
    return [
      {
        id: "compose",
        title: "Create approved key visual",
        purpose: "Create the final composition from the creative thesis, exact assets, copy and output specification.",
        service: "ai.image.generate",
        capability: "ai.image.generate",
        output_spec: output,
        metadata: base,
      },
      {
        id: "quality",
        title: "Review still-image quality",
        purpose: "Evaluate identity, product, brand, anatomy, realism, composition, typography safety and channel fitness.",
        service: "ai.image.analyze",
        capability: "ai.image.analyze",
        depends_on: ["compose"],
        quality_gate: true,
        output_spec: { report: "structured_json" },
        metadata: base,
      },
    ];
  }

  if (kind === "DOCUMENT" || ["DOCUMENT", "MENU", "PRESENTATION", "REPORT", "BROCHURE"].includes(type)) {
    return [
      {
        id: "structure",
        title: "Design information architecture",
        purpose: "Resolve hierarchy, sections, data requirements, audience flow and factual evidence before writing.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        output_spec: { format: "structured_content_architecture" },
        metadata: base,
      },
      {
        id: "copy",
        title: "Write and validate audience-facing copy",
        purpose: "Produce brand-correct, factual, channel-appropriate copy under Copy Director accountability.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["structure"],
        output_spec: { format: "structured_copy_deck" },
        metadata: base,
      },
      {
        id: "assemble",
        title: "Assemble document deliverable",
        purpose: "Combine approved content, assets, typography, layout and output rules into the requested deliverable.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["copy"],
        output_spec: output,
        metadata: base,
      },
      {
        id: "quality",
        title: "Review document quality",
        purpose: "Validate content truth, hierarchy, legibility, brand, accessibility, data completeness and export fitness.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["assemble"],
        quality_gate: true,
        output_spec: { report: "structured_json" },
        metadata: base,
      },
    ];
  }

  if (kind === "INTERACTIVE" || ["WEBSITE", "LANDING_PAGE", "WEBPAGE", "EXPERIENCE"].includes(type)) {
    return [
      {
        id: "architecture",
        title: "Design experience architecture",
        purpose: "Resolve information architecture, journeys, responsive states, conversion logic and accessibility requirements.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        output_spec: { format: "experience_architecture" },
        metadata: base,
      },
      {
        id: "content",
        title: "Create interactive content system",
        purpose: "Create brand-correct copy, media assignments, calls to action and component content contracts.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["architecture"],
        output_spec: { format: "content_system" },
        metadata: base,
      },
      {
        id: "build",
        title: "Build interactive deliverable",
        purpose: "Implement the requested responsive experience from the approved architecture and content system.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["content"],
        output_spec: output,
        metadata: base,
      },
      {
        id: "quality",
        title: "Test interactive quality",
        purpose: "Validate runtime behaviour, responsive layout, accessibility, security boundaries, content truth and conversion journeys.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["build"],
        quality_gate: true,
        output_spec: { report: "structured_json" },
        metadata: base,
      },
    ];
  }

  if (kind === "SOFTWARE" || ["APPLICATION", "APP", "SOFTWARE"].includes(type)) {
    return [
      {
        id: "architecture",
        title: "Design software architecture",
        purpose: "Resolve requirements, components, data contracts, security, test strategy and deployment evidence.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        output_spec: { format: "software_architecture" },
        metadata: base,
      },
      {
        id: "build",
        title: "Implement software deliverable",
        purpose: "Create the requested implementation from the approved architecture without hidden industry assumptions.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["architecture"],
        output_spec: output,
        metadata: base,
      },
      {
        id: "quality",
        title: "Test software quality",
        purpose: "Validate requirements, security, correctness, accessibility, performance, failure handling and deployment readiness.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["build"],
        quality_gate: true,
        output_spec: { report: "structured_json" },
        metadata: base,
      },
    ];
  }

  if (kind === "AUDIO" || ["AUDIO", "VOICE", "MUSIC", "PODCAST", "SOUND_DESIGN"].includes(type)) {
    return [
      {
        id: "direction",
        title: "Create audio direction and script",
        purpose: "Resolve structure, voice, performance, pronunciation, music, sound design, silence and mix intent.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        output_spec: { format: "audio_production_plan" },
        metadata: base,
      },
      {
        id: "produce",
        title: "Produce audio deliverable",
        purpose: "Generate or assemble the requested audio according to the approved performance and sound direction.",
        service: text(output.service || output.capability) || "ai.audio.generate",
        capability: text(output.capability || output.service) || "ai.audio.generate",
        depends_on: ["direction"],
        output_spec: output,
        metadata: base,
      },
      {
        id: "quality",
        title: "Review audio quality",
        purpose: "Validate performance, intelligibility, timing, artefacts, mix hierarchy, loudness and delivery fitness.",
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        depends_on: ["produce"],
        quality_gate: true,
        output_spec: { report: "structured_json" },
        metadata: base,
      },
    ];
  }

  return [
    {
      id: "produce",
      title: "Produce campaign deliverable",
      purpose: "Produce the requested campaign-system component from the accountable agency plan.",
      service: text(output.service || output.capability) || "ai.reasoning.execute",
      capability: text(output.capability || output.service) || "ai.reasoning.execute",
      output_spec: output,
      metadata: base,
    },
    {
      id: "quality",
      title: "Review campaign deliverable",
      purpose: "Validate creative coherence, factual truth, brand consistency, channel fitness and release requirements.",
      service: "ai.reasoning.execute",
      capability: "ai.reasoning.execute",
      depends_on: ["produce"],
      quality_gate: true,
      output_spec: { report: "structured_json" },
      metadata: base,
    },
  ];
}

function assetAssignments(plan, deliverables) {
  const knownTargets = new Set(deliverables.map((item) => text(item.id)));
  const direct = new Map();
  const references = new Map();

  for (const entry of list(plan.asset_manifest)) {
    const id = assetId(entry);
    if (!id) throw new Error("CREATIVE_UNIVERSAL_ASSET_ID_REQUIRED");
    const disposition = text(entry.disposition).toUpperCase();
    if (disposition === "EXCLUDE") continue;
    if (!["ASSIGNED", "REFERENCE", "REGENERATE"].includes(disposition)) {
      throw new Error(`CREATIVE_UNIVERSAL_ASSET_DISPOSITION_INVALID:${id}`);
    }
    const targets = unique(entry.assignments);
    if (!targets.length) {
      throw new Error(`CREATIVE_UNIVERSAL_ASSET_ASSIGNMENT_REQUIRED:${id}`);
    }
    for (const target of targets) {
      if (!knownTargets.has(target)) {
        throw new Error(`CREATIVE_UNIVERSAL_ASSET_TARGET_UNKNOWN:${id}:${target}`);
      }
      const map = disposition === "ASSIGNED" ? direct : references;
      map.set(target, [
        ...(map.get(target) || []),
        disposition === "ASSIGNED"
          ? id
          : {
              asset_id: id,
              disposition,
              restrictions: object(entry.restrictions),
              continuity_anchors: object(entry.continuity_anchors),
              repair_requirements: list(entry.repair_requirements),
            },
      ]);
    }
  }

  return { direct, references };
}

export function buildUniversalProductionGraph({
  organization_id,
  creative_mission_id = null,
  creative_project_id,
  creative_plan = {},
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  const kind = workflowKind(creative_plan);
  if (!SUPPORTED_WORKFLOWS.has(kind)) {
    throw new Error(`CREATIVE_UNIVERSAL_WORKFLOW_UNSUPPORTED:${kind || "UNKNOWN"}`);
  }
  if (!creative_plan.validation?.passed) {
    throw new Error("CREATIVE_MASTER_PLAN_VALIDATION_REQUIRED");
  }
  if (creative_plan.degraded === true) {
    throw new Error("CREATIVE_DEGRADED_DIRECTION_RELEASE_BLOCKED");
  }

  const deliverables = list(creative_plan.deliverables).map((item, index) => ({
    ...item,
    id: text(item.id) || `deliverable-${index + 1}`,
  }));
  if (!deliverables.length) {
    throw new Error("CREATIVE_UNIVERSAL_DELIVERABLES_REQUIRED");
  }

  const assets = assetAssignments(creative_plan, deliverables);
  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    title: text(creative_plan.concept?.title),
    description: text(creative_plan.concept?.narrative || creative_plan.concept?.message),
    cost_plan: {
      currency: creative_plan.production?.currency || null,
      approval_required: creative_plan.production?.cost_approval_required ?? null,
      approved: creative_plan.production?.cost_approved ?? null,
    },
    production_plan: {
      quality_profile: creative_plan.production?.quality_profile || null,
      draft_first: creative_plan.production?.draft_first ?? null,
      reuse_assets: creative_plan.production?.reuse_assets ?? null,
      provider_strategy: creative_plan.production?.provider_strategy || null,
      render_modes: creative_plan.production?.render_modes || [],
    },
    metadata: {
      contract: "CREATIVE_UNIVERSAL_PRODUCTION_GRAPH_V1",
      workflow_kind: kind,
      creative_mission_id,
      deliverables,
      role_decisions: object(creative_plan.role_decisions),
      quality_policy: object(creative_plan.quality),
      asset_manifest: list(creative_plan.asset_manifest),
      master_plan_validation: creative_plan.validation,
    },
  });

  const finalNodeIds = [];
  for (const deliverable of deliverables) {
    const key = slug(deliverable.id);
    const declared = list(deliverable.production_steps || deliverable.execution_steps);
    const steps = (declared.length ? declared : defaultSteps(kind, deliverable))
      .map((step, index) => normalizeStep(step, index, deliverable));
    const nodeIds = new Map();

    for (const [index, step] of steps.entries()) {
      const nodeId = `deliverable:${key}:${slug(step.id, `step-${index + 1}`)}`;
      nodeIds.set(step.id, nodeId);
      const directAssets = unique(assets.direct.get(deliverable.id) || []);
      const referenceAssets = list(assets.references.get(deliverable.id));
      const prompt = step.provider_prompt || [
        `Execute ${step.title} for deliverable ${deliverable.id}.`,
        `Workflow: ${kind}. Deliverable type: ${deliverable.type}.`,
        `Creative thesis: ${text(creative_plan.concept?.creative_thesis)}.`,
        `Purpose: ${text(deliverable.purpose)}.`,
        `Step purpose: ${step.purpose}.`,
        `Use accountable role decisions, exact supplied assets, output specification and quality policy.`,
      ].filter(Boolean).join("\n");

      graph.nodes.push(createProductionNode({
        id: nodeId,
        type: step.quality_gate ? "ASSET" : "RENDER",
        title: step.title,
        description: step.purpose,
        intent: {
          workflow_kind: kind,
          deliverable_id: deliverable.id,
          deliverable_type: deliverable.type,
          purpose: deliverable.purpose,
          step_purpose: step.purpose,
        },
        requirements: {
          ...step.requirements,
          concept: object(creative_plan.concept),
          role_decisions: object(creative_plan.role_decisions),
          quality_policy: object(creative_plan.quality),
          channels: list(deliverable.channels),
          languages: list(deliverable.languages),
          output_spec: {
            ...object(deliverable.output_spec),
            ...step.output_spec,
          },
          reference_assets: referenceAssets,
        },
        assets: directAssets,
        generation: {
          required: true,
          service: step.service,
          capability: step.capability,
          provider_prompt: prompt,
          provider_parameters: step.provider_parameters,
          output_spec: {
            ...object(deliverable.output_spec),
            ...step.output_spec,
          },
          estimated_cost: step.estimated_cost,
          estimated_seconds: step.estimated_seconds,
          status: "WAITING",
        },
        metadata: {
          ...step.metadata,
          workflow_kind: kind,
          deliverable_id: deliverable.id,
          deliverable_type: deliverable.type,
          production_step_id: step.id,
          production_step_index: index,
          quality_gate: step.quality_gate,
          reference_asset_ids: referenceAssets.map(assetId).filter(Boolean),
          release_candidate: index === steps.length - 1,
        },
      }));
    }

    for (const [index, step] of steps.entries()) {
      const to = nodeIds.get(step.id);
      const dependencies = step.depends_on.length
        ? step.depends_on
        : index > 0
          ? [steps[index - 1].id]
          : [];
      for (const dependency of dependencies) {
        const from = nodeIds.get(dependency);
        if (!from) {
          throw new Error(
            `CREATIVE_UNIVERSAL_STEP_DEPENDENCY_UNKNOWN:${deliverable.id}:${step.id}:${dependency}`,
          );
        }
        graph.edges.push(createProductionEdge({
          from,
          to,
          type: "DEPENDS_ON",
          metadata: { deliverable_id: deliverable.id },
        }));
      }
    }

    finalNodeIds.push(nodeIds.get(steps[steps.length - 1].id));
  }

  if (kind === "CAMPAIGN_SYSTEM" && finalNodeIds.length > 1) {
    const nodeId = "campaign-system:coherence-quality";
    graph.nodes.push(createProductionNode({
      id: nodeId,
      type: "ASSET",
      title: "Review campaign-system coherence",
      description: "Validate that all deliverables operate as one coherent campaign system without duplicated filler or contradictory brand decisions.",
      intent: { workflow_kind: kind, purpose: "cross-deliverable quality" },
      requirements: {
        deliverables,
        concept: object(creative_plan.concept),
        role_decisions: object(creative_plan.role_decisions),
        quality_policy: object(creative_plan.quality),
      },
      generation: {
        required: true,
        service: "ai.reasoning.execute",
        capability: "ai.reasoning.execute",
        provider_prompt: "Review every campaign deliverable together for strategic coherence, originality, factual truth, brand consistency, channel fitness, accessibility and release readiness. Return structured JSON with failures and bounded repair instructions.",
        output_spec: { report: "structured_json" },
        status: "WAITING",
      },
      metadata: {
        workflow_kind: kind,
        quality_gate: true,
        release_candidate: true,
      },
    }));
    for (const from of finalNodeIds) {
      graph.edges.push(createProductionEdge({
        from,
        to: nodeId,
        type: "DEPENDS_ON",
      }));
    }
  }

  return graph;
}
