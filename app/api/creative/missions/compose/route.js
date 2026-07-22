import { NextResponse } from "next/server";

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

function durationSeconds(specifications = {}, fallback = 30) {
  const candidates = [
    specifications.duration_seconds,
    specifications.target_duration,
    specifications.duration,
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(Number(candidate)) && Number(candidate) > 0) {
      return Math.round(Number(candidate));
    }

    const match = String(candidate || "").match(/(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*(?:seconds?|secs?|s)\b/i);
    if (match) {
      const lower = Number(match[1]);
      const upper = Number(match[2] || match[1]);
      if (lower > 0 && upper > 0) return Math.round(Math.max(lower, upper));
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
      deliverable_metadata: deliverable.metadata || {},
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
        mission.metadata?.source_request ||
        blueprint.objective,
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

    const blueprint = await CreativeMissionComposerRuntime.compose({
      organization_id,
      request: creativeRequest,
      context: {
        ...(body.context || {}),
        system_knowledge: knowledge,
        business_truth: businessTruth,
      },
    });

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
    for (const deliverable of blueprint.deliverables || []) {
      const project = await CreativeProjectRuntime.create(
        projectPayload({
          organization_id,
          mission,
          deliverable,
          blueprint,
          knowledge,
          businessTruth,
        }),
      );
      projects.push(project);
    }

    return NextResponse.json({
      success: true,
      mission: {
        ...mission,
        status: "active",
      },
      projects,
      blueprint,
      knowledge: {
        source_count: knowledge.sources.length,
        source_policy: knowledge.source_policy,
      },
      business_truth: {
        snapshot_id: businessTruth.snapshot_id,
        payload_hash: businessTruth.payload_hash,
        schema_version: businessTruth.schema_version,
        record_counts: businessTruth.record_counts,
        source_manifest: businessTruth.source_manifest,
        source_failures: businessTruth.source_failures,
      },
    });
  } catch (error) {
    console.error("creative mission composition failed", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Creative mission composition failed",
      },
      { status: 500 },
    );
  }
}
