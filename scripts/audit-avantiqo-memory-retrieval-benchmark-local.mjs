#!/usr/bin/env node

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import {
  evaluateAvantiqoMemoryRetrievalBenchmark,
} from "../lib/intelligence/runtime/AvantiqoMemoryRetrievalBenchmarkRuntime.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  rankAvantiqoKnowledgeRows,
} = await import("../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js");

const NOW_MS = Date.parse("2026-09-03T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const fresh = new Date(NOW_MS - DAY_MS).toISOString();
const veryFresh = new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString();
const stale = new Date(NOW_MS - 30 * DAY_MS).toISOString();
const historical = new Date(NOW_MS - 400 * DAY_MS).toISOString();
const future = new Date(NOW_MS + 180 * DAY_MS).toISOString();
const expired = new Date(NOW_MS - DAY_MS).toISOString();

const officialSources = [
  { id: "official-1", url: "https://example.gov/standard", title: "Official standard", publisher: "Example Government", official: true, primary: true },
  { id: "primary-2", url: "https://standards.example.org/reference", title: "Primary reference", publisher: "Example Standards", official: false, primary: true },
];

function row({ id, content, domain, jurisdiction = null, confidence = 0.94, importance = 0.8, source = "verified_continuous_owned_web_evidence", verifiedAt = fresh, validUntil = future, aliases = [] } = {}) {
  return {
    id,
    memory_scope: "platform_knowledge",
    memory_type: "lesson",
    subject: `knowledge:${id}`,
    content,
    importance,
    confidence,
    source,
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: { knowledge_domain: domain, jurisdiction, topic_key: id, verified_at: verifiedAt, evidence_status: "SUPPORTED", aliases, sources: officialSources },
    updated_at: verifiedAt,
    created_at: verifiedAt,
  };
}

const distractors = {
  project: row({ id: "project-milestones", domain: "projects", content: "Project milestones track delivery checkpoints, owners and dependencies." }),
  people: row({ id: "leave-policy", domain: "people", content: "Employee leave requests require entitlement checks, approval and recorded absence dates." }),
  crm: row({ id: "sales-pipeline", domain: "commercial", content: "Sales opportunities track prospects, probability, next actions and expected revenue." }),
  inventory: row({ id: "inventory-count", domain: "supply-chain", content: "Inventory counts reconcile warehouse stock on hand, quantities and location variance." }),
  api: row({ id: "api-contract", domain: "integrations", content: "API endpoints require authentication, versioning, error contracts and observability." }),
};

const cases = [
  { id: "semantic-supplier-vendor", category: "semantic-bridge", query: "What information should we keep for suppliers and supplier bills?", relevant_ids: ["vendor-control"], rows: [row({ id: "vendor-control", domain: "supply-chain", content: "Vendor master records and vendor bills require controlled lifecycle, validation, approvals and audit evidence." }), distractors.project, distractors.people] },
  { id: "semantic-receivables-ar", category: "semantic-bridge", query: "How should we manage customer receivables and overdue balances?", relevant_ids: ["accounts-receivable"], rows: [row({ id: "accounts-receivable", domain: "finance", content: "Accounts receivable tracks customer invoices, debtor balances, due dates, settlements and collection evidence." }), distractors.crm, distractors.inventory] },
  { id: "semantic-stock-inventory", category: "semantic-bridge", query: "What controls do we need for stock on hand and warehouse movements?", relevant_ids: ["inventory-movement"], rows: [row({ id: "inventory-movement", domain: "supply-chain", content: "Inventory balances and warehouse movements require traceable locations, quantities, documents and audit history." }), distractors.project, distractors.api] },
  { id: "finance-ap-domain", category: "domain-disambiguation", query: "How should supplier bills be approved before payment?", domain: "finance", relevant_ids: ["ap-approval"], rows: [row({ id: "ap-approval", domain: "finance", content: "Accounts payable supplier bills require invoice validation, approval authority, posting controls and payment release evidence." }), row({ id: "supplier-onboarding", domain: "supply-chain", content: "Supplier approval covers vendor onboarding, sourcing qualification and purchasing eligibility." }), distractors.people] },
  { id: "commercial-customer-domain", category: "domain-disambiguation", query: "Which customer records help the sales team manage deals?", domain: "commercial", relevant_ids: ["crm-customer"], rows: [row({ id: "crm-customer", domain: "commercial", content: "Customer account records connect contacts, opportunities, sales pipeline activity and commercial history." }), row({ id: "ar-customer", domain: "finance", content: "Customer records in accounts receivable track invoices, debtor balances and collections." }), distractors.people] },
  { id: "people-payroll-domain", category: "domain-disambiguation", query: "How do we control employee salary and pay runs?", domain: "people", relevant_ids: ["payroll-control"], rows: [row({ id: "payroll-control", domain: "people", content: "Payroll controls validate employee salary, wages, compensation changes and pay run approval." }), row({ id: "cash-payments", domain: "finance", content: "Cash payments require bank controls, settlement approval and reconciliation." }), distractors.project] },
  { id: "current-api-fresh", category: "temporal", query: "What is the current API integration standard requirement?", relevant_ids: ["api-current"], forbidden_ids: ["api-old"], rows: [row({ id: "api-current", domain: "integrations", verifiedAt: veryFresh, content: "Current API integration standards require authenticated endpoints, explicit version contracts, error handling and observability." }), row({ id: "api-old", domain: "integrations", verifiedAt: stale, content: "API integration standard requirement uses undocumented endpoints without version contracts." }), distractors.project] },
  { id: "current-tax-fresh", category: "temporal", query: "What is the current tax filing requirement for a finance workflow?", domain: "finance", relevant_ids: ["tax-current"], forbidden_ids: ["tax-old"], rows: [row({ id: "tax-current", domain: "finance", verifiedAt: veryFresh, content: "Current tax filing requirements should be verified against authoritative rules before posting or submission." }), row({ id: "tax-old", domain: "finance", verifiedAt: stale, content: "Historical tax filing requirements can be reused without checking current rules." }), distractors.api] },
  { id: "stale-only-current-rejected", category: "negative-rejection", query: "What is the current API standard requirement?", expect_none: true, forbidden_ids: ["stale-api-only"], rows: [row({ id: "stale-api-only", domain: "integrations", verifiedAt: stale, content: "API integration standards require documented endpoints and error contracts." })] },
  { id: "low-confidence-rejected", category: "negative-rejection", query: "How should vendor bills be approved?", expect_none: true, forbidden_ids: ["weak-vendor-bill"], rows: [row({ id: "weak-vendor-bill", domain: "finance", confidence: 0.42, content: "Vendor bills use approval controls." })] },
  { id: "expired-memory-rejected", category: "negative-rejection", query: "How should inventory movements be controlled?", expect_none: true, forbidden_ids: ["expired-inventory"], rows: [row({ id: "expired-inventory", domain: "supply-chain", validUntil: expired, content: "Inventory movements require traceable documents and locations." })] },
  { id: "internal-memory-not-leaked", category: "negative-rejection", query: "How should accounts payable approvals work?", relevant_ids: ["external-ap"], forbidden_ids: ["internal-ap"], rows: [row({ id: "external-ap", domain: "finance", content: "Accounts payable approvals require supplier bill validation, authority checks and posting evidence." }), row({ id: "internal-ap", domain: "finance", source: "avantiqo_canonical_product_knowledge", confidence: 1, importance: 1, content: "Accounts payable approvals require supplier bill validation, authority checks and posting evidence." })] },
  { id: "adversarial-importance", category: "distractor-resilience", query: "How should purchase orders be controlled before supplier commitment?", relevant_ids: ["po-control"], rows: [row({ id: "po-control", domain: "supply-chain", confidence: 0.9, importance: 0.6, content: "Purchase orders require supplier, quantity, price, approval and commitment controls before release." }), row({ id: "high-importance-irrelevant", domain: "projects", confidence: 1, importance: 1, content: "Project status dashboards summarize milestone delivery and workstream ownership." }), distractors.people] },
  { id: "adversarial-fuzzy", category: "distractor-resilience", query: "Which controls prevent unauthorized role permission changes?", relevant_ids: ["access-control"], rows: [row({ id: "access-control", domain: "integrations", content: "Authorization and permission changes require role governance, approval authority and auditable access control evidence." }), row({ id: "approval-generic", domain: "projects", content: "Project change requests require approval before schedule revisions." }), distractors.crm] },
  { id: "journal-posting", category: "business-knowledge", query: "What controls should exist before a journal entry is posted to the ledger?", relevant_ids: ["journal-control"], rows: [row({ id: "journal-control", domain: "finance", content: "General ledger journal entries require balanced debits and credits, posting authority, period validation and audit evidence." }), distractors.inventory, distractors.project] },
  { id: "cash-liquidity", category: "business-knowledge", query: "How do we monitor bank balances and liquidity before making payments?", relevant_ids: ["cash-control"], rows: [row({ id: "cash-control", domain: "finance", content: "Cash and liquidity controls monitor bank balances, working capital, treasury exposure and payment availability." }), distractors.crm, distractors.people] },
  { id: "sales-opportunity", category: "business-knowledge", query: "What should a prospect deal pipeline track?", relevant_ids: ["opportunity-control"], rows: [row({ id: "opportunity-control", domain: "commercial", content: "Sales opportunities track prospects, deal stage, probability, next action, owner and expected revenue." }), distractors.project, distractors.inventory] },
  { id: "employee-leave", category: "business-knowledge", query: "What should happen when staff request time off?", relevant_ids: ["leave-control"], rows: [row({ id: "leave-control", domain: "people", aliases: ["staff time off"], content: "Employee leave and absence requests require entitlement validation, approval, dates and workforce availability controls." }), distractors.project, distractors.crm] },
  { id: "project-deliverable", category: "business-knowledge", query: "How should project milestones and deliverables be tracked?", relevant_ids: ["delivery-control"], rows: [row({ id: "delivery-control", domain: "projects", content: "Project milestones and deliverables track owners, due dates, dependencies, acceptance evidence and delivery checkpoints." }), distractors.inventory, distractors.people] },
  { id: "webhook-event", category: "business-knowledge", query: "How should webhook callbacks and event delivery failures be handled?", relevant_ids: ["webhook-control"], rows: [row({ id: "webhook-control", domain: "integrations", content: "Webhook callbacks require authenticated event delivery, idempotency, retries, failure observability and traceable event identifiers." }), distractors.crm, distractors.project] },
  { id: "thai-jurisdiction", category: "jurisdiction", query: "What evidence should finance keep for a Thailand statutory filing?", domain: "finance", jurisdiction: "TH", relevant_ids: ["th-statutory"], rows: [row({ id: "th-statutory", domain: "finance", jurisdiction: "TH", content: "Thailand statutory finance filings require authoritative source verification, filing evidence and audit traceability." }), row({ id: "sg-statutory", domain: "finance", jurisdiction: "SG", content: "Singapore statutory finance filings require authoritative source verification, filing evidence and audit traceability." }), distractors.project] },
  { id: "singapore-jurisdiction", category: "jurisdiction", query: "What evidence should finance keep for a Singapore statutory filing?", domain: "finance", jurisdiction: "SG", relevant_ids: ["sg-filing"], rows: [row({ id: "sg-filing", domain: "finance", jurisdiction: "SG", content: "Singapore statutory filing evidence should preserve authoritative references, submission state and audit traceability." }), row({ id: "th-filing", domain: "finance", jurisdiction: "TH", content: "Thailand statutory filing evidence should preserve authoritative references, submission state and audit traceability." }), distractors.project] },
  { id: "historical-knowledge-allowed", category: "temporal", query: "What did historical project governance lessons say about milestone acceptance?", relevant_ids: ["historical-project"], rows: [row({ id: "historical-project", domain: "projects", verifiedAt: historical, content: "Historical project governance lessons require milestone acceptance evidence, owner sign-off and dependency closure." }), distractors.inventory, distractors.people] },
  { id: "memory-provenance", category: "intelligence-knowledge", query: "How should AI memory retrieval preserve evidence provenance?", relevant_ids: ["memory-provenance-control"], rows: [row({ id: "memory-provenance-control", domain: "intelligence", content: "Intelligence memory retrieval should preserve verified evidence provenance, confidence, freshness and source references when knowledge is recalled." }), row({ id: "generic-ai", domain: "intelligence", content: "Artificial intelligence agents use models and tools to perform tasks." }), distractors.api] },
  { id: "contradiction-research", category: "intelligence-knowledge", query: "How should research handle contradictory evidence sources?", relevant_ids: ["contradiction-control"], rows: [row({ id: "contradiction-control", domain: "intelligence", content: "Research evidence contradictions should remain explicit, preserve provenance, reduce confidence and require further verification before knowledge promotion." }), row({ id: "generic-research", domain: "intelligence", content: "Research collects sources and creates summaries." }), distractors.project] },
];

const result = evaluateAvantiqoMemoryRetrievalBenchmark({
  cases,
  runCase: (benchmarkCase) => {
    const ranked = rankAvantiqoKnowledgeRows({
      rows: benchmarkCase.rows,
      query: benchmarkCase.query,
      domain: benchmarkCase.domain || null,
      jurisdiction: benchmarkCase.jurisdiction || null,
      freshness_days: benchmarkCase.freshness_days ?? null,
      include_internal: false,
      now_ms: NOW_MS,
      limit: 3,
    });
    const selected = ranked.ranked || [];
    return {
      retrieved_ids: selected.map((item) => item.row.id),
      raw_result_count: selected.length,
      context_chars: selected.reduce((sum, item) => sum + String(item.row.content || "").length, 0),
    };
  },
});

const top1Misses = result.evaluations
  .filter((item) => !item.top1_hit)
  .map((item) => ({
    id: item.id,
    category: item.category,
    retrieved_ids: item.retrieved_ids,
    relevant_ids: item.relevant_ids,
    forbidden_hits: item.forbidden_hits,
    reciprocal_rank: item.reciprocal_rank,
    context_chars: item.context_chars,
  }));

console.log("AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_DIAGNOSTICS");
console.log(JSON.stringify({ failures: result.failures, top1_misses: top1Misses }, null, 2));

assert.equal(result.contract, "AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_V1");
assert.equal(result.summary.case_count, cases.length);
assert.ok(result.summary.category_count >= 8);
assert.equal(result.summary.forbidden_retrieval_count, 0);
assert.equal(result.summary.negative_case_failure_count, 0);
assert.equal(result.success, true, JSON.stringify(result.failed_cases, null, 2));
assert.equal(result.status, "MEMORY_RETRIEVAL_CERTIFIED");
assert.equal(result.governance.external_provider_required, false);
assert.equal(result.governance.gpu_required, false);
assert.equal(result.governance.automatic_memory_mutation, false);
assert.equal(result.governance.automatic_model_promotion, false);

console.log("AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_AUDIT_PASS");
console.log(JSON.stringify({
  status: result.status,
  case_count: result.summary.case_count,
  category_count: result.summary.category_count,
  top1_accuracy: result.summary.top1_accuracy,
  recall_at_3: result.summary.recall_at_3,
  mean_reciprocal_rank: result.summary.mean_reciprocal_rank,
  context_precision_at_3: result.summary.context_precision_at_3,
  maximum_context_chars: result.summary.maximum_context_chars,
  forbidden_retrieval_count: result.summary.forbidden_retrieval_count,
  negative_case_failure_count: result.summary.negative_case_failure_count,
  provider_execution_used: false,
  gpu_execution_used: false,
}, null, 2));
