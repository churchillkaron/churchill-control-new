import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  assertCreativeMasterPlan,
} from "@/lib/creative/director/validation/CreativeMasterPlanValidator";
import {
  assertCreativeMasterPlanDecision,
} from "@/lib/creative/director/validation/CreativeMasterPlanDecisionGate";
import {
  mergeCreativeRepairedPlan,
} from "@/lib/creative/director/runtime/mergeCreativeRepairedPlan";

const CONTRACT = "CREATIVE_DYNAMIC_TRIBUNAL_V1";
const MINIMUM_REVIEWERS = 2;
const MAXIMUM_REVIEWERS = 6;
const MAXIMUM_REPAIR_ATTEMPTS = 2;

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
  if (expects) return findByKey(value, expects) || value;
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
    },
  });
  const output = normalizedOutput(result, expects);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result };
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
        "Do not include provider selection or prompt-writing roles.",
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

function refreshReviewerEvidenceFocus(reviewers = [], plan = {}) {
  const current = currentPlanEvidenceIds(plan);
  const geographicEvidence = geographicEvidenceIds(plan);
  return list(reviewers).map((reviewer) => {
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
  const canonical = { ...object(plan) };
  delete canonical.common_plan_contract;
  return canonical;
}

function tribunalResumePackage({ plan = {}, tribunal = {} } = {}) {
  const floor = finite(tribunal?.verdict?.required_floor) ?? qualityFloor(plan);
  const settledReviews = list(tribunal.reviews).filter((row) => {
    const review = object(row.review || row);
    return (
      review.passed === true &&
      finite(review.score) >= floor &&
      !text(review.fatal_rejection_reason)
    );
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
  if (/asset|source|manifest|continuity/.test(mandate)) return "ASSET_CONTINUITY";
  return "FULL_PLAN";
}

function narrativeSceneEvidence(scene = {}) {
  return {
    id: scene.id,
    title: scene.title,
    objective: scene.objective,
    emotion: scene.emotion,
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
        id: step.id, title: step.title, purpose: step.purpose,
        output_spec: step.output_spec, requirements: step.requirements,
      })),
  );
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
        concept: canonical.concept,
        asset_manifest: canonical.asset_manifest,
        scenes: list(canonical.scenes).map((scene) => ({
          id: scene.id, title: scene.title, objective: scene.objective,
          brand_rules: scene.brand_rules, reference_asset_ids: scene.reference_asset_ids,
        })),
        brand_production_steps: brandProductionEvidence(canonical),
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
    default:
      return canonical;
  }
}

function reviewerEvidenceHash({ reviewer, context, plan, floor }) {
  return hash({
    contract: CONTRACT,
    reviewer: {
      id: reviewer.id, role: reviewer.role, mandate: reviewer.mandate,
      evidence_focus: reviewer.evidence_focus, failure_modes: reviewer.failure_modes, weight: reviewer.weight,
    },
    required_release_floor: floor,
    context,
    evidence: reviewerPlanEvidence(reviewer, plan),
  });
}

function reviewPayload({ reviewer, context, plan, floor }) {
  return {
    task: "Independently review the supplied final Creative Master Plan. You did not create it and must fail weak work rather than defend it.",
    reviewer,
    required_release_floor: floor,
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
      "Do not suggest provider prompts or provider-specific parameters.",
    ],
    context,
    plan: canonicalReviewPlan(plan),
  };
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

