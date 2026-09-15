import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { quotedEvidenceFragments } from "@/lib/creative/director/runtime/CreativeQuotedEvidenceRuntime";
import {
  assertCreativeMasterPlan,
  validateCreativeMasterPlan,
} from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import {
  assertCreativeMasterPlanDecision,
  validateCreativeMasterPlanDecision,
} from "@/lib/creative/director/validation/CreativeMasterPlanDecisionGate";
import {
  mergeCreativeRepairedPlan,
} from "@/lib/creative/director/runtime/mergeCreativeRepairedPlan";

const CONTRACT = "CREATIVE_DYNAMIC_TRIBUNAL_V1";
const REVIEW_POLICY_VERSION = "CREATIVE_TRIBUNAL_REVIEW_POLICY_V2";
const MINIMUM_REVIEWERS = 2;
const MAXIMUM_REVIEWERS = 6;
const MAXIMUM_REPAIR_ATTEMPTS = 3;
const TRIBUNAL_REASONING_SETTLEMENT_INTERVAL_MS = 1000;
const TRIBUNAL_REASONING_SETTLEMENT_DEADLINE_MS = 420_000;
const TRIBUNAL_REASONING_SETTLEMENT_MAX_POLLS = 420;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function canonicalReviewerId(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}


function compactText(value, maximum = 1600) {
  const valueText = text(value);
  return valueText.length > maximum ? `${valueText.slice(0, maximum)}…` : valueText || null;
}

function tribunalContextSnapshot({ mission = {}, project = {}, brief = {}, assets = [], available_capabilities = [] } = {}) {
  return {
    mission: {
      id: mission.id || null,
      title: mission.title || mission.name || null,
      objective: compactText(mission.objective || mission.description, 2400),
      desired_outcome: compactText(mission.desired_outcome || mission.metadata?.desired_outcome),
    },
    project: {
      id: project.id || null,
      title: project.title || project.name || null,
      objective: compactText(project.objective || project.description, 2400),
      production_type: project.production_type || project.metadata?.production_type || null,
      duration_seconds: project.duration_seconds || project.metadata?.duration_seconds || null,
      channels: list(project.channels || project.metadata?.channels),
      languages: list(project.languages || project.metadata?.languages),
    },
    brief: {
      id: brief.id || null,
      objective: compactText(brief.objective || brief.summary || brief.description, 2400),
      audience: compactText(brief.audience || brief.target_audience),
      message: compactText(brief.message || brief.key_message),
    },
    assets: list(assets).map((asset) => ({
      id: asset.id || asset.asset_id || null,
      type: asset.asset_type || asset.type || null,
      name: asset.name || asset.title || asset.file_name || null,
      description: compactText(asset.description || asset.analysis?.description || asset.analysis?.summary, 1800),
      tags: list(asset.tags || asset.analysis?.tags).slice(0, 20),
      location_reference_evidence: object(
        asset.metadata?.location_reference_evidence || asset.analysis?.location_reference_evidence,
      ),
      production_reference_fitness: object(
        asset.metadata?.production_reference_fitness || asset.analysis?.production_reference_fitness,
      ),
      provenance: object(asset.metadata?.provenance || asset.analysis?.provenance),
      source_url: compactText(asset.metadata?.source_url || asset.analysis?.source_url || asset.file_url || asset.image_url, 1200),
      rights: object(asset.rights || asset.metadata?.rights),
      restrictions: object(asset.restrictions || asset.metadata?.restrictions),
    })),
    available_production_capabilities: list(available_capabilities).map((service) => ({
      service_id: service.service_id || service.id || null,
      capabilities: list(service.capabilities).map(text).filter(Boolean),
    })),
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.result || value;
  }
  const source = text(value);
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) {
    candidates.push(source.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue.
    }
  }
  return null;
}

// Answers are located by the field the caller needs rather than by the name of whatever
// wrapper they arrive in. Unwrapping a fixed list of names -- output, result, response,
// data -- meant a panel returned under any other key was never found: a response shaped
// {contract:{reviewers:[...]}} yielded zero reviewers and the tribunal rejected its own
// panel with CREATIVE_TRIBUNAL_REVIEWER_COUNT_INVALID:0:keys:contract, because the model
// had echoed the request's own wrapper.
//
// This is the same defect already fixed in the master plan runtime, which located the
// plan by shape instead of by key. It was left here on the grounds that this path was
// not failing. It was simply not reached yet.
function findByKey(value, key, depth = 0) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value[key] !== undefined) return value;
  if (depth > 4) return null;

  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findByKey(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizedOutput(result = {}, expects = null) {
  const output = result?.output?.output || result?.output || result || {};
  let transport = output;

  // Async service settlement returns the completed provider payload under
  // output.raw. Treat that as transport, not creative content. The prior code
  // parsed {url, provider_job_id, status, raw} as if it were the Tribunal answer
  // and therefore saw zero reviewers even though raw.output.text held valid JSON.
  for (let depth = 0; depth < 4; depth += 1) {
    const raw = object(transport).raw;
    if (!raw) break;
    transport = raw;
  }

  const parsed = parseJson(transport?.output?.text || transport?.text || transport?.content || transport);

  let value = parsed;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;

    const keys = Object.keys(value);
    if (keys.length !== 1 || !["output", "result", "response", "data"].includes(keys[0])) {
      break;
    }

    value = parseJson(value[keys[0]]);
  }

  // A named expectation is searched for by shape, at any depth, and only falls back to
  // the unwrapped value when the field is genuinely absent -- so a response that is
  // already correctly shaped is returned untouched.
  if (expects) {
    const found = findByKey(value, expects) || value;
    if (expects === "reviewer_id" && found && typeof found === "object") {
      return { ...found, reviewer_id: canonicalReviewerId(found.reviewer_id) };
    }
    return found;
  }
  return value;
}

async function reason({
  organization_id,
  creative_mission_id,
  creative_project_id,
  operation,
  payload,
  max_output_tokens = 8000,
  expects = null,
  metadata = {},
}) {
  const result = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens,
      response_format: { type: "json_object" },
      prompt: [
        "Return exactly one valid json object and no non-json text.",
        JSON.stringify(payload),
      ].join("\n"),
    },
    metadata: {
      module: "CREATIVE",
      operation,
      creative_mission_id,
      creative_project_id,
      creative_tribunal_contract: CONTRACT,
      persistence: "STRUCTURED_OUTPUT_ONLY",
      ...object(metadata),
    },
  });

  let completed = result;
  if (completed?.pending === true) {
    const providerJobId = text(completed.provider_job_id);
    const usageId = text(completed.usage?.id);
    if (!providerJobId || !usageId) {
      throw new Error(`${operation}_PENDING_SETTLEMENT_BINDING_REQUIRED`);
    }
    const deadlineAt = Date.now() + TRIBUNAL_REASONING_SETTLEMENT_DEADLINE_MS;
    for (let poll = 1; poll <= TRIBUNAL_REASONING_SETTLEMENT_MAX_POLLS; poll += 1) {
      if (Date.now() >= deadlineAt) break;
      const settled = await ServiceExecutionRuntime.settle({
        organization_id,
        provider: completed.provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        pricing: object(completed.pricing),
        quantity: completed.usage?.quantity ?? 1,
        unit: completed.usage?.unit || completed.pricing?.unit || "request",
        metadata: {
          module: "CREATIVE",
          operation: `${operation}_SETTLEMENT`,
          creative_mission_id,
          creative_project_id,
          creative_tribunal_contract: CONTRACT,
          provider_job_reused: true,
          duplicate_provider_job_submitted: false,
          pending_settlement_poll: poll,
          pending_settlement_deadline_ms: TRIBUNAL_REASONING_SETTLEMENT_DEADLINE_MS,
          ...object(metadata),
        },
        provider_status_input: { capability: "ai.reasoning.execute", execution_lane: "deep" },
        credential_id: completed.credential_id || null,
        started_at: completed.started_at || null,
      });
      if (settled?.pending === true) {
        await new Promise((resolve) => setTimeout(resolve, TRIBUNAL_REASONING_SETTLEMENT_INTERVAL_MS));
        continue;
      }
      if (settled?.failed === true || settled?.success !== true) {
        throw new Error(`${operation}_PENDING_SETTLEMENT_FAILED:${text(settled?.error) || "UNKNOWN"}`);
      }
      completed = settled;
      break;
    }
    if (completed?.pending === true) {
      await ServiceExecutionRuntime.cancelPending({
        organization_id,
        provider: completed.provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        pricing: object(completed.pricing),
        metadata: {
          module: "CREATIVE",
          operation: `${operation}_SETTLEMENT_TIMEOUT`,
          creative_mission_id,
          creative_project_id,
          creative_tribunal_contract: CONTRACT,
        },
        execution_lane: "deep",
        reason: `${operation}_PENDING_SETTLEMENT_TIMEOUT`,
      }).catch(() => null);
      throw new Error(`${operation}_PENDING_SETTLEMENT_TIMEOUT`);
    }
  }

  const output = normalizedOutput(completed, expects);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result: completed };
}

function qualityFloor(plan = {}) {
  const quality = object(plan.quality);
  const configured = finite(
    quality.minimum_release_score ??
    quality.minimum_scene_score,
  );
  return Math.max(90, Math.min(100, configured ?? 90));
}

