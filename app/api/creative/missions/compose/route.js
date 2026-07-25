export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

import { NextResponse } from "next/server";

import {
  enforceCreativeDeliverableContract,
} from "@/lib/creative/intent/CreativeDeliverableContract";
import {
  CreativeMissionComposerRuntime,
} from "@/lib/creative/intent/CreativeMissionComposerRuntime";
import {
  CreativeSystemKnowledgeRuntime,
} from "@/lib/creative/knowledge/CreativeSystemKnowledgeRuntime";
import {
  CreativeBusinessTruthRuntime,
} from "@/lib/creative/knowledge/CreativeBusinessTruthRuntime";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CreativeMissionEvidenceSelectionRuntime,
} from "@/lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const TEMPORAL_MEDIA = new Set(["FILM", "AUDIO"]);

function text(value) {
  return String(value || "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function projectProductionType(medium = "") {
  const value = String(medium).trim().toUpperCase();
  if (["FILM", "VIDEO", "MOVIE", "TRAILER", "REEL", "CUTDOWN", "EPISODE"].includes(value)) {
    return "VIDEO";
  }
  if (["IMAGE", "PHOTO", "POSTER", "BANNER", "KEY ART", "STILL"].includes(value)) {
    return "IMAGE";
  }
  if (["WEBSITE", "WEBPAGE", "LANDING", "WEB EXPERIENCE", "WEB_ASSET"].includes(value)) {
    return "WEBSITE";
  }
  if (value === "MENU") return "MENU";
  if (["AUDIO", "MUSIC", "VOICE", "SOUND"].includes(value)) return "AUDIO";
  if (["DOCUMENT", "COPY", "SCRIPT"].includes(value)) return "DOCUMENT";
  if (["PRESENTATION", "DECK"].includes(value)) return "PRESENTATION";
  return "MULTIMEDIA";
}

function durationSeconds(specifications = {}, fallback = 0) {
  const candidateGroups = [
    specifications.duration_seconds,
    specifications.target_duration,
    specifications.runtime,
    specifications.duration,
    specifications.durations,
    specifications.max_duration,
  ];

  for (const candidateGroup of candidateGroups) {
    const candidates = Array.isArray(candidateGroup)
      ? candidateGroup
      : [candidateGroup];
    const parsed = [];

    for (const candidate of candidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) {
        parsed.push(Math.round(numeric));
        continue;
      }

      const match = String(candidate || "").match(
        /(\d+(?:\.\d+)?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?))?\s*(?:seconds?|secs?|s)\b/i,
      );
      if (!match) continue;

      const lower = Number(match[1]);
      const upper = Number(match[2] || match[1]);
      if (lower > 0 && upper > 0) {
        parsed.push(Math.round(Math.max(lower, upper)));
      }
    }

    if (parsed.length) return Math.max(...parsed);
  }

  return fallback;
}

function projectPayload({
  organization_id,
  mission,
  deliverable,
  blueprint,
  knowledge,
  businessTruth,
  masterProjectId = null,
}) {
  const medium = String(deliverable.medium || "MULTIMEDIA").toUpperCase();
  const productionType = projectProductionType(medium);
  const temporalFallback = TEMPORAL_MEDIA.has(medium) ? 30 : 0;

  return {
    organization_id,
    creative_mission_id: mission.id,
    name: deliverable.title,
    description: deliverable.description,
    objective: deliverable.description || blueprint.objective,
    production_type: productionType,
    target_channels: list(deliverable.channels),
    target_languages: list(blueprint.languages),
    target_duration: durationSeconds(deliverable.specifications, temporalFallback),
    quality_profile: "WORLD_CLASS",
    budget_profile: "MISSION_CONTROLLED",
    metadata: {
      creative_medium: medium,
      deliverable_id: deliverable.id,
      formats: list(deliverable.formats),
      capabilities: list(deliverable.capabilities),
      execution_capabilities: list(deliverable.execution_capabilities),
      dependencies: list(deliverable.dependencies),
      success_criteria: list(deliverable.success_criteria),
      specifications: deliverable.specifications || {},
      deliverable_metadata: deliverable.metadata || {},
      production_role: deliverable.metadata?.production_role || "INDEPENDENT",
      master_project_id:
        deliverable.metadata?.production_role === "CUTDOWN"
          ? masterProjectId
          : null,
      derivative_policy:
        deliverable.metadata?.production_role === "CUTDOWN"
          ? "DERIVE_FROM_APPROVED_MASTER_TIMELINE"
          : null,
      mission_workflow: list(blueprint.workflow),
      mission_departments: list(blueprint.departments),
      creative_thesis: blueprint.creative_thesis,
      production_mode: blueprint.production_mode,
      decision_gates: list(blueprint.decision_gates),
      optional_real_world_extensions: list(blueprint.optional_real_world_extensions),
      quality_policy: blueprint.quality_policy || {},
      composition_source: blueprint.composition_source,
      composition_confidence: blueprint.confidence,
      source_request: mission.metadata?.source_request || blueprint.objective,
      knowledge_policy: knowledge.source_policy,
      canonical_source_ids: list(knowledge.sources).map((source) => source.id),
      business_truth_snapshot_id: businessTruth.snapshot_id,
      business_truth_payload_hash: businessTruth.payload_hash,
      business_truth_schema_version: businessTruth.schema_version,
      business_truth_record_counts: businessTruth.record_counts,
      business_truth_source_manifest: businessTruth.source_manifest,
    },
  };
}

