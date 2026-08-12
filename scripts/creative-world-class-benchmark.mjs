#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const CONTRACT = "CREATIVE_WORLD_CLASS_BENCHMARK_V1";
const MIN_CASES = 5;
const MIN_OVERALL_SCORE = 88;
const MIN_CASE_SCORE = 82;
const MAX_DIRECTION_SIMILARITY = 0.72;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function words(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function setSimilarity(left, right) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function bounded(value, minimum = 0, maximum = 100) {
  const number = finite(value);
  if (number === null) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function scoreText(value, ideal, minimum) {
  const length = text(value).length;
  if (length < minimum) return 0;
  return Math.min(100, 70 + ((Math.min(length, ideal) - minimum) / Math.max(1, ideal - minimum)) * 30);
}

function substantive(values, minimum = 20) {
  return list(values).map(text).filter((value) => value.length >= minimum);
}

function concept(plan = {}) {
  return object(plan.concept);
}

function creativeReview(plan = {}) {
  return object(plan.creative_review);
}

function tribunal(plan = {}) {
  return object(plan.creative_tribunal);
}

function productionSteps(plan = {}) {
  return [
    ...list(plan.deliverables).flatMap((deliverable) => list(deliverable.production_steps)),
    ...list(object(plan.production).cross_deliverable_steps),
  ];
}

function compactDirection(plan = {}) {
  const direction = concept(plan);
  const deliverables = list(plan.deliverables);
  return [
    direction.title,
    direction.creative_thesis,
    direction.hook,
    direction.message,
    direction.narrative,
    direction.visual_system,
    direction.emotional_promise,
    direction.call_to_action,
    ...deliverables.flatMap((item) => [
      item.name,
      item.purpose,
      item.creative_direction,
      item.art_direction,
      item.copy_direction,
    ]),
  ].map(text).filter(Boolean).join("\n");
}

function sourceSpecificity(plan = {}, benchmark = {}) {
  const direction = compactDirection(plan).toLowerCase();
  const anchors = unique([
    ...list(benchmark.required_anchors),
    text(benchmark.organization_name),
    ...list(benchmark.product_names),
    ...list(benchmark.audience_terms),
    ...list(benchmark.market_terms),
  ].map(text).filter((value) => value.length >= 3));
  if (!anchors.length) return 70;
  const matched = anchors.filter((anchor) => direction.includes(anchor.toLowerCase()));
  return Math.round((matched.length / anchors.length) * 100);
}

function genericLanguagePenalty(plan = {}) {
  const direction = compactDirection(plan).toLowerCase();
  const patterns = [
    /\belevate your\b/g,
    /\bunforgettable experience\b/g,
    /\bwhere .* meets .*\b/g,
    /\bmore than just\b/g,
    /\bdiscover the difference\b/g,
    /\bunlock .* potential\b/g,
    /\bredefine(?:d|s|ing)?\b/g,
    /\bjourney\b/g,
    /\bpremium experience\b/g,
    /\bseamless(?:ly)?\b/g,
    /\binnovative solutions?\b/g,
    /\bcutting[- ]edge\b/g,
    /\bgame[- ]changer\b/g,
    /\btransform your\b/g,
  ];
  let hits = 0;
  for (const pattern of patterns) hits += (direction.match(pattern) || []).length;
  return Math.min(35, hits * 7);
}

function scoreCase(entry = {}) {
  const benchmark = object(entry.benchmark);
  const envelope = object(entry.master_plan || entry.master || entry.result);
  const plan = object(envelope.plan || envelope);
  const review = creativeReview(plan);
  const dimensions = object(review.dimensions);
  const dynamicTribunal = tribunal(plan);
  const tribunalVerdict = object(dynamicTribunal.verdict);
  const steps = productionSteps(plan);

  const reviewScores = [
    "strategic_specificity",
    "originality",
    "ownability",
    "audience_truth",
    "brand_truth",
    "medium_fitness",
    "craft_specificity",
    "factual_discipline",
    "language_specificity",
    "production_feasibility",
    "finishing_readiness",
  ].map((key) => bounded(dimensions[key]));

  const declaredReview = reviewScores.length
    ? reviewScores.reduce((sum, value) => sum + value, 0) / reviewScores.length
    : 0;
  const specificity = sourceSpecificity(plan, benchmark);
  const thesis = scoreText(concept(plan).creative_thesis, 500, 80);
  const rejected = Math.min(100, substantive(review.rejected_patterns, 20).length * 25);
  const craft = Math.min(100, substantive(review.craft_risks, 20).length * 25);
  const finishing = Math.min(100, substantive(review.finishing_requirements, 20).length * 25);
  const production = steps.length
    ? Math.min(100, 65 + Math.min(35, steps.length * 5))
    : 0;
  const tribunalScore = bounded(tribunalVerdict.weighted_score);
  const genericPenalty = genericLanguagePenalty(plan);

  const raw =
    declaredReview * 0.28 +
    specificity * 0.18 +
    thesis * 0.1 +
    rejected * 0.08 +
    craft * 0.08 +
    finishing * 0.08 +
    production * 0.08 +
    tribunalScore * 0.12;

  const score = Number(Math.max(0, raw - genericPenalty).toFixed(2));
  const failures = [];
  if (!text(plan.workflow_kind)) failures.push("WORKFLOW_KIND_REQUIRED");
  if (review.passed !== true) failures.push("CREATIVE_REVIEW_NOT_PASSED");
  if (dynamicTribunal.passed !== true) failures.push("DYNAMIC_TRIBUNAL_NOT_PASSED");
  if (specificity < 55) failures.push("DIRECTION_NOT_SUFFICIENTLY_CONTEXT_SPECIFIC");
  if (substantive(review.rejected_patterns, 20).length < 3) failures.push("WEAK_DIRECTION_REJECTION_EVIDENCE");
  if (substantive(review.craft_risks, 20).length < 2) failures.push("CRAFT_RISK_DEPTH_INSUFFICIENT");
  if (substantive(review.finishing_requirements, 20).length < 2) failures.push("FINISHING_DEPTH_INSUFFICIENT");
  if (!steps.length) failures.push("PRODUCTION_PLAN_EMPTY");
  if (genericPenalty >= 14) failures.push("GENERIC_AI_LANGUAGE_PATTERN");
  if (score < MIN_CASE_SCORE) failures.push("CASE_SCORE_BELOW_WORLD_CLASS_FLOOR");

  return {
    id: text(entry.id || benchmark.id),
    label: text(entry.label || benchmark.label),
    workflow_kind: text(plan.workflow_kind),
    score,
    passed: failures.length === 0,
    metrics: {
      declared_review_score: Number(declaredReview.toFixed(2)),
      contextual_specificity_score: specificity,
      thesis_depth_score: Number(thesis.toFixed(2)),
      rejected_pattern_score: rejected,
      craft_risk_score: craft,
      finishing_score: finishing,
      production_plan_score: production,
      tribunal_score: tribunalScore,
      generic_language_penalty: genericPenalty,
    },
    failures,
    direction_hash: hash(compactDirection(plan)),
    direction_text: compactDirection(plan),
  };
}

function crossCaseChecks(cases = []) {
  const failures = [];
  const similarities = [];
  for (let left = 0; left < cases.length; left += 1) {
    for (let right = left + 1; right < cases.length; right += 1) {
      const similarity = setSimilarity(
        cases[left].direction_text,
        cases[right].direction_text,
      );
      similarities.push({
        left: cases[left].id,
        right: cases[right].id,
        similarity: Number(similarity.toFixed(3)),
      });
      if (similarity > MAX_DIRECTION_SIMILARITY) {
        failures.push(
          `DIRECTIONS_TOO_SIMILAR:${cases[left].id}:${cases[right].id}:${similarity.toFixed(3)}`,
        );
      }
    }
  }

  const workflowKinds = unique(cases.map((entry) => entry.workflow_kind));
  if (workflowKinds.length < 2) {
    failures.push("BENCHMARK_WORKFLOW_DIVERSITY_INSUFFICIENT");
  }

  return {
    passed: failures.length === 0,
    workflow_kinds: workflowKinds,
    pairwise_direction_similarity: similarities,
    failures,
  };
}

function loadInput(filename) {
  const absolute = path.resolve(filename);
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (!Array.isArray(parsed.cases)) {
    throw new Error("Benchmark input must contain a cases array");
  }
  return { absolute, parsed };
}

function main() {
  const filename = process.argv[2] || process.env.CREATIVE_WORLD_CLASS_BENCHMARK_INPUT;
  if (!filename) {
    console.log("CREATIVE_WORLD_CLASS_BENCHMARK=SKIPPED");
    console.log("REASON=INPUT_NOT_PROVIDED");
    console.log("USAGE=node scripts/creative-world-class-benchmark.mjs <benchmark-results.json>");
    return;
  }

  const { absolute, parsed } = loadInput(filename);
  if (parsed.cases.length < MIN_CASES) {
    throw new Error(`CREATIVE_WORLD_CLASS_BENCHMARK_REQUIRES_${MIN_CASES}_CASES`);
  }

  const cases = parsed.cases.map(scoreCase);
  const crossCase = crossCaseChecks(cases);
  const average = cases.reduce((sum, entry) => sum + entry.score, 0) / cases.length;
  const failures = [
    ...cases.flatMap((entry) => entry.failures.map((failure) => `${entry.id}:${failure}`)),
    ...crossCase.failures,
  ];
  if (average < MIN_OVERALL_SCORE) {
    failures.push(`AVERAGE_SCORE_BELOW_WORLD_CLASS_FLOOR:${average.toFixed(2)}`);
  }

  const report = {
    contract: CONTRACT,
    passed: failures.length === 0,
    input: absolute,
    evaluated_at: new Date().toISOString(),
    thresholds: {
      minimum_cases: MIN_CASES,
      minimum_case_score: MIN_CASE_SCORE,
      minimum_overall_score: MIN_OVERALL_SCORE,
      maximum_pairwise_direction_similarity: MAX_DIRECTION_SIMILARITY,
    },
    score: Number(average.toFixed(2)),
    cases: cases.map(({ direction_text, ...entry }) => entry),
    cross_case: crossCase,
    failures,
    provider_calls_executed: false,
    provider_spend_approved: false,
    publication_executed: false,
  };

  const output = path.resolve(
    process.env.CREATIVE_WORLD_CLASS_BENCHMARK_OUTPUT ||
      "/tmp/creative-world-class-benchmark.json",
  );
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE WORLD-CLASS BENCHMARK");
  console.log("============================================================");
  console.log(`CONTRACT=${CONTRACT}`);
  console.log(`CASE_COUNT=${cases.length}`);
  console.log(`OVERALL_SCORE=${report.score}`);
  console.log(`PASSED=${report.passed ? "YES" : "NO"}`);
  console.log(`REPORT=${output}`);
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("PROVIDER_SPEND_APPROVED=NO");
  console.log("PUBLICATION_EXECUTED=NO");

  for (const entry of cases) {
    console.log(`CASE=${entry.id}|score=${entry.score}|passed=${entry.passed ? "YES" : "NO"}|workflow=${entry.workflow_kind || "UNKNOWN"}`);
  }
  for (const failure of failures) console.log(`FAILURE=${failure}`);

  if (!report.passed) process.exitCode = 1;
}

main();