function criticPlanningPayload(context, plan) {
  return {
    task: "Design the smallest sufficient independent expert review panel for this exact Creative Master Plan.",
    contract: {
      output: {
        reviewers: [{
          id: "stable-reviewer-id",
          role: "mission-specific expert discipline",
          mandate: "specific independent review responsibility",
          evidence_focus: ["specific evidence sources"],
          failure_modes: ["specific failures this reviewer must detect"],
          weight: "positive number",
        }],
        rationale: "why this panel is sufficient for this exact mission",
      },
      rules: [
        `Choose between ${MINIMUM_REVIEWERS} and ${MAXIMUM_REVIEWERS} reviewers based on actual mission complexity, medium, rights, identity, product, factual, interaction, engineering, brand, cultural and production risks.`,
        "Do not select reviewers from an industry template or fixed house list.",
        "Each reviewer must own a distinct failure class and be necessary for this exact plan.",
        "Collectively cover creative quality, business effectiveness and production/release risk without redundant mandates.",
        "For factual reviewers, distinguish externally checkable claims from plausible internal or illustrative business UI. Internal screen labels are not published-report claims unless the plan explicitly attributes them to a real external source.",
        "Do not author reviewer mandates or failure modes that convert internal UI labels into invented external-source claims.",
        "Do not include provider selection or prompt-writing roles.",
        "Distinguish external factual claims from plausible illustrative or internal business UI. A generic internal label such as a current-quarter cash-flow screen is not, by itself, a claim that a published third-party financial report exists. Require external verification only when the plan attributes real figures, named entities, published sources, regulated facts or other externally checkable claims.",
      ],
    },
    context,
    plan,
  };
}

function currentPlanEvidenceIds(plan = {}) {
  const ids = new Set();
  for (const scene of list(plan.scenes)) {
    for (const id of list(scene?.reference_asset_ids).map(text).filter(Boolean)) ids.add(id);
    for (const shot of list(scene?.shots)) {
      const primary = text(shot?.primary_source_asset_id);
      if (primary) ids.add(primary);
      for (const ref of list(shot?.reference_assets)) {
        const id = text(ref?.asset_id || ref?.id);
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

function geographicEvidenceIds(plan = {}) {
  const ids = new Set();
  for (const scene of list(plan.scenes)) {
    const locationType = text(scene?.location?.type).toLowerCase();
    const geographicScene = /natural|urban|geograph|landmark|exterior|global/.test(locationType);
    if (geographicScene) {
      for (const id of list(scene?.reference_asset_ids).map(text).filter(Boolean)) ids.add(id);
    }
    for (const shot of list(scene?.shots)) {
      for (const ref of list(shot?.reference_assets)) {
        if (text(ref?.role).toUpperCase() === "GEOGRAPHIC_REFERENCE" && text(ref?.asset_id)) {
          ids.add(text(ref.asset_id));
        }
      }
    }
  }
  return [...ids];
}

function factualReviewer(reviewer = {}) {
  const signal = `${text(reviewer?.id)} ${text(reviewer?.role)} ${text(reviewer?.mandate)}`.toLowerCase();
  return /fact|data|authenticity|claim|report|financial|industry context/.test(signal);
}

function normalizeReviewerPolicy(reviewer = {}) {
  if (!factualReviewer(reviewer)) return reviewer;
  return {
    ...reviewer,
    mandate: "Validate externally checkable factual claims and real-world business plausibility. Treat internal or illustrative business UI labels as fictionalized interface context unless the plan explicitly attributes them to a real company, published report, regulated filing, named dataset or other external source.",
    failure_modes: list(reviewer.failure_modes)
      .map(text)
      .filter(Boolean)
      .filter((failure) => !/non-existent\s+q[1-4]|future financial report|future-quarter report/i.test(failure)),
    factual_claim_boundary: "INTERNAL_UI_IS_NOT_EXTERNAL_CLAIM_WITHOUT_EXPLICIT_ATTRIBUTION",
  };
}

function refreshReviewerEvidenceFocus(reviewers = [], plan = {}) {
  const current = currentPlanEvidenceIds(plan);
  const geographicEvidence = geographicEvidenceIds(plan);
  return list(reviewers).map((inputReviewer) => {
    const reviewer = normalizeReviewerPolicy(inputReviewer);
    const mandate = `${text(reviewer?.role)} ${text(reviewer?.mandate)}`.toLowerCase();
    const authored = list(reviewer?.evidence_focus).map(text).filter(Boolean);
    const retained = authored.filter((id) => current.has(id));
    const evidenceFocus = /geograph|location|place|country|landmark/.test(mandate)
      ? geographicEvidence
      : retained;
    return { ...reviewer, evidence_focus: evidenceFocus };
  });
}

function validatePanel(reviewers = [], rawOutput = null) {
  const rows = list(reviewers);
  if (rows.length < MINIMUM_REVIEWERS || rows.length > MAXIMUM_REVIEWERS) {
    const keys =
      rawOutput && typeof rawOutput === "object"
        ? Object.keys(rawOutput).slice(0, 12).join(",") || "none"
        : typeof rawOutput;
    throw new Error(
      `CREATIVE_TRIBUNAL_REVIEWER_COUNT_INVALID:${rows.length}:keys:${keys}`,
    );
  }
  const ids = new Set();
  for (const reviewer of rows) {
    const id = text(reviewer.id);
    if (!id || ids.has(id)) {
      throw new Error("CREATIVE_TRIBUNAL_REVIEWER_ID_INVALID");
    }
    ids.add(id);
    if (text(reviewer.role).length < 8 || text(reviewer.mandate).length < 40) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEWER_SHALLOW:${id}`);
    }
    const weight = finite(reviewer.weight);
    if (weight === null || weight <= 0) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEWER_WEIGHT_INVALID:${id}`);
    }
  }
  return rows;
}

function canonicalReviewPlan(plan = {}) {
  const canonical = structuredClone(object(plan));
  // Tribunal must judge the authoritative finished plan, not historical evaluators.
  // Council candidates/scorecards intentionally preserve rejected ideas and prior
  // repair notes; exposing them to the final jury makes already-repaired failures
  // look current and creates paid review/repair loops. Self-review fields also
  // anchor independent reviewers on previous scores instead of the work itself.
  for (const key of [
    "common_plan_contract",
    "concept_council",
    "concept_candidates",
    "creative_review",
    "role_decisions",
    "validation_summary",
    "validation",
    "decision_validation",
    "concept_selection_reason",
  ]) {
    delete canonical[key];
  }
  return canonical;
}

function tribunalResumePackage({ plan = {}, tribunal = {} } = {}) {
  const floor = finite(tribunal?.verdict?.required_floor) ?? qualityFloor(plan);
  // Persist every settled scoped judgment, not only passes. A failed review is
  // durable blocker evidence for this exact plan snapshot and must survive restart;
  // otherwise Studio pays to ask the same reviewer again before any repair occurs.
  const settledReviews = list(tribunal.reviews).filter((row) => {
    const review = object(row.review || row);
    return Boolean(text(review.reviewer_id || row?.reviewer?.id));
  });
  const reviewSourcePlan = canonicalReviewPlan(plan);
  return {
    contract: "CREATIVE_TRIBUNAL_RESUME_PACKAGE_V1",
    review_panel: tribunal.panel || null,
    settled_reviews: settledReviews,
    settled_review_source_plan: reviewSourcePlan,
    settled_review_plan_hash: hash(reviewSourcePlan),
    blockers: list(tribunal?.verdict?.blockers),
    required_floor: floor,
  };
}

function reviewerDiscipline(reviewer = {}) {
  const mandate = `${text(reviewer.id)} ${text(reviewer.role)} ${text(reviewer.mandate)}`.toLowerCase();
  // Strong discipline signals must win over broad cross-cutting words such as
  // "continuity". A Brand Truth & Identity Continuity reviewer is a brand
  // reviewer, not an asset reviewer merely because continuity appears in its title.
  if (/narrative|causal|story|emotion|arc/.test(mandate)) return "NARRATIVE";
  if (/brand|identity|logo|wordmark|signage|brand[-_ ]truth/.test(mandate)) return "BRAND_TRUTH";
  if (/production|feasibility|workflow/.test(mandate)) return "PRODUCTION_FEASIBILITY";
  if (/physical|realism|texture|material/.test(mandate)) return "PHYSICAL_REALISM";
  if (/sound|music|sync|tempo|bpm|rhythm/.test(mandate)) return "SOUND_VISUAL_SYNC";
  if (/anti[-_ ]?cliche|originality|derivative|clich[eé]/.test(mandate)) return "ANTI_CLICHE";
  if (/asset|source|manifest|continuity/.test(mandate)) return "ASSET_CONTINUITY";
  return "FULL_PLAN";
}

function narrativeSceneEvidence(scene = {}) {
  // Narrative reuse is bound to causal structure, not presentation labels. Scene
  // titles are editorial labels, and scene.emotion duplicates the authoritative
  // story.emotional_arc already included in narrative evidence. Including both made
  // harmless sound/visual repairs invalidate a narrative verdict even when objective,
  // story function, state change and transition logic were unchanged.
  return {
    id: scene.id,
    objective: scene.objective,
    duration_seconds: scene.duration_seconds,
    story_function: scene.story_function,
    story_state_before: scene.story_state_before,
    state_change: scene.state_change,
    story_state_after: scene.story_state_after,
    transition_logic: scene.transition_logic,
  };
}

function brandProductionEvidence(plan = {}) {
  const signal = /\b(?:brand|logo|wordmark|sign|signage|text|chalkboard|typography|identity)\b/i;
  return list(plan.deliverables).flatMap((deliverable) =>
    list(deliverable.production_steps)
      .filter((step) => signal.test(JSON.stringify({
        title: step.title, purpose: step.purpose, output_spec: step.output_spec, requirements: step.requirements,
      })))
      .map((step) => ({
        deliverable_id: deliverable.id || null,
        deliverable_type: deliverable.type || null,
        channels: list(deliverable.channels),
        id: step.id, title: step.title, purpose: step.purpose,
        output_spec: step.output_spec, requirements: step.requirements,
      })),
  );
}

function brandConceptEvidence(concept = {}) {
  return {
    selected_concept_id: concept.selected_concept_id || concept.id || null,
    creative_system: concept.creative_system || null,
    refused_devices: concept.refused_devices || [],
    brand_rules: concept.brand_rules || null,
    production_approach: concept.production_approach || null,
  };
}

function productionConceptEvidence(concept = {}) {
  return {
    selected_concept_id: concept.selected_concept_id || concept.id || null,
    production_approach: concept.production_approach || null,
    visual_system: concept.visual_system
      ? {
          camera_language: concept.visual_system.camera_language || null,
          editing_language: concept.visual_system.editing_language || null,
          production_approach: concept.visual_system.production_approach || null,
        }
      : null,
    refused_devices: concept.refused_devices || [],
  };
}

function antiClicheConceptEvidence(concept = {}) {
  return {
    id: concept.id || null,
    title: concept.title || null,
    hook: concept.hook || null,
    narrative: concept.narrative || null,
    creative_thesis: concept.creative_thesis || null,
    signature_device: concept.signature_device || null,
    visual_system: concept.visual_system
      ? {
          world: concept.visual_system.world || null,
          signature_images: concept.visual_system.signature_images || [],
          production_approach: concept.visual_system.production_approach || null,
        }
      : null,
    refused_devices: concept.refused_devices || [],
  };
}

function antiClicheProductionEvidence(deliverables = []) {
  return list(deliverables).map((deliverable) => ({
    id: deliverable.id || null,
    production_steps: list(deliverable.production_steps).map((step) => ({
      id: step.id || null,
      title: step.title || null,
      narrative_structure: step.output_spec?.narrative_structure || null,
      selected_signature_device: step.requirements?.selected_signature_device || null,
    })),
  }));
}

function reviewerPlanEvidence(reviewer = {}, plan = {}) {
  const canonical = canonicalReviewPlan(plan);
  switch (reviewerDiscipline(reviewer)) {
    case "NARRATIVE":
      return {
        workflow_kind: canonical.workflow_kind,
        concept: canonical.concept,
        story: canonical.story,
        story_architecture: canonical.story_architecture,
        scenes: list(canonical.scenes).map(narrativeSceneEvidence),
      };
    case "BRAND_TRUTH":
      return {
        workflow_kind: canonical.workflow_kind,
        concept: brandConceptEvidence(canonical.concept || {}),
        asset_manifest: canonical.asset_manifest,
        scenes: list(canonical.scenes).map((scene) => ({
          id: scene.id, title: scene.title, objective: scene.objective,
          brand_rules: scene.brand_rules, reference_asset_ids: scene.reference_asset_ids,
        })),
        brand_production_steps: brandProductionEvidence(canonical),
      };
    case "PRODUCTION_FEASIBILITY":
    case "PHYSICAL_REALISM":
      return {
        workflow_kind: canonical.workflow_kind,
        concept: productionConceptEvidence(canonical.concept || {}),
        production_approach: canonical.production_approach,
        deliverables: canonical.deliverables,
        scenes: list(canonical.scenes).map((scene) => ({
          id: scene.id, title: scene.title, visual_style: scene.visual_style,
          production_design: scene.production_design, continuity: scene.continuity,
          shots: list(scene.shots).map((shot) => ({
            id: shot.id, action: shot.action, visual: shot.visual,
            frame_plan: shot.frame_plan, vfx: shot.vfx, transition: shot.transition,
          })),
        })),
      };
    case "SOUND_VISUAL_SYNC":
      return {
        workflow_kind: canonical.workflow_kind,
        concept: canonical.concept,
        story: canonical.story,
        music: canonical.music,
        scenes: list(canonical.scenes).map((scene) => ({
          id: scene.id, title: scene.title, duration_seconds: scene.duration_seconds,
          audio_style: scene.audio_style, transition_logic: scene.transition_logic,
          shots: list(scene.shots).map((shot) => ({
            id: shot.id, duration_seconds: shot.duration_seconds, action: shot.action,
            audio: shot.audio, frame_plan: shot.frame_plan, transition: shot.transition,
          })),
        })),
      };
    case "ASSET_CONTINUITY":
      return {
        workflow_kind: canonical.workflow_kind,
        asset_manifest: canonical.asset_manifest,
        deliverables: canonical.deliverables,
        scenes: list(canonical.scenes).map((scene) => ({
          id: scene.id, reference_asset_ids: scene.reference_asset_ids,
          shots: list(scene.shots).map((shot) => ({
            id: shot.id, primary_source_asset_id: shot.primary_source_asset_id,
            reference_assets: shot.reference_assets, reference_asset_ids: shot.reference_asset_ids,
          })),
        })),
      };
    case "ANTI_CLICHE":
      return {
        workflow_kind: canonical.workflow_kind,
        concept: antiClicheConceptEvidence(canonical.concept || {}),
        story: {
          hook: canonical.story?.hook || null,
          resolution: canonical.story?.resolution || null,
          observable_proof: canonical.story?.observable_proof || null,
          anti_cliche_strategy: canonical.story?.anti_cliche_strategy || null,
        },
        anti_cliche_rules: canonical.anti_cliche_rules,
        deliverables: antiClicheProductionEvidence(canonical.deliverables),
      };
    default:
      return canonical;
  }
}

function hasExactBrandTruthAuthority(plan = {}) {
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8) return false;
    if (!Array.isArray(value) && text(value.contract) === "CREATIVE_BRAND_TRUTH_V1" && text(value.brand_truth_hash)) return true;
    return (Array.isArray(value) ? value : Object.values(value)).some((child) => visit(child, depth + 1));
  };
  return visit(canonicalReviewPlan(plan));
}

