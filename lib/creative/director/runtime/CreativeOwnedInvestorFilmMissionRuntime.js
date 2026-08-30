import crypto from "node:crypto";

import {
  runIntelligenceReasoningLoop,
} from "@/lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime";
import {
  evaluateAvantiqoReusableKnowledge,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "@/lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime";

export const CREATIVE_OWNED_INVESTOR_FILM_MISSION_CONTRACT =
  "CREATIVE_OWNED_INVESTOR_FILM_MISSION_V1";
export const CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_CONTRACT =
  "CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_V1";
export const CREATIVE_INVESTOR_FILM_PLAN_REVIEW_CONTRACT =
  "CREATIVE_INVESTOR_FILM_PLAN_REVIEW_V1";
export const CREATIVE_INVESTOR_FILM_CERTIFICATION_CONTRACT =
  "CREATIVE_INVESTOR_FILM_CERTIFICATION_V1";

const OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence";
const MINIMUM_DURATION_SECONDS = 240;
const MAXIMUM_DURATION_SECONDS = 300;
const DEFAULT_DURATION_SECONDS = 270;
const MINIMUM_CANONICAL_EVIDENCE_ITEMS = 6;
const MINIMUM_PRODUCT_PROOF_AREAS = 4;

const INVESTOR_PRODUCT_TRUTH_QUERIES = Object.freeze([
  "Avantiqo current platform product architecture, domains, workspaces, capabilities and connected business operating system",
  "Avantiqo current Intelligence product capabilities, owned reasoning, learning, tools, agents and governed execution",
  "Avantiqo current Creative product capabilities for strategy, image, video, voice, music, design, production, review and release",
  "Avantiqo current business product capabilities across Finance, Operations, Supply Chain, Commercial, People, Projects, Documents, Analytics and Administration",
  "Avantiqo current automation, Secretary, directors, business context, service runtime, wallet and provider governance capabilities",
]);

const INVESTOR_FILM_QUALITY_POLICY = Object.freeze({
  version: "INVESTOR_FILM_RELEASE_GRADE_V1",
  minimum_scene_score: 92,
  regenerate_below_score: 88,
  require_brand_fit: true,
  require_non_ai_feel: true,
  require_identity_continuity: true,
  require_product_continuity: true,
  require_story_progression: true,
});

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue with the next conservative JSON candidate.
    }
  }
  return null;
}

function assertOwnedIntelligence(execution = {}, operation = "UNKNOWN") {
  const provider = text(execution.provider);
  if (provider !== OWNED_INTELLIGENCE_PROVIDER) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_OWNED_INTELLIGENCE_REQUIRED:${operation}:${provider || "UNRESOLVED"}`,
    );
  }
  if (text(execution.execution_lane).toLowerCase() !== "deep") {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_DEEP_REASONING_REQUIRED:${operation}`,
    );
  }
}

