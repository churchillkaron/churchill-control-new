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
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function projectProductionType(medium = "") {
  const value = String(medium).trim().toUpperCase();
  if (/FILM|VIDEO|MOVIE|TRAILER|REEL|CUTDOWN|EPISODE/.test(value)) return "VIDEO";
  if (/IMAGE|PHOTO|POSTER|BANNER|KEY ART|STILL/.test(value)) return "IMAGE";
  if (/WEBSITE|WEBPAGE|LANDING|WEB EXPERIENCE/.test(value)) return "WEBSITE";
  if (/MENU/.test(value)) return "MENU";
  if (/AUDIO|MUSIC|VOICE|SOUND/.test(value)) return "AUDIO";
  if (/DOCUMENT|COPY|SCRIPT/.test(value)) return "DOCUMENT";
  if (/PRESENTATION|DECK/.test(value)) return "PRESENTATION";
  return "MULTIMEDIA";
}

function durationSeconds(
  specifications = {},
  fallback = 30,
) {
  const candidateGroups = [
    specifications.duration_seconds,
    specifications.target_duration,
    specifications.runtime,
    specifications.duration,
    specifications.durations,
    specifications.max_duration,
  ];

  for (
    const candidateGroup
    of candidateGroups
  ) {
    const candidates =
      Array.isArray(candidateGroup)
        ? candidateGroup
        : [candidateGroup];

    const parsed = [];

    for (const candidate of candidates) {
      if (
        Number.isFinite(
          Number(candidate),
        ) &&
        Number(candidate) > 0
      ) {
        parsed.push(
          Math.round(Number(candidate)),
        );
        continue;
      }

      const match = String(
        candidate || "",
      ).match(
        /(\d+(?:\.\d+)?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?))?\s*(?:seconds?|secs?|s)\b/i,
      );

      if (match) {
        const lower = Number(match[1]);
        const upper = Number(
          match[2] || match[1],
        );

        if (
          lower > 0 &&
          upper > 0
        ) {
          parsed.push(
            Math.round(
              Math.max(lower, upper),
            ),
          );
        }
      }
    }

    if (parsed.length) {
      return Math.max(...parsed);
    }
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
  return {
    organization_id,
    creative_mission_id: mission.id,
    name: deliverable.title,
    description: deliverable.description,
    objective: deliverable.description || blueprint.objective,
    production_type: projectProductionType(deliverable.medium),
    target_channels: deliverable.channels || [],
    target_languages: blueprint.languages || [],
    target_duration: durationSeconds(deliverable.specifications, 30),
    quality_profile: "WORLD_CLASS",
    budget_profile: "MISSION_CONTROLLED",
    metadata: {
      creative_medium: deliverable.medium,
      formats: deliverable.formats || [],
      capabilities: deliverable.capabilities || [],
      execution_capabilities: deliverable.execution_capabilities || [],
      dependencies: deliverable.dependencies || [],
      success_criteria: deliverable.success_criteria || [],
      specifications: deliverable.specifications || {},
      deliverable_metadata:
        deliverable.metadata || {},
      production_role:
        deliverable.metadata?.production_role ||
        "INDEPENDENT",
      master_project_id:
        deliverable.metadata?.production_role ===
        "CUTDOWN"
          ? masterProjectId
          : null,
      derivative_policy:
        deliverable.metadata?.production_role ===
        "CUTDOWN"
          ? "DERIVE_FROM_APPROVED_MASTER_TIMELINE"
          : null,
      mission_workflow: blueprint.workflow || [],
      mission_departments: blueprint.departments || [],
      creative_thesis: blueprint.creative_thesis,
      production_mode: blueprint.production_mode,
      decision_gates: blueprint.decision_gates || [],
      optional_real_world_extensions:
        blueprint.optional_real_world_extensions || [],
      quality_policy: blueprint.quality_policy || {},
      composition_source: blueprint.composition_source,
      composition_confidence: blueprint.confidence,
      source_request:
        mission.metadata?.source_request || blueprint.objective,
      knowledge_policy: knowledge.source_policy,
      canonical_source_ids: (knowledge.sources || []).map((source) => source.id),
      business_truth_snapshot_id: businessTruth.snapshot_id,
      business_truth_payload_hash: businessTruth.payload_hash,
      business_truth_schema_version: businessTruth.schema_version,
      business_truth_record_counts: businessTruth.record_counts,
      business_truth_source_manifest: businessTruth.source_manifest,
    },
  };
}