function activeReviewerAuthority(reviewer = {}, plan = {}) {
  const normalized = normalizeReviewerPolicy(reviewer);
  const exactBrandTruth = hasExactBrandTruthAuthority(plan);
  const discipline = reviewerDiscipline(normalized);
  const mandate = discipline === "BRAND_TRUTH" && !exactBrandTruth
    ? "Verify brand continuity against current evidence and exact supplied brand assets. Distinguish creative art-direction choices from official brand truth. A palette choice explicitly labeled non-official may be mandatory creative direction without becoming an official brand specification. Do not require an exact hex color, font family, spacing percentage or other exact brand specification unless authoritative CREATIVE_BRAND_TRUTH_V1 evidence in the current plan supports that exact value."
    : normalized.mandate;
  return {
    id: normalized.id,
    role: normalized.role,
    mandate,
    evidence_focus: list(normalized.evidence_focus).map(text).filter(Boolean),
    weight: normalized.weight,
    factual_claim_boundary: normalized.factual_claim_boundary || null,
    exact_brand_truth_authorized: discipline === "BRAND_TRUTH" ? exactBrandTruth : null,
  };
}

function legacyReviewerPlanEvidence(reviewer = {}, plan = {}) {
  const canonical = canonicalReviewPlan(plan);
  const discipline = reviewerDiscipline(reviewer);
  if (discipline === "BRAND_TRUTH") {
    return {
      workflow_kind: canonical.workflow_kind,
      concept: canonical.concept,
      asset_manifest: canonical.asset_manifest,
      scenes: list(canonical.scenes).map((scene) => ({
        id: scene.id, title: scene.title, objective: scene.objective,
        brand_rules: scene.brand_rules, reference_asset_ids: scene.reference_asset_ids,
      })),
      brand_production_steps: brandProductionEvidence(canonical),
    };
  }
  if (["PRODUCTION_FEASIBILITY", "PHYSICAL_REALISM"].includes(discipline)) {
    return {
      workflow_kind: canonical.workflow_kind,
      concept: canonical.concept,
      production_approach: canonical.production_approach,
      deliverables: canonical.deliverables,
      scenes: list(canonical.scenes).map((scene) => ({
        id: scene.id, title: scene.title, visual_style: scene.visual_style,
        production_design: scene.production_design, continuity: scene.continuity,
        shots: list(scene.shots).map((shot) => ({
          id: shot.id, action: shot.action, visual: shot.visual,
          frame_plan: shot.frame_plan, vfx: shot.vfx, transition: shot.transition,
        })),
      })),
    };
  }
  return reviewerPlanEvidence(reviewer, plan);
}

function legacyReviewerEvidenceHash({ reviewer, context, plan, floor }) {
  return hash({
    contract: CONTRACT,
    review_policy_version: REVIEW_POLICY_VERSION,
    reviewer: activeReviewerAuthority(reviewer, plan),
    required_release_floor: floor,
    context,
    evidence: legacyReviewerPlanEvidence(reviewer, plan),
  });
}

function reviewerEvidenceHash({ reviewer, context, plan, floor }) {
  return hash({
    contract: CONTRACT,
    review_policy_version: REVIEW_POLICY_VERSION,
    reviewer: activeReviewerAuthority(reviewer, plan),
    required_release_floor: floor,
    context,
    evidence: reviewerPlanEvidence(reviewer, plan),
  });
}