function assertProductionReadyBlueprint(blueprint = {}) {
  if (blueprint.composition_source !== "AI_DIRECTOR" || blueprint.fallback_reason) {
    const error = new Error(
      blueprint.fallback_reason || "CREATIVE_AI_DIRECTOR_REQUIRED",
    );
    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
    // CREATIVE_DIRECTOR_DIAGNOSTICS_V8
    error.details = blueprint.fallback_details || null;
    throw error;
  }

  if (Number(blueprint.confidence || 0) < 70) {
    const error = new Error("CREATIVE_AI_DIRECTOR_CONFIDENCE_TOO_LOW");
    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
    throw error;
  }

  if (!Array.isArray(blueprint.deliverables) || !blueprint.deliverables.length) {
    const error = new Error("CREATIVE_AI_DIRECTOR_DELIVERABLES_REQUIRED");
    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
    throw error;
  }

  for (const deliverable of blueprint.deliverables) {
    if (!deliverable.id || !deliverable.title || !deliverable.medium) {
      const error = new Error("CREATIVE_AI_DIRECTOR_DELIVERABLE_CONTRACT_INVALID");
      error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
      throw error;
    }
  }
}

function requestedMediaFromRequest(value = "") {
  const request = String(value || "").toLowerCase();
  const media = new Set();
  if (/\b(film|video|movie|trailer|reel|cutdown|episode|commercial)\b/.test(request)) {
    media.add("FILM");
  }
  if (/\b(image|photo|poster|banner|key\s*art|still|visual)\b/.test(request)) {
    media.add("IMAGE");
  }
  if (/\b(audio|music|song|voice|sound|sfx|foley)\b/.test(request)) {
    media.add("AUDIO");
  }
  if (/\b(website|webpage|landing\s*page|web\s*experience|web\s*builder)\b/.test(request)) {
    media.add("WEBSITE");
  }
  if (/\bmenu\b/.test(request)) media.add("MENU");
  if (/\b(document|article|report|brochure|press\s*release|script|copy)\b/.test(request)) {
    media.add("DOCUMENT");
  }
  if (/\b(presentation|deck|slides?)\b/.test(request)) {
    media.add("PRESENTATION");
  }
  return [...media];
}

function ensureExplicitRequestedDeliverables(blueprint = {}, request = "") {
  const requestedMedia = requestedMediaFromRequest(request);
  if (!requestedMedia.length) return blueprint;

  let deliverables = list(blueprint.deliverables);
  if (!requestedMedia.includes("FILM")) {
    deliverables = deliverables.filter(
      (deliverable) => String(deliverable.medium || "").toUpperCase() !== "FILM",
    );
  }

  const existing = new Set(
    deliverables.map((deliverable) => String(deliverable.medium || "").toUpperCase()),
  );
  const titleByMedium = {
    FILM: "Requested Film",
    IMAGE: "Requested Image Production",
    AUDIO: "Requested Audio Production",
    WEBSITE: "Requested Web Experience",
    MENU: "Requested Menu System",
    DOCUMENT: "Requested Document Package",
    PRESENTATION: "Requested Presentation",
  };

  for (const requestedMedium of requestedMedia) {
    if (existing.has(requestedMedium)) continue;
    deliverables.push({
      id: `explicit_${requestedMedium.toLowerCase()}`,
      title: titleByMedium[requestedMedium],
      description: request,
      medium: requestedMedium,
      formats: [],
      channels: [],
      capabilities: [],
      execution_capabilities: [],
      dependencies: [],
      success_criteria: [],
      specifications: {},
      metadata: {
        source: "EXPLICIT_USER_REQUEST",
        production_role: "INDEPENDENT",
      },
    });
  }

  return enforceCreativeDeliverableContract({
    ...blueprint,
    deliverables,
  });
}

function orderedDeliverables(deliverables = []) {
  return [
    ...deliverables.filter((item) => item.metadata?.production_role === "MASTER"),
    ...deliverables.filter((item) => item.metadata?.production_role !== "MASTER"),
  ];
}