function assertProductionReadyBlueprint(blueprint = {}) {
  if (blueprint.composition_source !== "AI_DIRECTOR") {
    const error = new Error(
      blueprint.fallback_reason || "CREATIVE_AI_DIRECTOR_REQUIRED",
    );
    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
    throw error;
  }

  if (blueprint.fallback_reason) {
    const error = new Error(blueprint.fallback_reason);
    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
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

  if (!blueprint.deliverables.some((deliverable) => deliverable.medium === "FILM")) {
    const error = new Error("CREATIVE_AI_DIRECTOR_FILM_DELIVERABLE_REQUIRED");
    error.code = "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT";
    throw error;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organization_id = body.organization_id;
    const creativeRequest = String(
      body.request || body.prompt || body.objective || "",
    ).trim();

    if (!organization_id) {
      return NextResponse.json(
        { error: "organization_id required" },
        { status: 400 },
      );
    }

    if (!creativeRequest) {
      return NextResponse.json(
        { error: "creative request required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organization_id });
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
      captured_by:
        access?.user?.id ||
        access?.user_id ||
        null,
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
    const blueprint =
      enforceCreativeDeliverableContract(
        composedBlueprint,
      );

    if (
      businessTruth.locations_grounding
        ?.requires_release_verification === true &&
      !(blueprint.decision_gates || []).some(
        (gate) =>
          gate?.id ===
          "location_grounding_gate",
      )
    ) {
      blueprint.decision_gates = [
        ...(blueprint.decision_gates || []),
        {
          id: "location_grounding_gate",
          title:
            "Verify venue location evidence before release",
          description:
            "No structured business location record was available. Ground production in approved organization address evidence and uploaded venue references, then verify final venue identity before release.",
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
      channels: blueprint.channels || [],
      metadata: {
        source_request: creativeRequest,
        creative_thesis: blueprint.creative_thesis,
        deliverables: blueprint.deliverables || [],
        workflow: blueprint.workflow || [],
        departments: blueprint.departments || [],
        production_principles:
          blueprint.production_principles || [],
        quality_policy: blueprint.quality_policy || {},
        production_mode: blueprint.production_mode,
        decision_gates: blueprint.decision_gates || [],
        optional_real_world_extensions:
          blueprint.optional_real_world_extensions || [],
        assumptions: blueprint.assumptions || [],
        blocking_questions: blueprint.blocking_questions || [],
        composition_confidence: blueprint.confidence,
        composition_source: blueprint.composition_source,
        fallback_reason: blueprint.fallback_reason,
        composition_mode: "OPEN_CREATIVE_MISSION_V3_BUSINESS_TRUTH",
        knowledge_policy: knowledge.source_policy,
        canonical_source_ids: (knowledge.sources || []).map((source) => source.id),
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

    const orderedDeliverables = [
      ...(blueprint.deliverables || []).filter(
        (deliverable) =>
          deliverable.metadata
            ?.production_role === "MASTER",
      ),
      ...(blueprint.deliverables || []).filter(
        (deliverable) =>
          deliverable.metadata
            ?.production_role !== "MASTER",
      ),
    ];

    for (const deliverable of orderedDeliverables) {
      const project =
        await CreativeProjectRuntime.create(
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

      if (
        deliverable.metadata
          ?.production_role === "MASTER"
      ) {
        masterProjectId = project.id;
      }

      projects.push(project);
    }

    const evidenceProjectId =
      masterProjectId ||
      projects[0]?.id ||
      null;

    let evidenceNodes = [];

    if (evidenceProjectId) {
      const references =
        businessTruth.assets
          ?.uploaded_references || [];

      evidenceNodes = await Promise.all(
        references.slice(0, 40).map(
          (asset) =>
            CreativeAssetGraphRuntime.create({
              organization_id,
              creative_project_id:
                evidenceProjectId,
              creative_asset_id:
                asset.id,
              type:
                String(
                  asset.type || "IMAGE",
                ).toUpperCase(),
              status: "IMPORTED",
              name:
                asset.name ||
                "Imported Reference",
              description:
                asset.description ||
                "Organization-scoped production reference",
              url:
                asset.url ||
                asset.thumbnail_url ||
                null,
              lineage: {
                source: "creative_assets",
                provider_id: null,
                capability:
                  "creative.reference.import",
                generation_version: 1,
              },
              intelligence: {
                quality_score:
                  Number(
                    asset.analysis
                      ?.quality_score || 0,
                  ),
                tags:
                  asset.tags || [],
              },
              reuse: {
                reusable: true,
                approved_for_reuse:
                  false,
              },
              review: {
                ai_reviewed: false,
                human_reviewed: false,
                approved: false,
                notes:
                  "Imported as production evidence. Rights and reuse approval remain separate gates.",
              },
              metadata: {
                evidence_role:
                  "MISSION_REFERENCE",
                source_asset_id:
                  asset.id,
                rights_status:
                  "UNVERIFIED",
              },
            }),
        ),
      );
    }

    const finalBusinessTruth =
      await CreativeBusinessTruthRuntime.hydrate({
        organization_id,
        entity_id,
        period_id,
        creative_mission_id:
          mission.id,
        creative_project_id:
          evidenceProjectId,
        captured_by:
          access?.user?.id ||
          access?.user_id ||
          null,
        persist: true,
      });

    const finalizedProjects =
      await Promise.all(
        projects.map((project) =>
          CreativeProjectRuntime.update(
            project.id,
            {
              metadata: {
                ...(project.metadata || {}),
                business_truth_snapshot_id:
                  finalBusinessTruth.snapshot_id,
                business_truth_payload_hash:
                  finalBusinessTruth.payload_hash,
                business_truth_schema_version:
                  finalBusinessTruth.schema_version,
                business_truth_record_counts:
                  finalBusinessTruth.record_counts,
                business_truth_source_manifest:
                  finalBusinessTruth.source_manifest,
              },
            },
          ),
        ),
      );

    const updatedMission =
      await CreativeMissionRuntime.update(
        mission.id,
        {
          metadata: {
            ...(mission.metadata || {}),
            business_truth_snapshot_id:
              finalBusinessTruth.snapshot_id,
            business_truth_payload_hash:
              finalBusinessTruth.payload_hash,
            business_truth_schema_version:
              finalBusinessTruth.schema_version,
            business_truth_record_counts:
              finalBusinessTruth.record_counts,
            business_truth_source_manifest:
              finalBusinessTruth.source_manifest,
          },
        },
      );

    return NextResponse.json({
      success: true,
      mission: {
        ...updatedMission,
        status: "active",
      },
      projects: finalizedProjects,
      blueprint,
      knowledge: {
        source_count:
          knowledge.sources.length,
        source_policy:
          knowledge.source_policy,
      },
      business_truth: {
        snapshot_id:
          finalBusinessTruth.snapshot_id,
        payload_hash:
          finalBusinessTruth.payload_hash,
        schema_version:
          finalBusinessTruth.schema_version,
        record_counts:
          finalBusinessTruth.record_counts,
        source_manifest:
          finalBusinessTruth.source_manifest,
        source_failures:
          finalBusinessTruth.source_failures,
        locations_grounding:
          finalBusinessTruth.locations_grounding,
        evidence_node_count:
          evidenceNodes.length,
      },
    });
  } catch (error) {
    console.error("creative mission composition failed", error);

    const invalidDirector =
      error?.code === "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT" ||
      String(error?.message || "").startsWith("OPENAI_STRUCTURED_JSON_") ||
      String(error?.message || "").startsWith("AI_DIRECTOR_");

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Creative mission composition failed",
        code:
          error?.code ||
          (invalidDirector
            ? "CREATIVE_AI_DIRECTOR_INVALID_OUTPUT"
            : "CREATIVE_MISSION_COMPOSITION_FAILED"),
      },
      { status: invalidDirector ? 422 : 500 },
    );
  }
}