function reviewTemporalAuthority() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return {
    contract: "CREATIVE_REVIEW_TEMPORAL_AUTHORITY_V1",
    current_timestamp_utc: now.toISOString(),
    current_year: now.getUTCFullYear(),
    current_quarter: `Q${Math.floor((month - 1) / 3) + 1}`,
  };
}

function reviewPayload({ reviewer, context, plan, floor }) {
  const activeReviewer = activeReviewerAuthority(reviewer, plan);
  if (reviewerDiscipline(reviewer) === "ANTI_CLICHE") {
    return {
      task: "Independently judge whether the current creative device is original, mission-specific and internally coherent. Fail generic enterprise-tech metaphors and contradictions.",
      reviewer: activeReviewer,
      reviewer_scoped_evidence: reviewerPlanEvidence(reviewer, plan),
      required_release_floor: floor,
      output: {
        reviewer_id: reviewer.id,
        score: "0-100",
        passed: "boolean",
        strengths: ["specific strength"],
        failures: ["specific failure"],
        mandatory_repairs: ["specific repair"],
        fatal_rejection_reason: null,
        weakest_link: "single weakest point",
        evidence_used: ["specific current-plan evidence"],
      },
      rules: [
        `passed may be true only when score is at least ${floor}.`,
        "Judge only the supplied current creative evidence. Do not cite external campaign counts or unsupported market research.",
        "Reject grids, puzzle/shard-to-unity, generic networks, glowing nodes, generic dashboards or other swappable enterprise-tech metaphors when they are the core idea rather than mission-specific authored visual logic.",
        "A still image must communicate through one resolved composition; reject temporal wording or transformation logic that the static frame cannot show.",
      ],
      context: {
        mission: { objective: context?.mission?.objective || null },
        project: { title: context?.project?.title || null, production_type: context?.project?.production_type || null },
      },
    };
  }
  return {
    task: "Independently review the supplied final Creative Master Plan. You did not create it and must fail weak work rather than defend it.",
    reviewer: activeReviewer,
    reviewer_scoped_evidence: reviewerPlanEvidence(reviewer, plan),
    required_release_floor: floor,
    temporal_authority: reviewTemporalAuthority(),
    output: {
      reviewer_id: reviewer.id,
      score: "0-100",
      passed: "boolean",
      strengths: ["specific strengths"],
      failures: ["specific failures"],
      mandatory_repairs: ["specific repairs"],
      fatal_rejection_reason: null,
      weakest_link: "single weakest point",
      evidence_used: ["specific evidence"],
    },
    rules: [
      `passed may be true only when score is at least ${floor}.`,
      "Judge the finished creative direction, not whether the JSON is complete.",
      "Reject generic language, derivative concepts, swappable brand ideas, unjustified style choices, unsupported facts, weak audience logic, inappropriate medium choice, hidden production assumptions, synthetic-looking craft and unresolved finishing risk when relevant to your mandate.",
      "If the plan explicitly authorizes generated media, do not fail it merely because AI or synthetic generation is used. Judge the proposed or observed craft for realism, physical coherence, continuity, geography, brand fidelity and visible synthetic artifacts. Treat phrases such as avoid generic AI imagery or non-AI feel as quality requirements, not a ban on approved generation methods, unless the mission explicitly forbids generated media.",
      "Do not demand practical filming, human crews or replacement of an authorized generation pipeline solely to satisfy realism; require concrete visual/continuity repairs instead.",
      "Apply your mandate only; do not imitate other reviewers or average toward consensus.",
      "Treat each deliverable as an independent output variant. Repeated local production-step ids across different deliverables are not duplicates, and differences in dimensions, safe areas, crop, spacing or composition between channels are expected unless the same deliverable contradicts itself.",
      "Do not cite market studies, industry analyses, campaign counts, benchmark statistics or other external research unless that evidence is explicitly present in reviewer_scoped_evidence or the current canonical plan.",
      "Do not require exact brand colors, fonts, spacing values or other brand-truth proof unless your reviewer mandate is BRAND_TRUTH. Other disciplines may flag visible inconsistency, but must defer exact brand authority to brand review.",
      "Panel-composition failure modes and earlier review failures are historical risk-selection context, never proof that the current plan still has those defects. Fail a risk only when reviewer_scoped_evidence or the current canonical plan demonstrates it now.",
      "Never quote, paraphrase as current fact, or cite plan content that is absent from reviewer_scoped_evidence and the current canonical plan, even if it appeared in an earlier panel, repair, candidate or review.",
      "For brand review, qualitative source evidence such as a blue color scheme or clean typography does not authorize an exact hex value, exact font family, exact spacing percentage or other invented precision. Treat exact values as authoritative brand requirements only when reviewer.exact_brand_truth_authorized is true or an exact supplied brand asset itself proves the requirement.",
      "When reviewer.exact_brand_truth_authorized is false, an exact brand value merely appearing in the current plan is evidence of a proposed or potentially unsupported value, never proof that it is authorized. Do not praise it as authorized, brand-correct, official or required. You may instead identify it as unverified precision that must be removed or proven by authoritative brand evidence.",
      "A creative palette choice explicitly labeled as not official brand truth is art direction, not an unsupported brand claim. Do not fail it merely because it is mandatory within the creative concept; fail only if the plan misrepresents it as official, exact or brand-authorized.",
      "Before claiming required evidence is missing, inspect reviewer_scoped_evidence. If the evidence is present, judge its quality and sufficiency instead of claiming absence.",
      "For factual review, distinguish external factual claims from plausible illustrative/internal business UI. A current-quarter internal cash-flow view is temporally plausible and is not evidence of a published third-party report unless the plan actually makes that attribution. Do not invent an external-source claim and then fail the plan for lacking that invented source. Require verification only for real figures, named entities, published sources, regulated facts or other externally checkable claims.",
      "For any date-, quarter-, deadline- or recency-sensitive judgment, use temporal_authority as the authoritative review clock. Do not call a period future, past or complete unless that follows from this clock.",
      "Do not suggest provider prompts or provider-specific parameters.",
    ],
    context,
  };
}

function comparableEvidenceText(value) {
  return text(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceFragmentSupported(fragment, ...authorities) {
  const exact = text(fragment).toLowerCase();
  if (authorities.some((authority) => text(authority).toLowerCase().includes(exact))) return true;
  const comparable = comparableEvidenceText(fragment);
  if (comparable.length < 24) return false;
  return authorities.some((authority) => comparableEvidenceText(authority).includes(comparable));
}

function assertReviewAuthority({ reviewer = {}, review = {}, plan = {} } = {}) {
  const body = JSON.stringify(review).toLowerCase();
  const planText = JSON.stringify(canonicalReviewPlan(plan)).toLowerCase();
  const scopedEvidenceText = JSON.stringify(reviewerPlanEvidence(reviewer, plan)).toLowerCase();
  const reviewerAuthorityText = JSON.stringify(activeReviewerAuthority(reviewer, plan)).toLowerCase();
  const reviewPolicyText = JSON.stringify(
    reviewPayload({ reviewer, context: {}, plan, floor: qualityFloor(plan) }).rules,
  ).toLowerCase();
  const discipline = reviewerDiscipline(reviewer);

  for (const evidence of list(review.evidence_used).map(text).filter(Boolean)) {
    for (const fragment of quotedEvidenceFragments(evidence)) {
      if (fragment && /[A-Za-z]/.test(fragment) && !evidenceFragmentSupported(fragment, scopedEvidenceText, planText, reviewerAuthorityText, reviewPolicyText)) {
        throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:UNSUPPORTED_QUOTED_EVIDENCE`);
      }
    }
  }

  const allegesExternalResearch = /industry analysis|market analysis|benchmark study|recent industry|\b\d+\+?\s+(?:b2b\s+)?(?:ad\s+)?campaigns\b|campaign count|market study/.test(body);
  const evidenceContainsExternalResearch = /industry analysis|market analysis|benchmark study|market study|campaign count/.test(scopedEvidenceText) || /industry analysis|market analysis|benchmark study|market study|campaign count/.test(planText);
  if (allegesExternalResearch && !evidenceContainsExternalResearch) {
    throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:UNSUPPORTED_EXTERNAL_RESEARCH_CLAIM`);
  }

  if (discipline !== "BRAND_TRUTH") {
    const demandsExactBrandTruth = /provide exact (?:brand )?(?:color )?hex|provide exact hex|exact brand color hex|exact font family|exact brand spacing|approved brand color value|replace[^.]{0,120}with approved brand color|add evidence of brand color authorization|exact hex values?|use exact hex|exact color values?/.test(body);
    if (demandsExactBrandTruth) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:CROSS_DISCIPLINE_EXACT_BRAND_DEMAND`);
    }
  }

  if (["PRODUCTION_FEASIBILITY", "PHYSICAL_REALISM"].includes(discipline)) {
    const allegesPhysicalProduction = /physical production|physical set|projection-mapped|projection mapped/.test(body);
    const evidenceContainsPhysicalProduction = /physical production|physical set|projection-mapped|projection mapped/.test(scopedEvidenceText);
    if (allegesPhysicalProduction && !evidenceContainsPhysicalProduction) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:UNSUPPORTED_PHYSICAL_PRODUCTION_CLAIM`);
    }
  }

  if (discipline === "BRAND_TRUTH" && !hasExactBrandTruthAuthority(plan)) {
    const exactBrandMention = /#[0-9a-f]{6}|helvetica|exact font|exact hex|primary color violation/.test(body);
    const misclassifiesNonOfficialCreativePalette = /creative palette (?:blue|red|green|orange|yellow|purple|violet|pink|gold|silver|black|white|gray|grey|teal|cyan|magenta|navy)/.test(body) && /not claimed as an official brand color/.test(body) && /(?:must be removed|remove the color specification|evidence-backed brand color|brand authorization|official brand authorization)/.test(body);
    if (misclassifiesNonOfficialCreativePalette) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:CREATIVE_PALETTE_MISCLASSIFIED_AS_BRAND_TRUTH`);
    }
    const explicitlyTreatsPrecisionAsUnverified = /unverified|unauthorized|not authoritative|invented precision|unsupported exact|verify against (?:the )?(?:supplied )?brand asset|remove (?:the )?exact/.test(body);
    if (exactBrandMention && !explicitlyTreatsPrecisionAsUnverified) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:UNVERIFIED_EXACT_BRAND_CLAIM`);
    }
  }

  if (factualReviewer(reviewer)) {
    const inventedPublicationClaim =
      /published (?:q[1-4]|quarter|financial)|future-quarter financial report|financial reports exist|published report/.test(body) &&
      /finance - cash flow - q[1-4] 20\d{2}/.test(planText) &&
      !/published report|annual report|quarterly report|sec filing|regulatory filing|source_url|external source/.test(planText);
    if (inventedPublicationClaim) {
      throw new Error(`CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION:${text(reviewer.id)}:INVENTED_EXTERNAL_CLAIM`);
    }
  }
  return review;
}