// CREATIVE_MISSION_RELEVANT_EVIDENCE_IMPORT_V4
async function importBusinessEvidence({
  organization_id,
  creative_project_id,
  businessTruth,
  request,
  blueprint,
  supplied_assets = [],
}) {
  const selection = CreativeMissionEvidenceSelectionRuntime.select({
    request,
    blueprint,
    business_truth: businessTruth,
    supplied_assets,
  });

  if (!creative_project_id) {
    return {
      nodes: [],
      selection,
    };
  }

  const nodes = await Promise.all(
    selection.assets.map((asset) =>
      CreativeAssetGraphRuntime.create({
        organization_id,
        creative_project_id,
        creative_asset_id: asset.id,
        type: String(asset.type || "IMAGE").toUpperCase(),
        status: "IMPORTED",
        name: asset.name || "Imported Reference",
        description:
          asset.description ||
          "Mission-matched organization-scoped production reference",
        url: asset.url || asset.thumbnail_url || null,
        lineage: {
          source: "creative_assets",
          provider_id: null,
          capability: "creative.reference.import",
          generation_version: 1,
        },
        intelligence: {
          quality_score: Number(asset.analysis?.quality_score || 0),
          tags: list(asset.tags),
        },
        reuse: {
          reusable: true,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: false,
          human_reviewed: false,
          approved: false,
          notes:
            "Imported as mission-matched production evidence. Rights and reuse approval remain separate gates.",
        },
        metadata: {
          evidence_role: "MISSION_REFERENCE",
          evidence_roles: list(asset.evidence_roles),
          reference_roles: list(asset.reference_roles),
          source_asset_id: asset.id,
          rights_status: "UNVERIFIED",
          evidence_selection_version: selection.version,
          evidence_selection: asset.selection || {},
          arbitrary_organization_asset_fallback: false,
        },
      }),
    ),
  );

  return {
    nodes,
    selection,
  };
}

