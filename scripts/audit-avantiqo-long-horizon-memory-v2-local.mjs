#!/usr/bin/env node

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import {
  evaluateAvantiqoLongHorizonMemoryCertification,
} from "../lib/intelligence/runtime/AvantiqoLongHorizonMemoryCertificationRuntime.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { rankAvantiqoKnowledgeRows } = await import(
  "../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
);

const NOW_MS = Date.parse("2026-09-03T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const fresh = (hours = 2) => new Date(NOW_MS - hours * 60 * 60 * 1000).toISOString();
const old = (days = 120) => new Date(NOW_MS - days * DAY_MS).toISOString();
const future = new Date(NOW_MS + 365 * DAY_MS).toISOString();
const expired = new Date(NOW_MS - DAY_MS).toISOString();
const supersededAt = fresh(1);

const sources = [
  { id: "primary-a", url: "https://standards.example.org/a", title: "Primary A", publisher: "Standards", official: true, primary: true },
  { id: "primary-b", url: "https://evidence.example.org/b", title: "Primary B", publisher: "Evidence", primary: true },
];

function row({
  id,
  domain,
  content,
  aliases = [],
  confidence = 0.94,
  importance = 0.82,
  verifiedAt = fresh(),
  validUntil = future,
  active = true,
  supersededBy = null,
  superseded = null,
  forgotten = null,
} = {}) {
  return {
    id,
    memory_scope: "platform_knowledge",
    memory_type: "lesson",
    subject: `knowledge:${id}`,
    content,
    importance,
    confidence,
    source: "avantiqo_explicit_final_knowledge_release",
    active,
    valid_until: validUntil,
    superseded_by: supersededBy,
    superseded_at: superseded,
    forgotten_at: forgotten,
    metadata: {
      knowledge_domain: domain,
      topic_key: id,
      aliases,
      verified_at: verifiedAt,
      evidence_status: "SUPPORTED",
      sources,
    },
    updated_at: verifiedAt,
    created_at: verifiedAt,
  };
}

const domainNoise = {
  finance: row({ id: "noise-finance", domain: "finance", content: "Treasury dashboards summarize cash positions, bank exposure and liquidity forecasts." }),
  projects: row({ id: "noise-project", domain: "projects", content: "Project portfolio dashboards summarize initiative health, budget exposure and executive reporting." }),
  integrations: row({ id: "noise-integration", domain: "integrations", content: "Integration observability records request latency, service health and dependency availability." }),
  people: row({ id: "noise-people", domain: "people", content: "Workforce planning compares staffing capacity, role demand and hiring forecasts." }),
  commercial: row({ id: "noise-commercial", domain: "commercial", content: "Commercial forecasting summarizes pipeline value, probability and expected revenue." }),
  "supply-chain": row({ id: "noise-supply", domain: "supply-chain", content: "Warehouse planning measures storage capacity, picking load and replenishment demand." }),
  intelligence: row({ id: "noise-intelligence", domain: "intelligence", content: "Intelligence evaluation tracks benchmark coverage, latency and evidence provenance." }),
};

function revisionCase({ id, domain, query, current, previous, sessions = 5, revisions = 1, category = "state-evolution", aliases = [] }) {
  const currentRow = row({ id: `${id}-current`, domain, content: current, aliases, verifiedAt: fresh(2) });
  const staleRow = row({
    id: `${id}-old`, domain, content: previous, confidence: 1, importance: 1,
    verifiedAt: old(180), supersededBy: currentRow.id, superseded: supersededAt,
  });
  return {
    id, category, query, domain, expected_id: currentRow.id,
    superseded_ids: [staleRow.id], session_count: sessions, revision_count: revisions,
    cross_session: true, rows: [staleRow, currentRow, domainNoise[domain]],
  };
}

function forgettingCase({ id, domain, query, valid, invalid }) {
  const good = row({ id: `${id}-valid`, domain, content: valid, verifiedAt: old(40) });
  const bad = row({ id: `${id}-forgotten`, domain, content: invalid, confidence: 1, importance: 1, verifiedAt: fresh(1), forgotten: fresh(0.5) });
  return {
    id, category: "controlled-forgetting", query, domain, expected_id: good.id,
    forgotten_ids: [bad.id], session_count: 6, revision_count: 1,
    cross_session: true, retention: true, rows: [bad, good, domainNoise[domain]],
  };
}

function expiryCase({ id, domain, query, valid, invalid }) {
  const good = row({ id: `${id}-valid`, domain, content: valid, verifiedAt: fresh(3) });
  const bad = row({ id: `${id}-expired`, domain, content: invalid, confidence: 1, importance: 1, verifiedAt: fresh(1), validUntil: expired });
  return {
    id, category: "expiry-safety", query, domain, expected_id: good.id,
    expired_ids: [bad.id], session_count: 5, revision_count: 1,
    cross_session: true, rows: [bad, good, domainNoise[domain]],
  };
}

function retentionCase({ id, domain, query, content, aliases = [], sessions = 8, compaction = false }) {
  const good = row({ id: `${id}-retained`, domain, content, aliases, verifiedAt: old(90) });
  return {
    id, category: compaction ? "compaction-restart" : "durable-retention",
    query, domain, expected_id: good.id, session_count: sessions, revision_count: 0,
    cross_session: true, retention: true, compaction_restart: compaction,
    rows: [good, domainNoise[domain]],
  };
}

function premiseCase({ id, domain, query, current, oldFact }) {
  const currentRow = row({ id: `${id}-current`, domain, content: current, verifiedAt: fresh(1) });
  const oldRow = row({ id: `${id}-old`, domain, content: oldFact, confidence: 1, importance: 1, verifiedAt: old(300), supersededBy: currentRow.id, superseded: supersededAt });
  return {
    id, category: "premise-awareness", query, domain, expected_id: currentRow.id,
    superseded_ids: [oldRow.id], session_count: 7, revision_count: 2,
    cross_session: true, premise_awareness: true, rows: [oldRow, currentRow, domainNoise[domain]],
  };
}

const cases = [
  revisionCase({ id: "rev-ap-approval", domain: "finance", query: "What is the active accounts payable supplier bill approval rule?", current: "Accounts payable supplier bills require invoice validation, approval authority and posting evidence before payment release.", previous: "Accounts payable supplier bills may be paid before approval when the vendor is known." }),
  revisionCase({ id: "rev-journal-control", domain: "finance", query: "What journal posting control is active?", current: "General ledger journal entries require balanced debits and credits, period validation and posting authority.", previous: "Journal entries may be posted without balance validation." }),
  revisionCase({ id: "rev-webhook", domain: "integrations", query: "What webhook delivery rule is active?", current: "Webhook event delivery requires authentication, idempotency, retry policy and traceable event identifiers.", previous: "Webhook callbacks can be retried without idempotency identifiers." }),
  revisionCase({ id: "rev-payroll", domain: "people", query: "What payroll change control is active?", current: "Payroll salary changes require authorization, effective dates and auditable approval before the pay run.", previous: "Payroll salary changes may be applied without approval." }),
  revisionCase({ id: "rev-inventory", domain: "supply-chain", query: "What inventory movement control is active?", current: "Inventory movements require source documents, quantities, locations and auditable movement history.", previous: "Inventory can be moved without source documentation." }),
  revisionCase({ id: "rev-opportunity", domain: "commercial", query: "What sales opportunity lesson is active?", current: "Sales opportunities track owner, stage, probability, next action and expected revenue.", previous: "Sales opportunities need only a customer name and estimated value." }),

  revisionCase({ id: "multi-api", domain: "integrations", query: "Which API contract rule survived the latest revisions?", current: "API contracts require authenticated endpoints, explicit versioning, stable error semantics and observability.", previous: "API contracts can rely on undocumented endpoint behavior.", sessions: 10, revisions: 3, category: "successive-revision", aliases: ["api contract rule", "endpoint contract"] }),
  revisionCase({ id: "multi-finance", domain: "finance", query: "Which receivables collection rule survived multiple revisions?", current: "Accounts receivable collection work preserves invoice, due date, settlement and collection evidence.", previous: "Receivables can be cleared without settlement evidence.", sessions: 9, revisions: 4, category: "successive-revision", aliases: ["receivables collection rule"] }),
  revisionCase({ id: "multi-research", domain: "intelligence", query: "Which contradictory evidence rule survived revision?", current: "Contradictory research evidence remains explicit, preserves provenance and blocks promotion until sufficiently resolved.", previous: "Conflicting research sources should be averaged into one confident answer.", sessions: 11, revisions: 3, category: "successive-revision", aliases: ["contradictory evidence rule"] }),
  revisionCase({ id: "multi-project", domain: "projects", query: "Which project change lesson survived the revisions?", current: "Project change decisions preserve owner, impact, approval and acceptance evidence.", previous: "Project scope changes can be accepted without impact evidence.", sessions: 8, revisions: 2, category: "successive-revision", aliases: ["project change lesson"] }),

  forgettingCase({ id: "forget-finance", domain: "finance", query: "How should supplier payment approval work?", valid: "Supplier payment approval requires validated payable evidence and authorized payment release.", invalid: "Supplier payment approval should be bypassed for frequent vendors." }),
  forgettingCase({ id: "forget-integration", domain: "integrations", query: "How should authentication secrets be handled in integrations?", valid: "Integration authentication secrets require controlled storage, scoped access and rotation evidence.", invalid: "Integration authentication secrets should be written into operational logs for debugging." }),
  forgettingCase({ id: "forget-people", domain: "people", query: "How should employee role permission changes be controlled?", valid: "Employee role permission changes require authorization, least privilege and auditable approval.", invalid: "Employee permissions can be copied from any colleague without approval." }),
  forgettingCase({ id: "forget-research", domain: "intelligence", query: "How should unsupported research claims be treated?", valid: "Unsupported research claims must remain unpromoted until adequate evidence and verification exist.", invalid: "Unsupported research claims should be promoted when they sound plausible." }),

  expiryCase({ id: "expire-tax", domain: "finance", query: "What finance filing evidence rule can be reused?", valid: "Finance filing workflows preserve authoritative references, submission state and audit evidence.", invalid: "Expired statutory filing guidance can be reused without revalidation." }),
  expiryCase({ id: "expire-api", domain: "integrations", query: "What API integration guidance can be reused?", valid: "Reusable API integration guidance requires a valid contract, authentication and current evidence.", invalid: "Expired API guidance remains reusable indefinitely." }),
  expiryCase({ id: "expire-supply", domain: "supply-chain", query: "What supplier qualification guidance can be reused?", valid: "Supplier qualification guidance requires valid evidence, approval state and traceable review.", invalid: "Expired supplier qualification evidence remains valid forever." }),
  expiryCase({ id: "expire-intelligence", domain: "intelligence", query: "What memory evidence can be reused?", valid: "Reusable intelligence memory requires valid evidence provenance, confidence and lifecycle state.", invalid: "Expired intelligence memory may be reused whenever lexical similarity is high." }),

  retentionCase({ id: "retain-project", domain: "projects", query: "What project milestone lesson remains valid?", content: "Project milestones require an accountable owner, due date, dependency closure and acceptance evidence.", aliases: ["project milestone lesson", "milestone governance"] }),
  retentionCase({ id: "retain-finance", domain: "finance", query: "What journal governance lesson remains valid?", content: "Journal governance requires balanced entries, posting authority, valid periods and auditable evidence.", aliases: ["journal governance lesson"] }),
  retentionCase({ id: "retain-people", domain: "people", query: "What leave approval lesson remains valid?", content: "Employee leave approval requires entitlement checks, dates, approval and workforce availability controls.", aliases: ["leave approval lesson"] }),
  retentionCase({ id: "retain-commercial", domain: "commercial", query: "What opportunity governance lesson remains valid?", content: "Opportunity governance keeps owner, stage, probability, next action and expected revenue evidence.", aliases: ["opportunity governance lesson"] }),

  retentionCase({ id: "restart-finance", domain: "finance", query: "After restart, recall the supplier bill approval lesson.", content: "Supplier bill approval requires invoice validation, approval authority, posting controls and payment-release evidence.", aliases: ["supplier bill approval lesson"], sessions: 14, compaction: true }),
  retentionCase({ id: "restart-project", domain: "projects", query: "After compaction, recall the deliverable acceptance lesson.", content: "Project deliverable acceptance requires owner sign-off, acceptance evidence and dependency closure.", aliases: ["deliverable acceptance lesson"], sessions: 16, compaction: true }),
  retentionCase({ id: "restart-integration", domain: "integrations", query: "After restart, recall the webhook reliability lesson.", content: "Webhook reliability requires authenticated delivery, idempotency, bounded retries and failure observability.", aliases: ["webhook reliability lesson"], sessions: 15, compaction: true }),
  retentionCase({ id: "restart-intelligence", domain: "intelligence", query: "After compaction, recall the evidence provenance lesson.", content: "Memory evidence provenance preserves sources, verification state, confidence, freshness and lifecycle status.", aliases: ["evidence provenance lesson"], sessions: 18, compaction: true }),

  premiseCase({ id: "premise-api", domain: "integrations", query: "Given that API contracts have changed, which endpoint rule should be used?", current: "Changed API contracts require the verified current endpoint version, authentication contract and error semantics.", oldFact: "The previous API endpoint contract remains authoritative after a version change." }),
  premiseCase({ id: "premise-finance", domain: "finance", query: "Given that the posting policy was revised, which journal rule should be used?", current: "The revised journal policy requires balanced entries, active-period validation and authorized posting.", oldFact: "The superseded journal policy permits posting into a closed period." }),
  premiseCase({ id: "premise-project", domain: "projects", query: "Given that project acceptance rules changed, which deliverable rule applies?", current: "The revised deliverable rule requires explicit acceptance evidence and accountable owner sign-off.", oldFact: "The superseded deliverable rule treats delivery alone as acceptance." }),
  premiseCase({ id: "premise-research", domain: "intelligence", query: "Given that evidence was contradicted, which research rule applies?", current: "Contradicted evidence remains unresolved and cannot support reusable knowledge until independently revalidated.", oldFact: "Previously accepted evidence remains reusable after contradiction without revalidation." }),

  revisionCase({ id: "cross-finance", domain: "finance", query: "Across sessions, what cash reconciliation lesson should be recalled?", current: "Bank reconciliation matches statement movements to ledger entries and preserves unresolved differences as explicit exceptions.", previous: "Bank differences may be silently written off during reconciliation.", sessions: 12, category: "cross-session-transfer", aliases: ["cash reconciliation lesson"] }),
  revisionCase({ id: "cross-supply", domain: "supply-chain", query: "Across sessions, what purchase order lesson should be recalled?", current: "Purchase orders require supplier, quantity, price, approval and commitment controls before release.", previous: "Purchase orders may be released before approval.", sessions: 13, category: "cross-session-transfer", aliases: ["purchase order lesson"] }),
  revisionCase({ id: "cross-people", domain: "people", query: "Across sessions, what payroll lesson should be recalled?", current: "Pay runs require validated employees, compensation inputs, approval and auditable settlement evidence.", previous: "Pay runs can execute before compensation changes are approved.", sessions: 12, category: "cross-session-transfer", aliases: ["payroll lesson"] }),
  revisionCase({ id: "cross-commercial", domain: "commercial", query: "Across sessions, what customer deal lesson should be recalled?", current: "Customer deal records preserve owner, stage, next action, expected value and decision history.", previous: "Customer deals need only expected value.", sessions: 10, category: "cross-session-transfer", aliases: ["customer deal lesson"] }),
];

const result = evaluateAvantiqoLongHorizonMemoryCertification({
  cases,
  runCase: (benchmarkCase) => {
    const ranked = rankAvantiqoKnowledgeRows({
      rows: benchmarkCase.rows,
      query: benchmarkCase.query,
      domain: benchmarkCase.domain,
      include_internal: false,
      now_ms: NOW_MS,
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

console.log("AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_DIAGNOSTICS");
console.log(JSON.stringify({ failures: result.failures, failed_cases: result.failed_cases }, null, 2));

assert.equal(result.contract, "AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_V1");
assert.equal(result.summary.case_count, cases.length);
assert.ok(result.summary.category_count >= 8);
assert.equal(result.summary.superseded_leakage_count, 0);
assert.equal(result.summary.forgotten_leakage_count, 0);
assert.equal(result.summary.expired_leakage_count, 0);
assert.equal(result.governance.external_provider_required, false);
assert.equal(result.governance.gpu_required, false);
assert.equal(result.governance.wallet_effect, "NONE");
assert.equal(result.success, true, JSON.stringify(result.failures));

console.log("AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_PASS");
console.log(JSON.stringify({
  status: result.status,
  ...result.summary,
  provider_execution_used: false,
  gpu_execution_used: false,
  wallet_effect: "NONE",
}, null, 2));