function requestedDuration(input = {}, project = {}, brief = {}) {
  const value = finite(
    input.target_duration_seconds ??
      brief.duration_seconds ??
      brief.target_duration ??
      project.metadata?.temporal_contract?.duration_seconds ??
      project.metadata?.full_master_duration ??
      project.target_duration ??
      DEFAULT_DURATION_SECONDS,
  );
  if (
    value === null ||
    value < MINIMUM_DURATION_SECONDS ||
    value > MAXIMUM_DURATION_SECONDS
  ) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_DURATION_OUT_OF_RANGE:${value ?? "UNRESOLVED"}`,
    );
  }
  return value;
}

function evidenceId(item = {}) {
  return text(item.id || item.memory_key || item.subject);
}

function normalizedEvidenceItem(item = {}, facet = "unknown") {
  const id = evidenceId(item);
  const content = text(item.content || item.claim || item.subject);
  if (!id || !content) return null;
  return {
    evidence_id: id,
    facet,
    subject: text(item.subject) || null,
    content,
    verification_status:
      text(item.verification_status) || "AVANTIQO_CANONICAL_PRODUCT",
    confidence: finite(item.confidence) ?? 1,
    verified_at: text(item.verified_at) || null,
    provenance: object(item.provenance),
  };
}

async function canonicalProductEvidence(organization_id) {
  const batches = await Promise.all(
    INVESTOR_PRODUCT_TRUTH_QUERIES.map(async (query, index) => {
      const result = await evaluateAvantiqoReusableKnowledge({
        context: {
          organization_id,
          module: "CREATIVE",
          operation: "INVESTOR_FILM_CANONICAL_PRODUCT_TRUTH",
        },
        payload: {
          query,
          objective:
            "Ground an Avantiqo investor film in current canonical product truth only.",
          domain: "avantiqo_product",
        },
      });

      if (
        result?.success !== true ||
        result?.route !== "CANONICAL_PRODUCT_KNOWLEDGE" ||
        result?.governance?.external_intelligence_provider_used === true ||
        result?.governance?.customer_private_memory_reused === true
      ) {
        throw new Error(
          `CREATIVE_INVESTOR_FILM_CANONICAL_PRODUCT_TRUTH_REQUIRED:${index + 1}`,
        );
      }

      return list(result?.learned_knowledge?.knowledge)
        .map((item) => normalizedEvidenceItem(item, `product-facet-${index + 1}`))
        .filter(Boolean);
    }),
  );

  const byId = new Map();
  for (const item of batches.flat()) {
    if (!byId.has(item.evidence_id)) byId.set(item.evidence_id, item);
  }
  const evidence = [...byId.values()];
  if (evidence.length < MINIMUM_CANONICAL_EVIDENCE_ITEMS) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_CANONICAL_EVIDENCE_INSUFFICIENT:${evidence.length}`,
    );
  }
  return evidence;
}

function assetAuthorityManifest(assets = []) {
  return list(assets).map((asset) => {
    const name = text(asset.name || asset.title || asset.file_name).toLowerCase();
    const corpus = `${name} ${JSON.stringify(asset.tags || [])}`.toLowerCase();
    return {
      asset_id: text(asset.id || asset.asset_id),
      creative_authority: false,
      evidence_authority: true,
      disposition: "REFERENCE_CANDIDATE_ONLY",
      legacy_investor_reference: /investor|old film|old-film|investor-film/.test(corpus),
      rule:
        "May be selected only because the new Avantiqo Intelligence direction independently needs it. It cannot dictate story, scene order, narration, concept or visual language.",
    };
  }).filter((item) => item.asset_id);
}

function directorCharterSystemPrompt() {
  return `
You are Avantiqo Intelligence acting as a world-class executive creative director,
investor-story strategist, commercial film director, product storyteller and sound director.
You are authoring the creative foundation for Avantiqo's final Creative Studio certification.

The film must make a sophisticated investor understand and desire Avantiqo while feeling that
they have watched a genuinely excellent short film, not a software feature reel or AI demo.
Every product statement must be grounded in the supplied canonical Avantiqo evidence. The evidence
is authoritative; your model memory is not. Never invent current product state, customer counts,
revenue, market share, integrations, certifications or capabilities.

The previous investor-film script, scene order and narration are NOT creative authority. Existing
assets may be selected only as reference candidates when your new direction independently earns
them. Do not imitate competitors, famous campaigns, protected characters or living directors.

Think before choosing the form. Reject obvious SaaS montage structures, dashboards flying through
space, generic founders staring at screens, meaningless holograms, endless UI zooms and a four-minute
feature list. The final film must combine human/business stakes, cinematic visual storytelling and
real Avantiqo product proof.

Return strict JSON only. No markdown.`;
}