function normalizedRepairPatch(output = {}, basePlan = {}) {
  const envelope = object(output).plan || object(output);
  const common = object(envelope.common_plan_contract);
  const patch = { ...envelope, ...common };
  delete patch.common_plan_contract;

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

function repairPayload({ context, plan, tribunal }) {
  const blocking = blockingReviewerBrief(tribunal);

  return {
    task: "Repair the supplied Creative Master Plan so it resolves every tribunal failure without changing the mission, inventing evidence, lowering quality thresholds, changing approved rights, or inventing unavailable services/capabilities.",
    blocking_reviewers: blocking,
    output:
      "Return repaired Creative Master Plan JSON only. Return every key you change; keys you omit keep their reviewed values, so do not re-emit scaffolding you are not repairing. Any array you return replaces the existing array in full, so return complete arrays.",
    rules: [
      "Preserve workflow_kind unless the tribunal identifies a fatal medium mismatch; if changing it would violate an explicit mission constraint, fail rather than changing it.",
      "Preserve all exact source-asset and rights restrictions.",
      "Preserve only registered service/capability pairs already present in the verified capability context.",
      "Do not add prompts, provider prompts, provider parameters or provider identities.",
      "Resolve every mandatory repair concretely in concept, deliverables, production structure, scenes/shots where applicable, and creative_review.",
      "After repair, creative_review.repair_before_production must be empty and creative_review must truthfully reflect the repaired work.",
      blocking.length
        ? `The panel is unanimous, so these reviewers alone are why the plan is rejected: ${blocking
            .map((entry) => `${entry.reviewer_id} scored ${entry.score} against a floor of ${entry.required_floor}`)
            .join("; ")}. Raise each of them above the floor by resolving their own failures, mandatory_repairs and weakest_link specifically. Reviewers who already passed do not need further work, and rewriting what they approved risks losing it.`
        : null,
    ].filter(Boolean),
    context,
    tribunal,
    plan,
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
      return [text(review.reviewer_id), {
        review,
        usage: row.usage || null,
        billing: row.billing || null,
        review_evidence_hash: text(row.review_evidence_hash || review.review_evidence_hash) || null,
      }];
    }).filter(([id]) => Boolean(id)),
  );
  const results = await Promise.all(
    reviewers.map(async (reviewer) => {
      const settled = settledByReviewer.get(text(reviewer.id));
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
      if (
        settled?.review?.passed === true &&
        finite(settled.review.score) >= floor &&
        (
          text(settled.review_evidence_hash) === evidenceHash ||
          (!text(settled.review_evidence_hash) && legacy_settled_reviews_verified === true) ||
          (Boolean(legacyEvidenceHash) && legacyEvidenceHash === evidenceHash)
        )
      ) {
        return { reviewer, review: settled.review, usage: settled.usage, billing: settled.billing, reused: true, review_evidence_hash: evidenceHash };
      }
      const { output, result } = await reason({
        organization_id,
        creative_mission_id,
        creative_project_id,
        operation: `CREATIVE_DYNAMIC_TRIBUNAL_${text(reviewer.id).toUpperCase()}_V1`,
        payload: reviewPayload({ reviewer, context, plan, floor }),
        expects: "reviewer_id",
        max_output_tokens: 6000,
      });
      if (text(output.reviewer_id) !== text(reviewer.id)) {
        throw new Error(
          `CREATIVE_TRIBUNAL_REVIEWER_ID_MISMATCH:${reviewer.id}`,
        );
      }
      return {
        reviewer,
        review: output,
        usage: result.usage || null,
        billing: result.billing || null,
        reused: false,
        review_evidence_hash: evidenceHash,
      };
    }),
  );
  return results;
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
        reviews: [],
        verdict: { required_floor: floor, blockers: [] },
      },
    });
    error.resume_package = error.resume_package || resumePackage;
    error.tribunal = error.tribunal || { panel, reviews: [] };
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
  reviewPlanHash(plan = {}) {
    return hash(canonicalReviewPlan(plan));
  },
  reviewEvidenceHash({ reviewer = {}, context = {}, plan = {}, floor = null } = {}) {
    return reviewerEvidenceHash({ reviewer, context, plan, floor: floor ?? qualityFloor(plan) });
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
        repair = await reason({
          organization_id,
          creative_mission_id,
          creative_project_id,
          operation: "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1",
          payload: repairPayload({ context, plan, tribunal }),
          max_output_tokens: 20000,
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
      const candidate = mergeCreativeRepairedPlan(plan, normalizedRepairPatch(repair.output, plan));
      try {
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