function aggregate(reviews = [], floor) {
  const rows = list(reviews);
  let weighted = 0;
  let totalWeight = 0;
  const mandatoryRepairs = [];
  const failures = [];
  // The panel must be unanimous: a weighted average above the floor still fails if
  // any single discipline is below it. Recording who blocked the verdict is what
  // makes that legible -- reporting only the aggregate produced rejections that
  // read as self-contradictory ("90.83 rejected against a floor of 90").
  const blockers = [];
  let passed = true;

  for (const row of rows) {
    const reviewer = object(row.reviewer);
    const review = object(row.review);
    const weight = finite(reviewer.weight) ?? 1;
    const score = finite(review.score);
    const fatal = text(review.fatal_rejection_reason);
    const failed =
      score === null ||
      score < floor ||
      review.passed !== true ||
      Boolean(fatal);

    if (failed) {
      passed = false;
      blockers.push({
        reviewer_id: text(reviewer.id) || null,
        reviewer_role: text(reviewer.role) || null,
        score,
        required_floor: floor,
        reviewer_passed: review.passed === true,
        fatal_rejection_reason: fatal || null,
        weakest_link: text(review.weakest_link) || null,
      });
    }

    weighted += (score ?? 0) * weight;
    totalWeight += weight;
    mandatoryRepairs.push(...list(review.mandatory_repairs).map(text));
    failures.push(...list(review.failures).map(text));
  }

  const weightedScore = totalWeight ? weighted / totalWeight : 0;
  if (weightedScore < floor) {
    passed = false;
    blockers.push({
      reviewer_id: "PANEL_AVERAGE",
      reviewer_role: null,
      score: Number(weightedScore.toFixed(2)),
      required_floor: floor,
      reviewer_passed: false,
      fatal_rejection_reason: null,
      weakest_link: null,
    });
  }

  return {
    passed,
    weighted_score: Number(weightedScore.toFixed(2)),
    required_floor: floor,
    blockers,
    mandatory_repairs: [...new Set(mandatoryRepairs.filter(Boolean))],
    failures: [...new Set(failures.filter(Boolean))],
  };
}

// Which reviewers blocked the verdict, and on what. The repair was handed the whole
// tribunal and asked to "resolve every tribunal failure", which is the same vagueness that
// left manifest completeness unfixed for a whole session: the panel is unanimous, so one
// reviewer below the floor rejects the plan while five others pass, and nothing distinguished
// the one that mattered. Every case in this benchmark fails on exactly this -- a weighted
// score at or near the floor with a single discipline underneath it.
//
// Derived from the verdict rather than restated, so it cannot disagree with what actually
// blocked the plan.
function blockingReviewerBrief(tribunal = {}) {
  const blockers = list(tribunal?.verdict?.blockers);
  const reviews = list(tribunal?.reviews);

  return blockers
    .filter((entry) => text(entry.reviewer_id) && entry.reviewer_id !== "PANEL_AVERAGE")
    .map((entry) => {
      const review = reviews.find(
        (row) => text(row?.review?.reviewer_id || row?.reviewer?.id) === text(entry.reviewer_id),
      );
      return {
        reviewer_id: entry.reviewer_id,
        reviewer_role: entry.reviewer_role,
        score: entry.score,
        required_floor: entry.required_floor,
        weakest_link: entry.weakest_link || review?.review?.weakest_link || null,
        fatal_rejection_reason: entry.fatal_rejection_reason,
        failures: list(review?.review?.failures),
        mandatory_repairs: list(review?.review?.mandatory_repairs),
      };
    });
}