function directorCharterPrompt({ mission, project, brief, evidence, assetAuthority, duration }) {
  return JSON.stringify({
    contract: CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_CONTRACT,
    assignment: {
      audience: "serious investors and strategic partners",
      objective:
        "Sell and explain Avantiqo in one memorable release-grade investor film while proving the breadth and coherence of the real product.",
      duration_seconds: duration,
      aspect_ratio: "16:9",
      master_resolution: "4K",
      narration_expected: true,
      original_music_and_sound_design_expected: true,
      truthful_product_proof_expected: true,
      old_investor_script_authority: false,
    },
    required_output: {
      contract: CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_CONTRACT,
      creative_thesis: "string",
      investor_thesis: "string",
      audience_tension: "string",
      emotional_promise: "string",
      signature_device: {
        mechanism: "string",
        why_it_belongs_to_avantiqo: "string",
        where_it_is_used: ["string"],
        where_it_is_deliberately_not_used: ["string"],
      },
      narrative_architecture: {
        form: "string; chosen by the story, never a canned act template",
        opening_question: "string",
        progression: [
          {
            movement: "string",
            audience_change: "string",
            product_truth_job: "string",
            emotional_job: "string",
          },
        ],
        ending_payoff: "string",
      },
      product_proof_strategy: [
        {
          proof_area: "string",
          claim: "string",
          canonical_evidence_ids: ["exact supplied evidence_id"],
          visible_proof: "what the viewer must actually see",
          narration_job: "what language adds beyond the visible proof",
          exaggeration_guard: "string",
        },
      ],
      narration_strategy: {
        narrator_role: "string",
        voice_character: "string",
        language_density: "LOW|MEDIUM|HIGH",
        writing_rules: ["string"],
        forbidden_copy_patterns: ["string"],
      },
      visual_language: {
        physical_world: "string",
        product_ui_language: "string",
        human_language: "string",
        camera_language: "string",
        lighting_language: "string",
        color_and_material_language: "string",
        typography_and_graphics_language: "string",
        transition_language: "string",
      },
      sound_world: {
        score_thesis: "string",
        energy_arc: ["string"],
        diegetic_sound_priorities: ["string"],
        designed_sound_principles: ["string"],
        silence_strategy: "string",
        mix_hierarchy: "string",
      },
      continuity_system: {
        recurring_anchors: ["string"],
        product_truth_anchors: ["string"],
        visual_continuity_rules: ["string"],
        sonic_continuity_rules: ["string"],
      },
      rejected_directions: [
        {
          direction: "string",
          rejection_reason: "string",
        },
      ],
      production_principles: ["string"],
      release_definition: ["inspectable criterion"],
    },
    mandatory_rules: [
      `The film master duration is ${duration} seconds and must remain within ${MINIMUM_DURATION_SECONDS}-${MAXIMUM_DURATION_SECONDS} seconds.`,
      `Use at least ${MINIMUM_PRODUCT_PROOF_AREAS} materially different product-proof areas.`,
      "Every product claim must cite one or more exact canonical_evidence_ids from the supplied evidence.",
      "Narration must explain meaning, stakes and connections; it must not simply read visible UI labels.",
      "Real product UI/proof and cinematic generated storytelling must strengthen each other rather than compete.",
      "Existing assets are references or evidence only. Never inherit story, shot order or narration from an old investor-film asset.",
      "The structure must be chosen from the idea. Do not force a fixed scene count or canned three-act timing.",
      "The film must have a designed original score, diegetic sound, editorial sound and intentional silence/dropouts; never one flat music bed.",
      "End with an earned investor-level understanding of what Avantiqo is and why its integrated architecture matters.",
    ],
    mission,
    project,
    brief,
    canonical_product_evidence: evidence,
    existing_asset_authority: assetAuthority,
  });
}