function invalidDirectorError(error) {
  return (
    error?.code === "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT" ||
    String(error?.message || "").startsWith("OPENAI_STRUCTURED_JSON_") ||
    String(error?.message || "").startsWith("AI_DIRECTOR_")
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organization_id = body.organization_id || body.organizationId || null;
    const creativeRequest = text(body.request || body.prompt || body.objective);

    if (!organization_id) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    if (!creativeRequest) {
      return NextResponse.json({ success: false, error: "creative request required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId: organization_id });
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    const entity_id = body.entity_id || null;
    const period_id = body.period_id || null;
    const knowledge = CreativeSystemKnowledgeRuntime.resolve({
      organization_id,
      entity_id,
      period_id,
    });
    const businessTruth = await CreativeBusinessTruthRuntime.hydrate({
      organization_id,
      entity_id,
      period_id,
      captured_by: access.user?.id || access.user_id || null,
      persist: true,
    });

    const composedBlueprint = await CreativeMissionComposerRuntime.compose({
      organization_id,
      request: creativeRequest,
      context: {
        ...(body.context || {}),
        system_knowledge: knowledge,
        business_truth: businessTruth,
      },
    });
    const blueprint = ensureExplicitRequestedDeliverables(
      enforceCreativeDeliverableContract(composedBlueprint),
      creativeRequest,
    );

    if (
      businessTruth.locations_grounding?.requires_release_verification === true &&
      !list(blueprint.decision_gates).some((gate) => gate?.id === "location_grounding_gate")
    ) {
      blueprint.decision_gates = [
        ...list(blueprint.decision_gates),
        {
          id: "location_grounding_gate",
          title: "Verify location evidence before release",
          description:
            "No structured business location record was available. Ground location-dependent work in approved organization evidence and verify the final identity before release.",
        },
      ];
    }

    assertProductionReadyBlueprint(blueprint);

    const mission = await CreativeMissionRuntime.create({
      organization_id,
      title: blueprint.title,
      business_goal: blueprint.business_goal,
      objective: blueprint.objective,
      audience: blueprint.audience || {},
      channels: list(blueprint.channels),
      metadata: {
        source_request: creativeRequest,
        creative_thesis: blueprint.creative_thesis,
        deliverables: blueprint.deliverables,
        workflow: list(blueprint.workflow),
        departments: list(blueprint.departments),
        production_principles: list(blueprint.production_principles),
        quality_policy: blueprint.quality_policy || {},
        production_mode: blueprint.production_mode,
        decision_gates: list(blueprint.decision_gates),
        optional_real_world_extensions: list(blueprint.optional_real_world_extensions),
        assumptions: list(blueprint.assumptions),
        blocking_questions: list(blueprint.blocking_questions),
        composition_confidence: blueprint.confidence,
        composition_source: blueprint.composition_source,
        fallback_reason: blueprint.fallback_reason,
        composition_mode: "OPEN_CREATIVE_MISSION_V4_UNIVERSAL",
        knowledge_policy: knowledge.source_policy,
        canonical_source_ids: list(knowledge.sources).map((source) => source.id),
        business_truth_snapshot_id: businessTruth.snapshot_id,
        business_truth_payload_hash: businessTruth.payload_hash,
        business_truth_schema_version: businessTruth.schema_version,
        business_truth_record_counts: businessTruth.record_counts,
        business_truth_source_manifest: businessTruth.source_manifest,
      },
    });

    await CreativeMissionRuntime.start(mission.id);

    const projects = [];
    let masterProjectId = null;

    for (const deliverable of orderedDeliverables(blueprint.deliverables)) {
      const project = await CreativeProjectRuntime.create(
        projectPayload({
          organization_id,
          mission,
          deliverable,
          blueprint,
          knowledge,
          businessTruth,
          masterProjectId,
        }),
      );

      if (deliverable.metadata?.production_role === "MASTER") {
        masterProjectId = project.id;
      }
      projects.push(project);
    }

    const evidenceProjectId = masterProjectId || projects[0]?.id || null;
    const suppliedEvidenceAssets = [
      ...list(body.assets),
      ...list(body.reference_assets),
      ...list(body.context?.assets),
      ...list(body.context?.reference_assets),
    ];
    const evidenceImport = await importBusinessEvidence({
      organization_id,
      creative_project_id: evidenceProjectId,
      businessTruth,
      request: creativeRequest,
      blueprint,
      supplied_assets: suppliedEvidenceAssets,
    });

    const finalBusinessTruth = await CreativeBusinessTruthRuntime.hydrate({
      organization_id,
      entity_id,
      period_id,
      creative_mission_id: mission.id,
      creative_project_id: evidenceProjectId,
      captured_by: access.user?.id || access.user_id || null,
      persist: true,
    });

    const finalizedProjects = await Promise.all(
      projects.map((project) =>
        CreativeProjectRuntime.update(project.id, {
          metadata: {
            ...(project.metadata || {}),
            business_truth_snapshot_id: finalBusinessTruth.snapshot_id,
            business_truth_payload_hash: finalBusinessTruth.payload_hash,
            business_truth_schema_version: finalBusinessTruth.schema_version,
            business_truth_record_counts: finalBusinessTruth.record_counts,
            business_truth_source_manifest: finalBusinessTruth.source_manifest,
            mission_evidence_selection_version: evidenceImport.selection.version,
            mission_evidence_selection: evidenceImport.selection.diagnostics,
          },
        }),
      ),
    );

    const updatedMission = await CreativeMissionRuntime.update(mission.id, {
      metadata: {
        ...(mission.metadata || {}),
        business_truth_snapshot_id: finalBusinessTruth.snapshot_id,
        business_truth_payload_hash: finalBusinessTruth.payload_hash,
        business_truth_schema_version: finalBusinessTruth.schema_version,
        business_truth_record_counts: finalBusinessTruth.record_counts,
        business_truth_source_manifest: finalBusinessTruth.source_manifest,
        mission_evidence_selection_version: evidenceImport.selection.version,
        mission_evidence_selection: evidenceImport.selection.diagnostics,
      },
    });

    return NextResponse.json({
      success: true,
      mission: { ...updatedMission, status: "active" },
      projects: finalizedProjects,
      blueprint,
      knowledge: {
        source_count: list(knowledge.sources).length,
        source_policy: knowledge.source_policy,
      },
      business_truth: {
        snapshot_id: finalBusinessTruth.snapshot_id,
        payload_hash: finalBusinessTruth.payload_hash,
        schema_version: finalBusinessTruth.schema_version,
        record_counts: finalBusinessTruth.record_counts,
        source_manifest: finalBusinessTruth.source_manifest,
        source_failures: finalBusinessTruth.source_failures,
        locations_grounding: finalBusinessTruth.locations_grounding,
        evidence_node_count: evidenceImport.nodes.length,
        evidence_selection: evidenceImport.selection.diagnostics,
      },
    });
  } catch (error) {
    console.error("creative mission composition failed", error);
    const invalidDirector = invalidDirectorError(error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Creative mission composition failed",
        code:
          error?.code ||
          (invalidDirector
            ? "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT"
            : "CREATIVE_MISSION_COMPOSITION_FAILED"),
        details: error?.details || error?.provider_response || null,
      },
      { status: invalidDirector ? 422 : 500 },
    );
  }
}
