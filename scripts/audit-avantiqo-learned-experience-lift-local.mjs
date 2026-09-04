#!/usr/bin/env node

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import {
  evaluateAvantiqoLearnedExperienceLiftCertification,
} from "../lib/intelligence/runtime/AvantiqoLearnedExperienceLiftCertificationRuntime.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { rankAvantiqoKnowledgeRows } = await import(
  "../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
);

const NOW_MS = Date.parse("2026-09-04T00:50:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const date = (days) => new Date(NOW_MS + days * DAY_MS).toISOString();
const sources = [
  { id: "official", url: "https://example.gov/reference", title: "Official reference", publisher: "Example Authority", official: true, primary: true },
  { id: "primary", url: "https://standards.example.org/reference", title: "Primary standard", publisher: "Example Standards", primary: true },
];

function row({ id, content, domain = "intelligence", verifiedDays = -2, validDays = 365, aliases = [], supersededBy = null, supersededAt = null, forgottenAt = null } = {}) {
  const verifiedAt = date(verifiedDays);
  return {
    id,
    memory_type: "lesson",
    subject: `experience:${id}`,
    content,
    importance: 0.9,
    confidence: 0.97,
    source: "avantiqo_explicit_final_knowledge_release",
    active: true,
    valid_until: date(validDays),
    superseded_by: supersededBy,
    superseded_at: supersededAt,
    forgotten_at: forgottenAt,
    metadata: {
      knowledge_domain: domain,
      topic_key: id,
      verified_at: verifiedAt,
      evidence_status: "SUPPORTED",
      sources,
      aliases,
    },
    updated_at: verifiedAt,
    created_at: verifiedAt,
  };
}

const categories = [
  ["static-recall", "finance", "Sensitive finance releases require independent authority, verified evidence and an auditable execution result."],
  ["changing-state", "integrations", "Current API integration changes require explicit contracts, compatibility governance and migration evidence."],
  ["workflow-experience", "finance", "Accounts payable should capture, validate, approve, post, schedule, release, reconcile and preserve audit evidence."],
  ["environment-gotcha", "intelligence", "Expensive inference jobs must resume the exact existing remote call and never resubmit blindly after an ambiguous transport result."],
  ["premise-awareness", "intelligence", "Current mutable facts must be freshness-checked and stale learned knowledge must not suppress fresh evidence collection."],
  ["retention-control", "projects", "Project deliverables require owner, dependency closure, review, acceptance evidence and explicit closure."],
];

const cases = [];
for (let i = 0; i < 6; i += 1) {
  for (const [category, domain, content] of categories) {
    const learnedId = `${category}-${i + 1}`;
    const learned = row({ id: learnedId, domain, content, aliases: [`${category} learned principle ${i + 1}`] });
    const noise = [
      row({ id: `noise-${category}-${i + 1}-a`, domain: "people", content: "Employee scheduling requires availability and approval controls." }),
      row({ id: `noise-${category}-${i + 1}-b`, domain: "supply-chain", content: "Inventory movements require traceable quantity and location evidence." }),
    ];
    const learningGainCase = category !== "retention-control";
    cases.push({
      id: `${category}-case-${i + 1}`,
      category,
      query: `Which retained ${category.replaceAll("-", " ")} principle should be applied here? ${category} learned principle ${i + 1}`,
      domain,
      baseline_rows: learningGainCase ? noise : [learned, ...noise],
      candidate_rows: [learned, ...noise],
      expected_id: learnedId,
      learning_gain_case: learningGainCase,
      premise_awareness: category === "premise-awareness",
      retention_control: category === "retention-control",
      session_count: 8 + i,
      revision_count: category === "changing-state" ? 2 : 0,
      superseded_ids: [],
      forgotten_ids: [],
      expired_ids: [],
    });
  }
}

// Replace the final premise-awareness case with an explicit stale-only abstention test.
const premiseIndex = cases.findIndex((item) => item.id === "premise-awareness-case-6");
const stale = row({
  id: "premise-awareness-stale-only",
  domain: "intelligence",
  content: "A latest mutable provider rule from long ago should be reused forever without checking freshness.",
  verifiedDays: -100,
  validDays: -1,
  aliases: ["premise awareness learned principle 6"],
});
cases[premiseIndex] = {
  ...cases[premiseIndex],
  query: "What is the latest mutable provider rule? premise awareness learned principle 6",
  baseline_rows: [],
  candidate_rows: [stale],
  expected_id: null,
  expected_abstain: true,
  expired_ids: [stale.id],
};

const result = evaluateAvantiqoLearnedExperienceLiftCertification({
  cases,
  runArm: (benchmarkCase, arm) => {
    const rows = arm === "candidate" ? benchmarkCase.candidate_rows : benchmarkCase.baseline_rows;
    const ranked = rankAvantiqoKnowledgeRows({
      rows,
      query: benchmarkCase.query,
      domain: benchmarkCase.domain,
      now_ms: NOW_MS,
      include_internal: false,
      limit: 3,
    });
    const selected = ranked.ranked || [];
    return {
      retrieved_ids: selected.map((entry) => entry.row.id),
      raw_result_count: selected.length,
      context_chars: selected.reduce((sum, entry) => sum + String(entry.row.content || "").length, 0),
    };
  },
});

console.log("AVANTIQO_LEARNED_EXPERIENCE_LIFT_DIAGNOSTICS");
console.log(JSON.stringify({ failures: result.failures, failed_cases: result.failed_cases }, null, 2));
assert.equal(result.contract, "AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_V1");
assert.equal(result.summary.case_count, 36);
assert.equal(result.success, true, JSON.stringify(result.failures));
assert.equal(result.summary.retention_regression_count, 0);
assert.equal(result.summary.superseded_leakage_count, 0);
assert.equal(result.summary.forgotten_leakage_count, 0);
assert.equal(result.summary.expired_leakage_count, 0);

console.log("AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_PASS");
console.log(JSON.stringify({ status: result.status, summary: result.summary, category_metrics: result.category_metrics }, null, 2));
