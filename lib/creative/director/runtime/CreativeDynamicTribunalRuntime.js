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
  const parsed = parseJson(output.text || output.content || output);

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
}) {
  const results = await Promise.all(
    reviewers.map(async (reviewer) => {
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
}) {
  const floor = qualityFloor(plan);
  let panel;
  let panelUsage = null;
  let panelBilling = null;

  if (existing_panel?.reviewers) {
    const reviewers = validatePanel(
      existing_panel.reviewers,
      existing_panel,
    );
    panel = {
      reviewers,
      rationale: text(existing_panel.rationale),
      panel_hash: text(existing_panel.panel_hash) || hash(reviewers),
      reused_after_repair: true,
    };
  } else {
    const panelRun = await reason({
      organization_id,
      creative_mission_id,
      creative_project_id,
      operation: "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1",
      payload: criticPlanningPayload(context, plan),
      expects: "reviewers",
      max_output_tokens: 5000,
    });
    const reviewers = validatePanel(panelRun.output.reviewers, panelRun.output);
    panel = {
      reviewers,
      rationale: text(panelRun.output.rationale),
      panel_hash: hash(reviewers),
      reused_after_repair: false,
    };
    panelUsage = panelRun.result.usage || null;
    panelBilling = panelRun.result.billing || null;
  }

  const reviews = await runReviews({
    organization_id,
    creative_mission_id,
    creative_project_id,
    context,
    plan,
    reviewers: panel.reviewers,
    floor,
  });
  const verdict = aggregate(reviews, floor);
  return {
    contract: CONTRACT,
    panel,
    reviews: reviews.map(({ reviewer, review }) => ({ reviewer, review })),
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
      const repair = await reason({
        organization_id,
        creative_mission_id,
        creative_project_id,
        operation: "CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1",
        payload: repairPayload({ context, plan, tribunal }),
        max_output_tokens: 20000,
      });
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
      const candidate = mergeCreativeRepairedPlan(plan, repair.output);
      try {
        assertCreativeMasterPlan({ plan: candidate, assets });
        assertCreativeMasterPlanDecision({
          plan: candidate,
          available_capabilities,
          require_temporal_council: false,
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

      tribunal = await inspect({
        organization_id,
        creative_mission_id,
        creative_project_id,
        context,
        plan,
        existing_panel: firstPanel,
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
      error.tribunal = tribunal;
      error.repaired_plan = plan;
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
        },
        tribunal_usage: tribunal.usage,
        tribunal_billing: tribunal.billing,
        repair_usage: repairUsage,
        repair_billing: repairBilling,
      };
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
