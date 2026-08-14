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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// The repair call is asked for "the complete repaired Creative Master Plan", and
// a complete plan carries 21 role decisions plus concept, deliverables, scenes and
// production structure. Repairs routinely came back with the direction improved
// and some of that scaffolding dropped, so the plan that had just passed
// validation was replaced by one that failed it -- AGENCY_ROLE_DECISION_REQUIRED
// on roles nobody had asked the repair to touch. The master plan runtime already
// hit this and split role_decisions into its own schema-enforced field.
//
// Repairing direction is not the same as re-emitting the contract. The repair is
// merged onto the plan that went in, so an omitted key keeps its reviewed value
// and only what the repair actually returned is changed. Arrays replace wholesale
// -- a returned list is the new intended list, and repair_before_production must
// be able to become empty. Objects merge per key, so a repair revising three
// roles does not erase the other eighteen.
function mergeRepairedPlan(base, repair, depth = 0) {
  const source = object(base);
  const patch = object(repair);
  if (depth > 6) return patch;

  const merged = { ...source };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = source[key];
    const mergeable =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing);
    merged[key] = mergeable
      ? mergeRepairedPlan(existing, value, depth + 1)
      : value;
  }
  return merged;
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

function normalizedOutput(result = {}) {
  const output = result?.output?.output || result?.output || result || {};
  const parsed = parseJson(output.text || output.content || output);

  // The provider envelope nests deeper than two levels for some models, so the
  // payload arrived as { output: { reviewers: [...] } } and the panel read as
  // empty. Unwrap any remaining single-key output/result envelope, re-parsing at
  // each step because an inner level can still be a JSON string.
  let value = parsed;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;

    const keys = Object.keys(value);
    if (keys.length !== 1 || !["output", "result", "response", "data"].includes(keys[0])) {
      break;
    }

    value = parseJson(value[keys[0]]);
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
  const output = normalizedOutput(result);
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

function validatePanel(reviewers = [], rawOutput = null) {
  const rows = list(reviewers);
  if (rows.length < MINIMUM_REVIEWERS || rows.length > MAXIMUM_REVIEWERS) {
    // The bare count made this undiagnosable without another paid reasoning call.
    // The keys the model actually returned identify the cause at once: a renamed
    // field, a nested envelope, or a genuinely empty panel.
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
      "Apply your mandate only; do not imitate other reviewers or average toward consensus.",
      "Do not suggest provider prompts or provider-specific parameters.",
    ],
    context,
    plan,
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
  const blocking = [];
  let passed = true;

  for (const row of rows) {
    const reviewer = object(row.reviewer);
    const review = object(row.review);
    const weight = finite(reviewer.weight) ?? 1;
    const score = finite(review.score);
    const fatal = text(review.fatal_rejection_reason);
    if (score === null || score < floor || review.passed !== true || fatal) {
      passed = false;
      blocking.push({
        reviewer_id: text(reviewer.id) || "UNKNOWN",
        score,
        reviewer_passed: review.passed === true,
        fatal_rejection_reason: fatal || null,
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
    blocking.push({
      reviewer_id: "PANEL_AVERAGE",
      score: Number(weightedScore.toFixed(2)),
      reviewer_passed: false,
      fatal_rejection_reason: null,
    });
  }

  return {
    passed,
    weighted_score: Number(weightedScore.toFixed(2)),
    required_floor: floor,
    blocking_reviewers: blocking,
    mandatory_repairs: [...new Set(mandatoryRepairs.filter(Boolean))],
    failures: [...new Set(failures.filter(Boolean))],
  };
}

function repairPayload({ context, plan, tribunal }) {
  return {
    task: "Repair the supplied Creative Master Plan so it resolves every tribunal failure without changing the mission, inventing evidence, lowering quality thresholds, changing approved rights, or inventing unavailable services/capabilities.",
    output:
      "Return repaired Creative Master Plan JSON only. Return every key you change; keys you omit keep their reviewed values, so do not re-emit scaffolding you are not repairing. Any array you return replaces the existing array in full, so return complete arrays.",
    rules: [
      "Preserve workflow_kind unless the tribunal identifies a fatal medium mismatch; if changing it would violate an explicit mission constraint, fail rather than changing it.",
      "Preserve all exact source-asset and rights restrictions.",
      "Preserve only registered service/capability pairs already present in the verified capability context.",
      "Do not add prompts, provider prompts, provider parameters or provider identities.",
      "Resolve every mandatory repair concretely in concept, deliverables, production structure, scenes/shots where applicable, and creative_review.",
      "After repair, creative_review.repair_before_production must be empty and creative_review must truthfully reflect the repaired work.",
    ],
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
}) {
  const results = await Promise.all(
    reviewers.map(async (reviewer) => {
      const { output, result } = await reason({
        organization_id,
        creative_mission_id,
        creative_project_id,
        operation: `CREATIVE_DYNAMIC_TRIBUNAL_${text(reviewer.id).toUpperCase()}_V1`,
        payload: reviewPayload({ reviewer, context, plan, floor }),
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
}) {
  const floor = qualityFloor(plan);
  const panelRun = await reason({
    organization_id,
    creative_mission_id,
    creative_project_id,
    operation: "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1",
    payload: criticPlanningPayload(context, plan),
    max_output_tokens: 5000,
  });
  const reviewers = validatePanel(panelRun.output.reviewers, panelRun.output);
  const reviews = await runReviews({
    organization_id,
    creative_mission_id,
    creative_project_id,
    context,
    plan,
    reviewers,
    floor,
  });
  const verdict = aggregate(reviews, floor);
  return {
    contract: CONTRACT,
    panel: {
      reviewers,
      rationale: text(panelRun.output.rationale),
      panel_hash: hash(reviewers),
    },
    reviews: reviews.map(({ reviewer, review }) => ({ reviewer, review })),
    verdict,
    usage: {
      panel: panelRun.result.usage || null,
      reviews: reviews.map((row) => row.usage),
    },
    billing: {
      panel: panelRun.result.billing || null,
      reviews: reviews.map((row) => row.billing),
    },
  };
}

export const CreativeDynamicTribunalRuntime = Object.freeze({
  contract: CONTRACT,

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
  } = {}) {
    if (!organization_id || !creative_project_id || !master?.plan) {
      throw new Error("CREATIVE_DYNAMIC_TRIBUNAL_CONTEXT_REQUIRED");
    }

    const context = {
      mission,
      project,
      brief,
      assets,
      available_production_capabilities: available_capabilities,
    };

    let plan = master.plan;
    let tribunal = await inspect({
      organization_id,
      creative_mission_id,
      creative_project_id,
      context,
      plan,
    });
    let repairUsage = null;
    let repairBilling = null;
    let repaired = false;
    let repairAttempts = 0;

    // The panel must be unanimous at the floor, and one repair pass was not enough
    // to get there: a plan would clear five reviewers and be rejected on the sixth,
    // with the improvement from that single pass thrown away. Each pass is driven by
    // the reviewers' own mandatory_repairs, so a second pass addresses whatever the
    // first one missed rather than repeating it. The budget is bounded because every
    // attempt is a paid reasoning call, and the run still fails closed when the
    // panel is not satisfied -- attempts buy revisions, never a lowered floor.
    while (!tribunal.verdict.passed && repairAttempts < MAXIMUM_REPAIR_ATTEMPTS) {
      repairAttempts += 1;
      const repair = await reason({
        organization_id,
        creative_mission_id,
        creative_project_id,
        operation: "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1",
        payload: repairPayload({ context, plan, tribunal }),
        max_output_tokens: 20000,
      });
      plan = mergeRepairedPlan(plan, repair.output);
      repairUsage = repair.result.usage || null;
      repairBilling = repair.result.billing || null;
      repaired = true;

      assertCreativeMasterPlan({ plan, assets });
      assertCreativeMasterPlanDecision({
        plan,
        available_capabilities,
        require_temporal_council: false,
      });

      tribunal = await inspect({
        organization_id,
        creative_mission_id,
        creative_project_id,
        context,
        plan,
      });
    }

    if (!tribunal.verdict.passed) {
      const blocked = list(tribunal.verdict.blocking_reviewers)
        .map((entry) =>
          [
            text(entry.reviewer_id) || "UNKNOWN",
            entry.score === null || entry.score === undefined
              ? "no-score"
              : entry.score,
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
      error.tribunal = tribunal;
      throw error;
    }

    const validation = assertCreativeMasterPlan({ plan, assets });
    const decisionValidation = assertCreativeMasterPlanDecision({
      plan,
      available_capabilities,
      require_temporal_council: false,
    });
    const sealedTribunal = {
      contract: CONTRACT,
      passed: true,
      repaired,
      repair_attempts: repairAttempts,
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