async function createDirectorCharter({
  organization_id,
  mission,
  project,
  brief,
  evidence,
  assetAuthority,
  duration,
}) {
  const execution = await runIntelligenceReasoningLoop({
    organization_id,
    execution_lane: "deep",
    system: directorCharterSystemPrompt(),
    messages: [
      {
        role: "user",
        content: directorCharterPrompt({
          mission,
          project,
          brief,
          evidence,
          assetAuthority,
          duration,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.35,
    max_output_tokens: 12000,
    max_turns: 3,
    max_tool_calls: 0,
    metadata: {
      module: "CREATIVE",
      operation: "CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER",
      creative_mission_id: mission?.id || mission?.creative_mission_id || null,
      creative_project_id: project?.id || null,
    },
  });
  assertOwnedIntelligence(execution, "DIRECTOR_CHARTER");
  const charter = parseJson(execution.text);
  if (charter?.contract !== CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_CONTRACT) {
    throw new Error("CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_INVALID");
  }
  if (list(charter.product_proof_strategy).length < MINIMUM_PRODUCT_PROOF_AREAS) {
    throw new Error("CREATIVE_INVESTOR_FILM_PRODUCT_PROOF_STRATEGY_INSUFFICIENT");
  }

  const validEvidenceIds = new Set(evidence.map((item) => item.evidence_id));
  for (const proof of list(charter.product_proof_strategy)) {
    const ids = list(proof.canonical_evidence_ids).map(text).filter(Boolean);
    if (!ids.length || ids.some((id) => !validEvidenceIds.has(id))) {
      throw new Error("CREATIVE_INVESTOR_FILM_DIRECTOR_CHARTER_UNGROUNDED_PRODUCT_CLAIM");
    }
  }

  return { charter, execution };
}

function totalPlanDuration(plan = {}) {
  return list(plan.scenes)
    .reduce((sum, scene) => sum + (finite(scene.duration_seconds) || 0), 0);
}

function assertTemporalPlanBasics(plan = {}, duration) {
  if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
    throw new Error("CREATIVE_INVESTOR_FILM_TEMPORAL_PLAN_REQUIRED");
  }
  if (!list(plan.scenes).length) {
    throw new Error("CREATIVE_INVESTOR_FILM_SCENES_REQUIRED");
  }
  const actualDuration = totalPlanDuration(plan);
  if (
    actualDuration < MINIMUM_DURATION_SECONDS ||
    actualDuration > MAXIMUM_DURATION_SECONDS ||
    Math.abs(actualDuration - duration) > 0.25
  ) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_PLAN_DURATION_INVALID:${actualDuration}`,
    );
  }
}

function reviewSystemPrompt() {
  return `
You are Avantiqo Intelligence acting as an independent investor-film editor-in-chief,
product-truth auditor, creative director, post supervisor and skeptical institutional investor.
Audit the supplied film plan. You did not author it and must not defend it.

Canonical product evidence is the only authority for current Avantiqo product claims. Identify every
spoken, written or visually implied product claim you can find. A beautiful plan fails if a claim is
unsupported, if product proof is too thin, if narration becomes feature-list copy, if the structure is
generic, if sound is flat, if continuity is weak, or if old investor material has become narrative
authority.

Return strict JSON only. No markdown.`;
}

function reviewPrompt({ plan, charter, evidence, assetAuthority, duration }) {
  return JSON.stringify({
    contract: CREATIVE_INVESTOR_FILM_PLAN_REVIEW_CONTRACT,
    required_output: {
      contract: CREATIVE_INVESTOR_FILM_PLAN_REVIEW_CONTRACT,
      passed: "boolean",
      overall_score: "0-100",
      claims_grounded: "boolean",
      duration_valid: "boolean",
      old_investor_material_is_non_authoritative: "boolean",
      investor_story_is_persuasive: "boolean",
      product_proof_is_material: "boolean",
      narration_is_story_not_feature_list: "boolean",
      visual_system_is_ownable: "boolean",
      continuity_is_directed: "boolean",
      score_and_sound_are_directed: "boolean",
      final_master_is_release_grade_by_plan: "boolean",
      product_proof_area_count: "number",
      claim_audit: [
        {
          claim: "string",
          status: "SUPPORTED|UNSUPPORTED|OVERSTATED|AMBIGUOUS",
          canonical_evidence_ids: ["exact supplied evidence_id"],
          repair: "string or empty",
        },
      ],
      strongest_moments: ["string"],
      weakest_links: ["string"],
      required_repairs_before_production: ["string"],
    },
    acceptance_rules: [
      `Total planned duration must equal ${duration} seconds within 0.25 seconds and remain inside ${MINIMUM_DURATION_SECONDS}-${MAXIMUM_DURATION_SECONDS}.`,
      `At least ${MINIMUM_PRODUCT_PROOF_AREAS} materially distinct Avantiqo product-proof areas must survive into the detailed plan.`,
      "Every current-product claim must be supported by exact supplied canonical evidence IDs.",
      "Existing or legacy investor assets may be used only as source/reference candidates; their prior story or narration has zero authority.",
      "The plan must combine cinematic storytelling, real product proof, spoken narrative, original music/sound design, continuity and release finishing.",
      "Reject generic SaaS montage, feature-list narration, AI-demo aesthetics and decorative complexity without investor meaning.",
      "passed may be true only when required_repairs_before_production is empty and every boolean gate is true.",
    ],
    director_charter: charter,
    canonical_product_evidence: evidence,
    existing_asset_authority: assetAuthority,
    detailed_temporal_plan: plan,
  });
}

async function reviewDetailedPlan({
  organization_id,
  mission,
  project,
  plan,
  charter,
  evidence,
  assetAuthority,
  duration,
}) {
  const execution = await runIntelligenceReasoningLoop({
    organization_id,
    execution_lane: "deep",
    system: reviewSystemPrompt(),
    messages: [
      {
        role: "user",
        content: reviewPrompt({
          plan,
          charter,
          evidence,
          assetAuthority,
          duration,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_output_tokens: 12000,
    max_turns: 3,
    max_tool_calls: 0,
    metadata: {
      module: "CREATIVE",
      operation: "CREATIVE_INVESTOR_FILM_PLAN_REVIEW",
      creative_mission_id: mission?.id || mission?.creative_mission_id || null,
      creative_project_id: project?.id || null,
    },
  });
  assertOwnedIntelligence(execution, "PLAN_REVIEW");
  const review = parseJson(execution.text);
  if (review?.contract !== CREATIVE_INVESTOR_FILM_PLAN_REVIEW_CONTRACT) {
    throw new Error("CREATIVE_INVESTOR_FILM_PLAN_REVIEW_INVALID");
  }

  const validEvidenceIds = new Set(evidence.map((item) => item.evidence_id));
  for (const item of list(review.claim_audit)) {
    const status = text(item.status).toUpperCase();
    const ids = list(item.canonical_evidence_ids).map(text).filter(Boolean);
    if (status === "SUPPORTED" && (!ids.length || ids.some((id) => !validEvidenceIds.has(id)))) {
      throw new Error("CREATIVE_INVESTOR_FILM_REVIEW_FALSE_SUPPORTED_CLAIM");
    }
  }

  const booleanGates = [
    "passed",
    "claims_grounded",
    "duration_valid",
    "old_investor_material_is_non_authoritative",
    "investor_story_is_persuasive",
    "product_proof_is_material",
    "narration_is_story_not_feature_list",
    "visual_system_is_ownable",
    "continuity_is_directed",
    "score_and_sound_are_directed",
    "final_master_is_release_grade_by_plan",
  ];
  const failedGate = booleanGates.find((key) => review[key] !== true);
  if (
    failedGate ||
    Number(review.product_proof_area_count || 0) < MINIMUM_PRODUCT_PROOF_AREAS ||
    list(review.required_repairs_before_production).length
  ) {
    const reason = failedGate || "REPAIR_OR_PRODUCT_PROOF_GATE";
    throw new Error(`CREATIVE_INVESTOR_FILM_PLAN_NOT_CERTIFIED:${reason}`);
  }

  return { review, execution };
}

function enrichedInputs({ project, brief, charter, evidence, assetAuthority, duration }) {
  const evidenceDigest = digest(evidence);
  const charterDigest = digest(charter);
  const qualityPolicy = {
    ...INVESTOR_FILM_QUALITY_POLICY,
  };

  return {
    project: {
      ...project,
      target_duration: duration,
      metadata: {
        ...object(project.metadata),
        workflow_kind: "TEMPORAL",
        creative_medium: "FILM",
        full_master_duration: duration,
        temporal_contract: {
          ...object(project.metadata?.temporal_contract),
          duration_seconds: duration,
          mode: "ORIGINAL_SCORE_AND_SOUND_DESIGN",
        },
        creative_quality_policy: qualityPolicy,
        investor_film_certification_candidate: true,
        investor_film_director_charter: charter,
        investor_film_director_charter_digest: charterDigest,
        canonical_product_evidence: evidence,
        canonical_product_evidence_digest: evidenceDigest,
        old_investor_script_authority: false,
        existing_asset_authority: assetAuthority,
      },
    },
    brief: {
      ...brief,
      duration_seconds: duration,
      target_duration: duration,
      creative_quality_policy: qualityPolicy,
      metadata: {
        ...object(brief.metadata),
        creative_quality_policy: qualityPolicy,
        investor_film_director_charter: charter,
        investor_film_director_charter_digest: charterDigest,
        canonical_product_evidence: evidence,
        canonical_product_evidence_digest: evidenceDigest,
        old_investor_script_authority: false,
        existing_asset_authority: assetAuthority,
        narration_required: true,
        original_score_required: true,
        real_product_proof_required: true,
        final_master_resolution: "4K",
      },
    },
    charterDigest,
    evidenceDigest,
  };
}

export async function createOwnedInvestorFilmMission(input = {}) {
  const organization_id = text(input.organization_id);
  const mission = object(input.mission);
  const project = object(input.project);
  const brief = object(input.brief);
  const assets = list(input.assets);

  if (!organization_id) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");

  const duration = requestedDuration(input, project, brief);
  const evidence = await canonicalProductEvidence(organization_id);
  const assetAuthority = assetAuthorityManifest(assets);

  const directed = await createDirectorCharter({
    organization_id,
    mission,
    project,
    brief,
    evidence,
    assetAuthority,
    duration,
  });

  const enriched = enrichedInputs({
    project,
    brief,
    charter: directed.charter,
    evidence,
    assetAuthority,
    duration,
  });

  const temporal = await CreativeUniversalTemporalDirectionRuntime.create({
    organization_id,
    mission,
    project: enriched.project,
    brief: enriched.brief,
    assets,
  });
  assertOwnedIntelligence(temporal, "TEMPORAL_DIRECTION");
  assertTemporalPlanBasics(temporal.plan, duration);

  const reviewed = await reviewDetailedPlan({
    organization_id,
    mission,
    project: enriched.project,
    plan: temporal.plan,
    charter: directed.charter,
    evidence,
    assetAuthority,
    duration,
  });

  return {
    success: true,
    contract: CREATIVE_OWNED_INVESTOR_FILM_MISSION_CONTRACT,
    organization_id,
    creative_mission_id: mission.id || mission.creative_mission_id || null,
    creative_project_id: project.id,
    target_duration_seconds: duration,
    director_charter: directed.charter,
    canonical_product_evidence: evidence,
    existing_asset_authority: assetAuthority,
    temporal_direction: temporal,
    plan_review: reviewed.review,
    certification: {
      contract: CREATIVE_INVESTOR_FILM_CERTIFICATION_CONTRACT,
      planning_certified: true,
      owned_intelligence_provider: OWNED_INTELLIGENCE_PROVIDER,
      director_charter_provider: directed.execution.provider,
      temporal_direction_provider: temporal.provider,
      plan_review_provider: reviewed.execution.provider,
      director_charter_digest: enriched.charterDigest,
      canonical_product_evidence_digest: enriched.evidenceDigest,
      old_investor_script_used_as_creative_authority: false,
      legacy_assets_are_reference_candidates_only: true,
      canonical_product_truth_required: true,
      duration_range_seconds: [
        MINIMUM_DURATION_SECONDS,
        MAXIMUM_DURATION_SECONDS,
      ],
      target_duration_seconds: duration,
      product_proof_area_count: Number(reviewed.review.product_proof_area_count || 0),
      production_started: false,
      gpu_generation_performed: false,
      release_master_certified: false,
    },
  };
}

export const CreativeOwnedInvestorFilmMissionRuntime = Object.freeze({
  contract: CREATIVE_OWNED_INVESTOR_FILM_MISSION_CONTRACT,
  minimumDurationSeconds: MINIMUM_DURATION_SECONDS,
  maximumDurationSeconds: MAXIMUM_DURATION_SECONDS,
  defaultDurationSeconds: DEFAULT_DURATION_SECONDS,
  qualityPolicy: INVESTOR_FILM_QUALITY_POLICY,
  create: createOwnedInvestorFilmMission,
});
