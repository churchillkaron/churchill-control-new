#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function keys(value) {
  return Object.keys(object(value)).sort();
}

function boundedJson(value, limit = 4000) {
  const source = JSON.stringify(value, null, 2);
  return source.length <= limit ? source : `${source.slice(0, limit)}\n...[truncated]`;
}

function unwrapResult(value, maxDepth = 8) {
  const chain = [];
  let current = object(value);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    chain.push({ depth, keys: keys(current) });
    const nested = object(current.result);
    if (!Object.keys(nested).length) break;
    current = nested;
  }
  return { value: current, chain };
}

function productCycleScore(candidate) {
  const current = object(candidate);
  let score = 0;
  if (text(current.execution_key).startsWith("product-cycle:")) score += 8;
  if (text(current.ref) === "main") score += 2;
  if (Object.prototype.hasOwnProperty.call(current, "repository_assessment")) score += 5;
  if (Object.prototype.hasOwnProperty.call(current, "repository_head_observed")) score += 4;
  if (Object.prototype.hasOwnProperty.call(current, "persistence_decision")) score += 4;
  if (Object.prototype.hasOwnProperty.call(current, "mission")) score += 4;
  return score;
}

function findBestCycle(root) {
  let best = { score: 0, path: "$", value: null };
  const seen = new Set();
  const queue = [{ value: root, path: "$", depth: 0 }];

  while (queue.length) {
    const entry = queue.shift();
    const current = entry.value;
    if (!current || typeof current !== "object" || seen.has(current) || entry.depth > 8) {
      continue;
    }
    seen.add(current);

    if (!Array.isArray(current)) {
      const score = productCycleScore(current);
      if (score > best.score) best = { score, path: entry.path, value: current };
    }

    if (Array.isArray(current)) {
      current.slice(0, 80).forEach((item, index) => {
        if (item && typeof item === "object") {
          queue.push({ value: item, path: `${entry.path}[${index}]`, depth: entry.depth + 1 });
        }
      });
      continue;
    }

    Object.entries(current).slice(0, 120).forEach(([key, value]) => {
      if (value && typeof value === "object") {
        queue.push({ value, path: `${entry.path}.${key}`, depth: entry.depth + 1 });
      }
    });
  }

  return best;
}

function bindingSummary(mission) {
  const state = object(mission?.binding_state);
  const values = object(state.values);
  const evidence = list(state.evidence);
  return {
    contract: text(state.contract) || null,
    binding_contract: text(state.binding_contract) || null,
    declared_count: Number(state.declared_count || 0),
    captured_count: Number(state.captured_count || 0),
    value_keys: Object.keys(values).sort(),
    evidence: evidence.slice(0, 20).map((item) => ({
      source_step_id: text(item?.source_step_id) || null,
      source: text(item?.source) || null,
      source_path: text(item?.source_path) || null,
      target_step_id: text(item?.target_step_id) || null,
      target_path: text(item?.target_path) || null,
    })),
  };
}

function missionSummary(mission) {
  const current = object(mission);
  return {
    status: text(current.status) || null,
    reason: text(current.reason) || null,
    detail: text(current.detail) || null,
    pause_reason: text(current.pause_reason) || null,
    all_steps_preflighted: current.all_steps_preflighted ?? null,
    blocked_step: object(current.blocked_step),
    total_steps: Number(current.total_steps || 0),
    completed_steps: Number(current.completed_steps || 0),
    remaining_steps: Number(current.remaining_steps || 0),
    current_step_id: text(current.current_step_id) || null,
    step_results: list(current.steps).map((step) => ({
      id: text(step?.id) || null,
      capability_key: text(step?.capability_key) || null,
      status: text(step?.status) || null,
      result_keys: keys(step?.result),
      verification_keys: keys(step?.verification),
    })),
    binding_state: bindingSummary(current),
  };
}

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("Usage: node scripts/inspect-operator-product-engineering-e2e-report.mjs <report.json>");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(await readFile(reportPath, "utf8"));
} catch (error) {
  console.error(`PRODUCT_E2E_REPORT_INSPECT=FAIL:${text(error?.message || error, 800)}`);
  process.exit(2);
}

const execution = object(report.execution);
const capability = object(execution.capability);
const unwrapped = unwrapResult(execution.result);
const best = findBestCycle(report);
const cycle = object(best.value || unwrapped.value);
const assessment = object(cycle.repository_assessment);
const selection = object(assessment.objective_selection);
const handoff = object(assessment.next_engineering_handoff);
const mission = object(cycle.mission);
const decision = object(cycle.persistence_decision);

console.log("PRODUCT_E2E_REPORT_INSPECT=PASS");
console.log(`REPORT=${reportPath}`);
console.log(`TOP_LEVEL_KEYS=${keys(report).join(",")}`);
console.log(`EXECUTION_STATUS=${text(execution.status) || "NONE"}`);
console.log(`EXECUTION_REASON=${text(execution.reason) || "NONE"}`);
console.log(`CAPABILITY_KEY=${text(capability.key) || [text(capability.domain), text(capability.capability), text(capability.action)].filter(Boolean).join(".") || "NONE"}`);
console.log(`EXECUTION_RESULT_UNWRAP_DEPTH=${Math.max(0, unwrapped.chain.length - 1)}`);
console.log(`EXECUTION_RESULT_UNWRAP_CHAIN=${boundedJson(unwrapped.chain, 2500)}`);
console.log(`PRODUCT_CYCLE_DISCOVERY_PATH=${best.path}`);
console.log(`PRODUCT_CYCLE_DISCOVERY_SCORE=${best.score}`);
console.log(`PRODUCT_CYCLE_KEYS=${keys(cycle).join(",")}`);
console.log(`PRODUCT_CYCLE_STATUS=${text(cycle.status) || "NONE"}`);
console.log(`PRODUCT_EXECUTION_KEY=${text(cycle.execution_key) || "NONE"}`);
console.log(`PRODUCT_REF=${text(cycle.ref) || "NONE"}`);
console.log(`REPOSITORY_HEAD_OBSERVED=${text(cycle.repository_head_observed) || "NONE"}`);
console.log(`ASSESSMENT_KEYS=${keys(assessment).join(",")}`);
console.log(`ASSESSMENT_REPOSITORY_HEAD=${text(assessment?.repository_snapshot?.current_main_head) || "NONE"}`);
console.log(`HANDOFF_REPOSITORY_HEAD=${text(handoff.repository_head_observed) || "NONE"}`);
console.log(`OBJECTIVE_CANDIDATE=${text(selection.selected_candidate_id) || "NONE"}`);
console.log(`OBJECTIVE_EVIDENCE_BACKED=${selection.evidence_backed === true ? "YES" : selection.evidence_backed === false ? "NO" : "NONE"}`);
console.log(`OBJECTIVE_COMPLETION_CRITERIA=${list(selection.selected_completion_criteria).length}`);
console.log(`OBJECTIVE=${text(selection.selected_objective || handoff.focus, 600) || "NONE"}`);
console.log(`PERSISTENCE_DECISION=${text(decision.decision) || "NONE"}`);
console.log(`PERSISTENCE_REASON=${text(decision.reason_code || decision.reason) || "NONE"}`);
console.log(`MISSION=${boundedJson(missionSummary(mission), 9000)}`);
console.log(`RESPONSE_TEXT=${text(report?.decision?.response_text, 1600) || "NONE"}`);