function blockerQuotedEvidenceFragments(tribunal = {}) {
  const blockingIds = new Set(
    list(tribunal?.verdict?.blockers)
      .map((entry) => text(entry?.reviewer_id))
      .filter((id) => id && id !== "PANEL_AVERAGE"),
  );
  const fragments = new Set();
  const quotePattern = /[\"'`](.{24,240}?)[\"'`]/g;
  for (const row of list(tribunal?.reviews)) {
    const reviewerId = text(row?.review?.reviewer_id || row?.reviewer?.id);
    if (!blockingIds.has(reviewerId)) continue;
    const review = object(row?.review || row);
    const sources = [review.weakest_link, ...list(review.evidence_used)];
    for (const source of sources.map(text).filter(Boolean)) {
      for (const match of source.matchAll(quotePattern)) {
        const fragment = text(match[1]);
        if (fragment.length >= 24 && /[A-Za-z]/.test(fragment)) fragments.add(fragment);
      }
    }
  }
  return [...fragments];
}

function unresolvedQuotedBlockerEvidence(tribunal = {}, candidate = {}) {
  const candidateText = JSON.stringify(canonicalReviewPlan(candidate)).toLowerCase();
  return blockerQuotedEvidenceFragments(tribunal).filter((fragment) =>
    candidateText.includes(fragment.toLowerCase()),
  );
}

function unchangedBlockingReviewerEvidence(tribunal = {}, beforePlan = {}, candidate = {}) {
  const blockingIds = new Set(
    list(tribunal?.verdict?.blockers)
      .map((entry) => text(entry?.reviewer_id))
      .filter((id) => id && id !== "PANEL_AVERAGE"),
  );
  return list(tribunal?.reviews)
    .filter((row) => blockingIds.has(text(row?.review?.reviewer_id || row?.reviewer?.id)))
    .filter((row) => {
      const reviewer = object(row?.reviewer);
      if (!text(reviewer.id)) return false;
      return hash(reviewerPlanEvidence(reviewer, beforePlan)) === hash(reviewerPlanEvidence(reviewer, candidate));
    })
    .map((row) => text(row?.review?.reviewer_id || row?.reviewer?.id));
}

function normalizedRepairPatch(output = {}, basePlan = {}) {
  const root = object(output);
  const explicitPlan = object(root.plan);
  const forbiddenControlKeys = [
    "task", "rules", "context", "tribunal", "blocking_reviewers",
    "passed_reviewers_to_preserve", "rejected_repair_feedback", "output",
  ];
  if (!Object.keys(explicitPlan).length && forbiddenControlKeys.some((key) => root[key] !== undefined)) {
    throw new Error("CREATIVE_TRIBUNAL_REPAIR_CONTROL_ENVELOPE_AS_PLAN");
  }
  const envelope = Object.keys(explicitPlan).length ? explicitPlan : root;
  const common = object(envelope.common_plan_contract);
  const patch = { ...envelope, ...common };
  delete patch.common_plan_contract;

  const repairedRefusedDevices = list(patch.concept?.refused_devices).map(text).filter(Boolean);
  if (repairedRefusedDevices.length && !Array.isArray(patch.anti_cliche_rules)) {
    patch.anti_cliche_rules = repairedRefusedDevices;
  }

  const baseStepById = new Map(
    list(basePlan.deliverables).flatMap((deliverable) =>
      list(deliverable.production_steps).map((step) => [text(step.id), step]),
    ),
  );
  if (Array.isArray(patch.deliverables)) {
    patch.deliverables = patch.deliverables.map((deliverable) => ({
      ...deliverable,
      production_steps: list(deliverable.production_steps).map((step) => {
        const baseStep = baseStepById.get(text(step.id));
        return baseStep
          ? {
              ...step,
              service: baseStep.service,
              capability: baseStep.capability,
              provider: baseStep.provider,
              model: baseStep.model,
            }
          : step;
      }),
    }));
  }

  const assignments = new Map();
  for (const deliverable of list(patch.deliverables)) {
    for (const step of list(deliverable.production_steps)) {
      const sourceAssetId = text(step.output_spec?.source_asset_id || step.requirements?.source_asset_id);
      const sceneAssignment = text(step.output_spec?.scene_assignment || step.requirements?.scene_assignment);
      if (sourceAssetId && sceneAssignment) assignments.set(sourceAssetId, sceneAssignment);
    }
  }
  if (assignments.size && Array.isArray(basePlan.asset_manifest)) {
    patch.asset_manifest = basePlan.asset_manifest.map((asset) => {
      const sceneAssignment = assignments.get(text(asset.asset_id));
      return sceneAssignment ? { ...asset, assignments: [sceneAssignment] } : asset;
    });
  }
  return patch;
}

function fatalConceptReplacementRequired(tribunal = {}) {
  return blockingReviewerBrief(tribunal).some((entry) => {
    const combined = [entry.fatal_rejection_reason, entry.weakest_link, ...list(entry.failures), ...list(entry.mandatory_repairs)]
      .map(text).join(" ").toLowerCase();
    return /(?:concept (?:itself|fundamentally|is the)|core visual concept|complete conceptual replacement|unrecoverable without .*replacement|replace the .*concept|replace[^.]{0,120}(?:clich[eé]d|generic)[^.]{0,120}(?:device|metaphor|visual language)|unique,? non-generic (?:abstract )?device)/.test(combined);
  });
}

function compactRepairContext(context = {}) {
  return {
    mission: {
      objective: context?.mission?.objective || null,
      desired_outcome: context?.mission?.desired_outcome || null,
    },
    project: {
      production_type: context?.project?.production_type || null,
      channels: list(context?.project?.channels),
      languages: list(context?.project?.languages),
    },
    brief: {
      objective: context?.brief?.objective || null,
      audience: context?.brief?.audience || null,
      message: context?.brief?.message || null,
    },
    assets: list(context?.assets).map((asset) => ({
      id: asset.id || null,
      type: asset.type || null,
      name: asset.name || null,
      rights: asset.rights || null,
      restrictions: asset.restrictions || null,
    })),
  };
}

function compactRepairPlan(plan = {}) {
  const canonical = canonicalReviewPlan(plan);
  return {
    workflow_kind: canonical.workflow_kind,
    selected_concept_id: canonical.selected_concept_id,
    story: canonical.story,
    concept: canonical.concept,
    anti_cliche_rules: canonical.anti_cliche_rules,
    motif_limits: canonical.motif_limits,
    deliverables: canonical.deliverables,
    scenes: canonical.scenes,
    asset_manifest: canonical.asset_manifest,
    semantic_mission_contract: canonical.semantic_mission_contract,
  };
}

function repairPayload({ context, plan, tribunal, rejected_repairs = [] }) {
  const blocking = blockingReviewerBrief(tribunal);
  const requiresConceptReplacement = fatalConceptReplacementRequired(tribunal);
  const blockingIds = new Set(blocking.map((entry) => text(entry.reviewer_id)).filter(Boolean));
  const passedReviewers = list(tribunal?.reviews)
    .filter((row) => !blockingIds.has(text(row?.review?.reviewer_id || row?.reviewer?.id)))
    .map((row) => ({
      reviewer_id: text(row?.review?.reviewer_id || row?.reviewer?.id),
      score: finite(row?.review?.score),
      strengths: list(row?.review?.strengths),
      preservation_note: "This reviewer already passed. Preserve its accepted evidence; do not treat its optional suggestions or mandatory_repairs as repair work unless a blocking reviewer independently requires the same change.",
    }));
  return {
    task: "Repair the supplied Creative Master Plan so it resolves every blocking tribunal failure without changing the mission, inventing evidence, lowering quality thresholds, changing approved rights, or inventing unavailable services/capabilities.",
    blocking_reviewers: blocking,
    passed_reviewers_to_preserve: passedReviewers,
    output:
      'Return exactly one JSON object with exactly one top-level key: {"plan": {...}}. The plan value is a patch against the supplied Creative Master Plan. Return every key you change; keys you omit keep their reviewed values. Any array you return replaces the existing array in full, so return complete arrays. Do not echo task, rules, context, tribunal, reviewer data, or any control envelope.', 
    rules: [
      "Preserve workflow_kind unless the tribunal identifies a fatal medium mismatch; if changing it would violate an explicit mission constraint, fail rather than changing it.",
      "Preserve all exact source-asset and rights restrictions.",
      "Preserve only registered service/capability pairs already present in the verified capability context.",
      "Do not add prompts, provider prompts, provider parameters or provider identities.",
      "Resolve every mandatory repair from blocking_reviewers concretely in concept, deliverables, production structure, scenes/shots where applicable, and creative_review.",
      'The response must have exactly one top-level key named "plan". Do not return task, rules, context, tribunal, blocking_reviewers, passed_reviewers_to_preserve, rejected_repair_feedback, output, creative_system, production, or directors as top-level keys.',
      "Inside plan, use only the exact field names and nesting already present in the supplied plan. Do not invent convenience aliases or a parallel schema. If the reviewed field is deliverables[].production_steps[].output_spec.narrative_structure, repair that exact field in the complete replacement deliverables array.",
      "When a blocker names an exact field/path or quotes stale content, replace that exact field/content in its existing nested location. Adding a parallel sibling field is not a repair; for example, changing concept.production_approach does not repair concept.visual_system.production_approach.",
      "Do not implement a suggestion or mandatory_repair from a reviewer that already passed unless a blocking reviewer independently requires the same change. Passed-reviewer feedback is preservation evidence, not repair authority.",
      "Never create a new physical, factual, rights, continuity or brand claim merely to satisfy another discipline. When a requested wording would be physically impossible or unsupported, use a truthful physically plausible formulation that preserves the underlying creative intent.",
      "After repair, creative_review.repair_before_production must be empty and creative_review must truthfully reflect the repaired work.",
      requiresConceptReplacement
        ? "A blocking reviewer has rejected the selected concept itself, not merely its execution. Perform a true concept replacement: change concept.title, concept.signature_device, concept.creative_thesis, concept.hook, concept.narrative, concept.visual_system, story hook/resolution/observable_proof/anti_cliche_strategy, and every production-step title, purpose, narrative_structure and selected_signature_device that still encodes the rejected concept. Preserve selected_concept_id only as the governance slot identifier. Do not keep the old concept name or signature device, do not merely rename/reskin the same metaphor, and do not copy a reviewer-suggested example metaphor verbatim as the new creative idea. Invent a distinct, mission-specific visual idea from the supplied business truth and constraints."
        : null,
      blocking.length
        ? `The panel is unanimous, so these reviewers alone are why the plan is rejected: ${blocking
            .map((entry) => `${entry.reviewer_id} scored ${entry.score} against a floor of ${entry.required_floor}`)
            .join("; ")}. Raise each of them above the floor by resolving their own failures, mandatory_repairs and weakest_link specifically. Reviewers who already passed do not need further work, and rewriting what they approved risks losing it.`
        : null,
    ].filter(Boolean),
    context: compactRepairContext(context),
    rejected_repair_feedback: list(rejected_repairs).slice(-2),
    plan: compactRepairPlan(plan),
  };
}

async function runReviews({
  organization_id,
  creative_mission_id,
  creative_project_id,
  context,
  plan,
  reviewers,
  floor,
  settled_reviews = [],
  legacy_settled_reviews_verified = false,
  legacy_settled_review_source_plan = null,
}) {
  const settledByReviewer = new Map(
    list(settled_reviews).map((row) => {
      const review = object(row.review || row);
      return [canonicalReviewerId(review.reviewer_id), {
        review,
        usage: row.usage || null,
        billing: row.billing || null,
        review_evidence_hash: text(row.review_evidence_hash || review.review_evidence_hash) || null,
      }];
    }).filter(([id]) => Boolean(id)),
  );
  const settledResults = await Promise.allSettled(
    reviewers.map(async (reviewer) => {
      const reviewerId = canonicalReviewerId(reviewer.id);
      const settled = settledByReviewer.get(reviewerId);
      const evidenceHash = reviewerEvidenceHash({ reviewer, context, plan, floor });
      const legacyEvidenceHash =
        settled && !text(settled.review_evidence_hash) && legacy_settled_review_source_plan
          ? reviewerEvidenceHash({
              reviewer,
              context,
              plan: legacy_settled_review_source_plan,
              floor,
            })
          : null;
      const exactScopedEvidenceMatch = text(settled?.review_evidence_hash) === evidenceHash;
      const legacyScopedMigrationMatch = Boolean(
        settled &&
        text(settled.review_evidence_hash) &&
        text(settled.review_evidence_hash) === legacyReviewerEvidenceHash({ reviewer, context, plan, floor })
      );
      const verifiedLegacyPass = Boolean(
        settled?.review?.passed === true &&
        finite(settled.review.score) >= floor &&
        (
          (!text(settled.review_evidence_hash) && legacy_settled_reviews_verified === true) ||
          (Boolean(legacyEvidenceHash) && legacyEvidenceHash === evidenceHash)
        )
      );
      // A scoped review is a durable judgment about one exact evidence snapshot.
      // Reuse both passes and failures while the evidence hash is identical. Re-running
      // a failed reviewer against unchanged evidence only spends money and can produce
      // contradictory stochastic verdicts; a repair changes the hash and earns a fresh review.
      if (settled && (exactScopedEvidenceMatch || legacyScopedMigrationMatch || verifiedLegacyPass)) {
        return { reviewer, review: settled.review, usage: settled.usage, billing: settled.billing, reused: true, review_evidence_hash: evidenceHash };
      }
      const { output, result } = await reason({
        organization_id,
        creative_mission_id,
        creative_project_id,
        operation: `CREATIVE_DYNAMIC_TRIBUNAL_${text(reviewer.id).toUpperCase()}_V1`,
        payload: reviewPayload({ reviewer, context, plan, floor }),
        expects: "reviewer_id",
        max_output_tokens: reviewerDiscipline(reviewer) === "ANTI_CLICHE" ? 1200 : 6000,
        metadata: {
          creative_reviewer_id: text(reviewer.id),
          creative_review_evidence_hash: evidenceHash,
          creative_review_plan_hash: hash(canonicalReviewPlan(plan)),
        },
      });
      const outputReviewerId = canonicalReviewerId(output.reviewer_id);
      if (outputReviewerId !== reviewerId) {
        throw new Error(
          `CREATIVE_TRIBUNAL_REVIEWER_ID_MISMATCH:${reviewer.id}`,
        );
      }
      const normalizedOutput = { ...output, reviewer_id: reviewerId };
      assertReviewAuthority({ reviewer, review: normalizedOutput, plan });
      return {
        reviewer,
        review: normalizedOutput,
        usage: result.usage || null,
        billing: result.billing || null,
        reused: false,
        review_evidence_hash: evidenceHash,
      };
    }),
  );
  const fulfilled = settledResults
    .filter((entry) => entry.status === "fulfilled")
    .map((entry) => entry.value);
  const rejected = settledResults.find((entry) => entry.status === "rejected");
  if (rejected) {
    const error = rejected.reason instanceof Error
      ? rejected.reason
      : new Error(String(rejected.reason || "CREATIVE_TRIBUNAL_REVIEW_FAILED"));
    error.settled_reviews = fulfilled;
    throw error;
  }
  return fulfilled;
}

async function inspect({
  organization_id,
  creative_mission_id,
  creative_project_id,
  context,
  plan,
  existing_panel = null,
  settled_reviews = [],
  legacy_settled_reviews_verified = false,
  legacy_settled_review_source_plan = null,
}) {
  const floor = qualityFloor(plan);
  let panel;
  let panelUsage = null;
  let panelBilling = null;

  if (existing_panel?.reviewers) {
    const reviewers = validatePanel(
      refreshReviewerEvidenceFocus(existing_panel.reviewers, plan),
      existing_panel,
    );
    panel = {
      reviewers,
      rationale: text(existing_panel.rationale),
      panel_hash: text(existing_panel.panel_hash) || hash(reviewers),
      reused_after_repair: true,
    };
  } else {
    // A panel one reviewer over the bound used to lose the whole case. food-editorial returned
    // seven against a maximum of six and was thrown away at
    // CREATIVE_TRIBUNAL_REVIEWER_COUNT_INVALID:7 -- after the plan had been built and scored, and
    // for a violation the planner can simply be told about.
    //
    // The count is asked for again once, with the actual number returned and the bound stated. The
    // panel is a single cheap call next to the six reviews that follow it, and asking the planner
    // to consolidate is more faithful to "the smallest sufficient panel" than trimming the list
    // here would be: dropping a discipline it judged necessary would also make unanimity easier to
    // reach, which is not a change worth making silently to pass a benchmark.
    let panelRun = await reason({
      organization_id,
      creative_mission_id,
      creative_project_id,
      operation: "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1",
      payload: criticPlanningPayload(context, plan),
      expects: "reviewers",
      max_output_tokens: 5000,
    });

    let reviewers;
    let panelRetried = false;
    try {
      reviewers = validatePanel(panelRun.output.reviewers, panelRun.output);
    } catch (panelError) {
      if (!String(panelError?.message || "").startsWith("CREATIVE_TRIBUNAL_REVIEWER_COUNT_INVALID")) {
        throw panelError;
      }
      panelRetried = true;
      const returned = list(panelRun.output?.reviewers).length;
      panelRun = await reason({
        organization_id,
        creative_mission_id,
        creative_project_id,
        operation: "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1",
        payload: {
          ...criticPlanningPayload(context, plan),
          previous_attempt_rejected: `The previous panel returned ${returned} reviewers. The permitted range is ${MINIMUM_REVIEWERS} to ${MAXIMUM_REVIEWERS}. Consolidate overlapping mandates into single reviewers until the panel is within range; do not drop a failure class entirely to fit.`,
        },
        expects: "reviewers",
        max_output_tokens: 5000,
      });
      // Still out of range after being told the bound is a genuine planning failure, not a
      // recoverable slip, so it fails closed as before.
      reviewers = validatePanel(panelRun.output.reviewers, panelRun.output);
    }

    panel = {
      reviewers,
      rationale: text(panelRun.output.rationale),
      panel_hash: hash(reviewers),
      reused_after_repair: false,
      replanned_after_count_rejection: panelRetried,
    };
    panelUsage = panelRun.result.usage || null;
    panelBilling = panelRun.result.billing || null;
  }

  let reviews;
  try {
    reviews = await runReviews({
      organization_id,
      creative_mission_id,
      creative_project_id,
      context,
      plan,
      reviewers: panel.reviewers,
      floor,
      settled_reviews,
      legacy_settled_reviews_verified,
      legacy_settled_review_source_plan,
    });
  } catch (error) {
    const resumePackage = tribunalResumePackage({
      plan,
      tribunal: {
        panel,
        reviews: list(error?.settled_reviews),
        verdict: { required_floor: floor, blockers: [] },
      },
    });
    error.resume_package = error.resume_package || resumePackage;
    error.tribunal = error.tribunal || { panel, reviews: list(error?.settled_reviews) };
    error.repaired_plan = error.repaired_plan || plan;
    throw error;
  }
  const verdict = aggregate(reviews, floor);
  return {
    contract: CONTRACT,
    panel,
    reviews: reviews.map(({ reviewer, review, reused, review_evidence_hash }) => ({
      reviewer, review, reused: reused === true, review_evidence_hash,
    })),
    verdict,
    usage: {
      panel: panelUsage,
      reviews: reviews.map((row) => row.usage),
    },
    billing: {
      panel: panelBilling,
      reviews: reviews.map((row) => row.billing),
    },
  };
}

export const CreativeDynamicTribunalRuntime = Object.freeze({
  contract: CONTRACT,
  reviewContextSnapshot(input = {}) {
    return tribunalContextSnapshot(input);
  },
  reviewPlanHash(plan = {}) {
    return hash(canonicalReviewPlan(plan));
  },
  reviewEvidenceHash({ reviewer = {}, context = {}, plan = {}, floor = null } = {}) {
    return reviewerEvidenceHash({ reviewer, context, plan, floor: floor ?? qualityFloor(plan) });
  },
  reviewersForPlan({ reviewers = [], plan = {} } = {}) {
    return refreshReviewerEvidenceFocus(reviewers, plan);
  },
  replaySettledRepair({ plan = {}, output = {}, assets = [], available_capabilities = [], historical_replay = false } = {}) {
    try {
      const candidate = mergeCreativeRepairedPlan(plan, normalizedRepairPatch(output, plan));
      if (historical_replay) {
        const failureKeys = (targetPlan) => [
          ...validateCreativeMasterPlan({ plan: targetPlan, assets, require_temporal_direction: false }).failures
            .map((failure) => `STRUCTURAL:${failure.code}@${failure.path}`),
          ...validateCreativeMasterPlanDecision({
            plan: targetPlan,
            available_capabilities,
            require_temporal_council: false,
            require_temporal_direction: false,
          }).failures.map((failure) => `DECISION:${failure.code}@${failure.path}`),
        ];
        const existingDebt = new Set(failureKeys(plan));
        const candidateDebt = failureKeys(candidate);
        const introduced = candidateDebt.filter((key) => !existingDebt.has(key));
        if (introduced.length) {
          throw new Error(`CREATIVE_TRIBUNAL_REPAIR_NEW_VALIDATION_FAILURES:${introduced.slice(0, 8).join(';')}`);
        }
        return {
          adopted: true,
          plan: candidate,
          rejection_reason: null,
          preserved_validation_debt: candidateDebt.filter((key) => existingDebt.has(key)),
        };
      }
      assertCreativeMasterPlan({ plan: candidate, assets, require_temporal_direction: false });
      assertCreativeMasterPlanDecision({
        plan: candidate,
        available_capabilities,
        require_temporal_council: false,
        require_temporal_direction: false,
      });
      return { adopted: true, plan: candidate, rejection_reason: null };
    } catch (error) {
      return {
        adopted: false,
        plan,
        rejection_reason: String(error?.message || error).slice(0, 300),
      };
    }
  },

  async review({
    organization_id,
    creative_mission_id = null,
    creative_project_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
    available_capabilities = [],
    master,
    // A panel supplied by the caller instead of composed for this plan.
    //
    // Composing the panel per run is right for production work, where the disciplines that matter depend
    // on the mission. It is wrong for a benchmark: two runs of the same case drew different examiners --
    // architectural authenticity, brand integrity, visual quality, rights, assurance on one run; brand
    // integrity, visual quality, rights, workflow, image quality on the next -- so a tribunal score moved
    // from 87.4 to 85 between two runs of the same case and neither number could be compared to the other.
    // A fix cannot be shown to work against an instrument that changes shape between measurements.
    review_panel = null,
    settled_reviews = [],
    settled_review_plan_hash = null,
    settled_review_source_plan = null,
  } = {}) {
    if (!organization_id || !creative_project_id || !master?.plan) {
      throw new Error("CREATIVE_DYNAMIC_TRIBUNAL_CONTEXT_REQUIRED");
    }

    const context = tribunalContextSnapshot({
      mission,
      project,
      brief,
      assets,
      available_capabilities,
    });

    let plan = master.plan;
    const canonicalPlanHash = hash(canonicalReviewPlan(plan));
    const settledRows = list(settled_reviews);
    const allSettledReviewsScoped = settledRows.length > 0 && settledRows.every((row) =>
      Boolean(text(row?.review_evidence_hash || row?.review?.review_evidence_hash)),
    );
    const legacySourcePlan = object(settled_review_source_plan);
    const legacySourcePlanHash = Object.keys(legacySourcePlan).length
      ? hash(canonicalReviewPlan(legacySourcePlan))
      : null;
    const legacySourcePlanVerified = Boolean(
      settledRows.length &&
      !allSettledReviewsScoped &&
      legacySourcePlanHash &&
      text(settled_review_plan_hash) === legacySourcePlanHash,
    );
    if (
      settledRows.length &&
      !allSettledReviewsScoped &&
      text(settled_review_plan_hash) !== canonicalPlanHash &&
      !legacySourcePlanVerified
    ) {
      throw new Error("CREATIVE_TRIBUNAL_SETTLED_REVIEW_PLAN_MISMATCH");
    }
    const legacySettledReviewsVerified = Boolean(
      settledRows.length &&
      !allSettledReviewsScoped &&
      text(settled_review_plan_hash) === canonicalPlanHash,
    );
    let tribunal = await inspect({
      organization_id,
      creative_mission_id,
      creative_project_id,
      context,
      plan,
      existing_panel: review_panel,
      settled_reviews,
      legacy_settled_reviews_verified: legacySettledReviewsVerified,
      legacy_settled_review_source_plan: legacySourcePlanVerified ? legacySourcePlan : null,
    });
    let repairUsage = null;
    let repairBilling = null;
    let repaired = false;
    let repairAttempts = 0;
    // Repairs the contract rejected, kept so a run can show that an attempt was spent
    // on a revision that was discarded rather than silently vanishing.
    const rejectedRepairs = [];

    // The panel must be unanimous at the floor, and one repair pass was not enough
    // to get there: a plan would clear five reviewers and be rejected on the sixth,
    // with the improvement from that single pass thrown away. Each pass is driven by
    // the reviewers' own mandatory_repairs, so a second pass addresses whatever the
    // first one missed rather than repeating it. The budget is bounded because every
    // attempt is a paid reasoning call, and the run still fails closed when the
    // panel is not satisfied -- attempts buy revisions, never a lowered floor.
    //
    // The panel that first rejected the plan re-inspects every revision. Convening a
    // fresh panel would substitute a different jury between attempts and the effect
    // of a repair would not be measurable, so the panel is captured once here rather
    // than per attempt.
    const firstPanel = tribunal.panel;
    while (!tribunal.verdict.passed && repairAttempts < MAXIMUM_REPAIR_ATTEMPTS) {
      repairAttempts += 1;
      let repair;
      try {
        const conceptReplacement = fatalConceptReplacementRequired(tribunal);
        repair = await reason({
          organization_id,
          creative_mission_id,
          creative_project_id,
          operation: conceptReplacement
            ? "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1"
            : "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1",
          payload: repairPayload({ context, plan, tribunal, rejected_repairs: rejectedRepairs }),
          max_output_tokens: conceptReplacement ? 6000 : 12000,
          metadata: conceptReplacement
            ? { creative_repair_authority: "DIRECTION_CONCEPT_REPLACEMENT_FOR_TRIBUNAL_BLOCKER" }
            : {},
        });
      } catch (error) {
        const resumePackage = tribunalResumePackage({ plan, tribunal });
        error.resume_package = resumePackage;
        error.tribunal = error.tribunal || tribunal;
        error.repaired_plan = error.repaired_plan || plan;
        throw error;
      }
      repairUsage = repair.result.usage || null;
      repairBilling = repair.result.billing || null;

      // The repaired plan is validated before it is adopted. It used to replace `plan`
      // first and validate after, so a repair that broke the contract threw straight
      // out of this loop and destroyed a case whose plan had been valid a moment
      // earlier -- one case was lost to a single SELECTED_ASSET_UNACCOUNTED introduced
      // by the repair itself.
      //
      // A repair that fails validation is rejected rather than adopted. It costs an
      // attempt, not the plan. When every attempt is spent the last valid plan stands
      // and the panel judges it on merit, which is an honest rejection on score rather
      // than a crash.
      let candidate;
      try {
        candidate = mergeCreativeRepairedPlan(plan, normalizedRepairPatch(repair.output, plan));
        assertCreativeMasterPlan({ plan: candidate, assets, require_temporal_direction: false });
        assertCreativeMasterPlanDecision({
          plan: candidate,
          available_capabilities,
          require_temporal_council: false,
          require_temporal_direction: false,
        });
      } catch (error) {
        rejectedRepairs.push({
          attempt: repairAttempts,
          reason: String(error?.message || error).slice(0, 300),
        });
        continue;
      }

      const unresolvedEvidence = unresolvedQuotedBlockerEvidence(tribunal, candidate);
      if (unresolvedEvidence.length) {
        rejectedRepairs.push({
          attempt: repairAttempts,
          reason: `CREATIVE_TRIBUNAL_REPAIR_STALE_BLOCKER_EVIDENCE:${unresolvedEvidence.slice(0, 3).join(" | ")}`.slice(0, 500),
        });
        continue;
      }

      const unchangedReviewerEvidence = unchangedBlockingReviewerEvidence(tribunal, plan, candidate);
      if (unchangedReviewerEvidence.length) {
        rejectedRepairs.push({
          attempt: repairAttempts,
          reason: `CREATIVE_TRIBUNAL_REPAIR_BLOCKER_SCOPE_UNCHANGED:${unchangedReviewerEvidence.join(",")}`.slice(0, 500),
        });
        continue;
      }

      plan = candidate;
      repaired = true;

      const priorReviews = tribunal.reviews;
      tribunal = await inspect({
        organization_id,
        creative_mission_id,
        creative_project_id,
        context,
        plan,
        existing_panel: firstPanel,
        settled_reviews: priorReviews,
      });
    }

    if (!tribunal.verdict.passed) {
      // Every blocker is named, not just the first. A unanimous panel means one
      // rejection can hide others, and reporting a single reviewer made a run look
      // like one weak discipline when several were below the floor. Each entry
      // carries the score against the floor it was measured against.
      const blocked = list(tribunal.verdict.blockers)
        .map((entry) =>
          [
            text(entry.reviewer_id) || "unknown",
            `${entry.score ?? "invalid"}/${entry.required_floor}`,
            text(entry.fatal_rejection_reason).slice(0, 60) || null,
          ]
            .filter((part) => part !== null && part !== "")
            .join("@"),
        )
        .join(",");
      const error = new Error(
        `CREATIVE_DYNAMIC_TRIBUNAL_REJECTED:${tribunal.verdict.weighted_score}:${
          tribunal.verdict.required_floor
        }${blocked ? ` :: blocked_by=${blocked}` : ""}`,
      );
      const resumePackage = tribunalResumePackage({ plan, tribunal });
      error.tribunal = tribunal;
      error.repaired_plan = plan;
      error.resume_package = resumePackage;
      error.rejected_master = {
        ...master,
        plan: {
          ...plan,
          creative_tribunal: {
            contract: CONTRACT,
            passed: false,
            repaired,
            panel: tribunal.panel,
            reviews: tribunal.reviews,
            verdict: tribunal.verdict,
          },
        },
        creative_tribunal: {
          contract: CONTRACT,
          passed: false,
          repaired,
          panel: tribunal.panel,
          reviews: tribunal.reviews,
          verdict: tribunal.verdict,
          resume_package: resumePackage,
        },
        tribunal_resume_package: resumePackage,
        tribunal_usage: tribunal.usage,
        tribunal_billing: tribunal.billing,
        repair_usage: repairUsage,
        repair_billing: repairBilling,
      };
      throw error;
    }

    const validation = assertCreativeMasterPlan({ plan, assets, require_temporal_direction: false });
    const decisionValidation = assertCreativeMasterPlanDecision({
      plan,
      available_capabilities,
      require_temporal_council: false,
      require_temporal_direction: false,
    });
    const sealedTribunal = {
      contract: CONTRACT,
      passed: true,
      repaired,
      repair_attempts: repairAttempts,
      rejected_repairs: rejectedRepairs,
      panel: tribunal.panel,
      reviews: tribunal.reviews,
      verdict: tribunal.verdict,
      tribunal_hash: hash({
        panel: tribunal.panel,
        reviews: tribunal.reviews,
        verdict: tribunal.verdict,
      }),
    };

    return {
      ...master,
      plan: {
        ...plan,
        validation,
        decision_validation: decisionValidation,
        creative_tribunal: sealedTribunal,
        validation_summary: {
          ...object(plan.validation_summary),
          creative_dynamic_tribunal: {
            passed: true,
            reviewer_count: tribunal.panel.reviewers.length,
            weighted_score: tribunal.verdict.weighted_score,
            required_floor: tribunal.verdict.required_floor,
            repaired,
            tribunal_hash: sealedTribunal.tribunal_hash,
          },
        },
      },
      validation,
      decision_validation: decisionValidation,
      creative_tribunal: sealedTribunal,
      tribunal_usage: tribunal.usage,
      tribunal_billing: tribunal.billing,
      repair_usage: repairUsage,
      repair_billing: repairBilling,
    };
  },
});
