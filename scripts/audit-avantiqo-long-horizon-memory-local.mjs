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

const NOW_MS = Date.parse("2026-09-03T13:50:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const date = (days) => new Date(NOW_MS + days * DAY_MS).toISOString();
const officialSources = [
  { id: "official", url: "https://example.gov/current", title: "Official current reference", publisher: "Example Authority", official: true, primary: true },
  { id: "primary", url: "https://standards.example.org/current", title: "Primary reference", publisher: "Example Standards", primary: true },
];

function memory({
  id,
  content,
  domain = "intelligence",
  verifiedDays = -1,
  validDays = 120,
  importance = 0.82,
  confidence = 0.96,
  supersededBy = null,
  supersededAt = null,
  forgottenAt = null,
  aliases = [],
  jurisdiction = null,
} = {}) {
  const verifiedAt = date(verifiedDays);
  return {
    id,
    memory_scope: "platform_knowledge",
    memory_type: "lesson",
    subject: `knowledge:${id}`,
    content,
    importance,
    confidence,
    source: "verified_continuous_owned_web_evidence",
    active: true,
    valid_until: date(validDays),
    superseded_by: supersededBy,
    superseded_at: supersededAt,
    forgotten_at: forgottenAt,
    metadata: {
      knowledge_domain: domain,
      jurisdiction,
      topic_key: id,
      verified_at: verifiedAt,
      evidence_status: "SUPPORTED",
      sources: officialSources,
      aliases,
    },
    updated_at: verifiedAt,
    created_at: verifiedAt,
  };
}

const noise = [
  memory({ id: "noise-project", domain: "projects", content: "Project milestones track owners, due dates and delivery evidence." }),
  memory({ id: "noise-finance", domain: "finance", content: "Accounts payable requires supplier bill validation and posting approval." }),
  memory({ id: "noise-people", domain: "people", content: "Employee leave requires entitlement checks and approval." }),
];

function evolution({ id, category, query, domain = "intelligence", states, expectedIndex, sessionCount, flags = {} }) {
  const rows = states.map((state, index) => memory({
    id: `${id}-v${index + 1}`,
    domain,
    content: state.content,
    verifiedDays: state.verifiedDays,
    validDays: state.validDays ?? 120,
    importance: state.importance ?? 0.88,
    confidence: state.confidence ?? 0.96,
    supersededBy: state.supersededBy ?? null,
    supersededAt: state.supersededAt ?? null,
    forgottenAt: state.forgottenAt ?? null,
    aliases: state.aliases ?? [],
  }));
  return {
    id,
    category,
    query,
    domain,
    rows: [...rows, ...noise],
    expected_id: rows[expectedIndex].id,
    superseded_ids: rows.filter((row) => row.superseded_at || row.superseded_by).map((row) => row.id),
    forgotten_ids: rows.filter((row) => row.forgotten_at).map((row) => row.id),
    expired_ids: rows.filter((row) => Date.parse(row.valid_until) <= NOW_MS).map((row) => row.id),
    session_count: sessionCount,
    revision_count: Math.max(0, states.length - 1),
    ...flags,
  };
}

const cases = [
  evolution({ id: "api-policy-revision", category: "state-revision", query: "What is the current API authentication policy?", domain: "integrations", sessionCount: 4, expectedIndex: 2, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -60, content: "API authentication policy permits static shared credentials.", supersededBy: "api-policy-revision-v2", supersededAt: date(-30) },
    { verifiedDays: -30, content: "API authentication policy requires per-client credentials.", supersededBy: "api-policy-revision-v3", supersededAt: date(-2) },
    { verifiedDays: -2, content: "Current API authentication policy requires OAuth or signed service credentials with rotation and audit evidence." },
  ] }),
  evolution({ id: "tax-filing-revision", category: "state-revision", query: "What is the current tax filing evidence requirement?", domain: "finance", sessionCount: 5, expectedIndex: 2, flags: { cross_session: true }, states: [
    { verifiedDays: -70, content: "Tax filing evidence only needs a submission timestamp.", supersededBy: "tax-filing-revision-v2", supersededAt: date(-20) },
    { verifiedDays: -20, content: "Tax filing evidence needs submission receipt and period reference.", supersededBy: "tax-filing-revision-v3", supersededAt: date(-1) },
    { verifiedDays: -1, content: "Current tax filing evidence requires authoritative source verification, submission receipt, period reference and audit traceability." },
  ] }),
  evolution({ id: "vendor-rule-revision", category: "state-revision", query: "What is the current vendor approval rule?", domain: "supply-chain", sessionCount: 4, expectedIndex: 1, flags: { cross_session: true }, states: [
    { verifiedDays: -45, content: "Vendor approval rule needs only a vendor name.", supersededBy: "vendor-rule-revision-v2", supersededAt: date(-3), importance: 1 },
    { verifiedDays: -3, content: "Current vendor approval rule requires identity, commercial qualification, approval authority and audit evidence." },
  ] }),
  evolution({ id: "privacy-rule-revision", category: "state-revision", query: "What is the current intelligence memory privacy rule?", sessionCount: 6, expectedIndex: 2, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -90, content: "Intelligence memory privacy rule allows raw private payload retention.", supersededBy: "privacy-rule-revision-v2", supersededAt: date(-40), importance: 1 },
    { verifiedDays: -40, content: "Intelligence memory privacy rule removes direct identifiers but can keep raw payloads.", supersededBy: "privacy-rule-revision-v3", supersededAt: date(-1) },
    { verifiedDays: -1, content: "Current intelligence memory privacy rule excludes customer-private content, identifiers, raw payloads and raw reasoning from reusable platform knowledge." },
  ] }),

  evolution({ id: "forgotten-bad-lesson", category: "forgetting", query: "How should webhook retries be controlled?", domain: "integrations", sessionCount: 4, expectedIndex: 1, flags: { cross_session: true }, states: [
    { verifiedDays: -10, content: "Webhook retries should be unlimited and immediate.", forgottenAt: date(-5), importance: 1 },
    { verifiedDays: -2, content: "Webhook retries require bounded retry policy, idempotency, failure observability and traceable event identifiers." },
  ] }),
  evolution({ id: "forgotten-finance-lesson", category: "forgetting", query: "How should journals be posted?", domain: "finance", sessionCount: 5, expectedIndex: 1, flags: { retention: true }, states: [
    { verifiedDays: -40, content: "Journal postings can ignore period state.", forgottenAt: date(-20), importance: 1 },
    { verifiedDays: -5, content: "General ledger journal postings require balanced entries, valid open period, authority and audit evidence." },
  ] }),
  evolution({ id: "forgotten-access-lesson", category: "forgetting", query: "How should role permission changes be handled?", domain: "integrations", sessionCount: 5, expectedIndex: 1, states: [
    { verifiedDays: -25, content: "Permission changes can be self-approved by the requesting user.", forgottenAt: date(-8), importance: 1 },
    { verifiedDays: -4, content: "Authorization permission changes require independent approval authority and auditable access-control evidence." },
  ] }),

  evolution({ id: "expired-api", category: "expiry", query: "What is the current integration observability requirement?", domain: "integrations", sessionCount: 4, expectedIndex: 1, flags: { premise_awareness: true }, states: [
    { verifiedDays: -50, validDays: -1, content: "Integration observability only requires request logs.", importance: 1 },
    { verifiedDays: -1, content: "Current integration observability requires traces, structured errors, delivery status and auditable correlation identifiers." },
  ] }),
  evolution({ id: "expired-regulation", category: "expiry", query: "What is the current regulatory filing rule?", domain: "finance", sessionCount: 4, expectedIndex: 1, flags: { premise_awareness: true }, states: [
    { verifiedDays: -200, validDays: -10, content: "Regulatory filing rule allows historical evidence without revalidation.", importance: 1 },
    { verifiedDays: -1, content: "Current regulatory filing rules must be verified against authoritative current evidence before submission." },
  ] }),
  evolution({ id: "expired-ai-standard", category: "expiry", query: "What is the current AI memory release standard?", sessionCount: 5, expectedIndex: 1, flags: { premise_awareness: true }, states: [
    { verifiedDays: -100, validDays: -1, content: "AI memory release standard allows automatic promotion after one observation.", importance: 1 },
    { verifiedDays: -1, content: "Current AI memory release standard requires verified evidence, governance, explicit release and no automatic model promotion." },
  ] }),

  evolution({ id: "stable-journal-retention", category: "retention", query: "What journal control did we retain across sessions?", domain: "finance", sessionCount: 7, expectedIndex: 0, flags: { retention: true, cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -120, content: "Journal entries require balanced debits and credits, posting authority and audit evidence.", validDays: 365 },
  ] }),
  evolution({ id: "stable-project-retention", category: "retention", query: "What project milestone lesson remains valid?", domain: "projects", sessionCount: 8, expectedIndex: 0, flags: { retention: true, cross_session: true }, states: [
    { verifiedDays: -180, content: "Project milestones require owner, due date, dependency closure and acceptance evidence.", validDays: 500 },
  ] }),
  evolution({ id: "stable-leave-retention", category: "retention", query: "What staff leave control remains valid?", domain: "people", sessionCount: 6, expectedIndex: 0, flags: { retention: true }, states: [
    { verifiedDays: -100, content: "Employee leave requests require entitlement validation, approval, dates and workforce availability controls.", validDays: 500 },
  ] }),
  evolution({ id: "stable-inventory-retention", category: "retention", query: "What inventory movement control remains valid?", domain: "supply-chain", sessionCount: 7, expectedIndex: 0, flags: { retention: true, compaction_restart: true }, states: [
    { verifiedDays: -150, content: "Inventory movements require traceable source document, quantity, location and audit history.", validDays: 500 },
  ] }),

  evolution({ id: "restart-current-state", category: "compaction-restart", query: "After restart, what is the current approval authority rule?", domain: "finance", sessionCount: 9, expectedIndex: 2, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -100, content: "Approval authority rule allows all finance users to approve.", supersededBy: "restart-current-state-v2", supersededAt: date(-40), importance: 1 },
    { verifiedDays: -40, content: "Approval authority rule requires a manager.", supersededBy: "restart-current-state-v3", supersededAt: date(-2) },
    { verifiedDays: -2, content: "Current approval authority rule requires role-based independent authority and evidence of the approver decision." },
  ] }),
  evolution({ id: "restart-api-state", category: "compaction-restart", query: "After memory compaction, what API versioning rule is current?", domain: "integrations", sessionCount: 10, expectedIndex: 2, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -100, content: "API versioning rule allows silent breaking changes.", supersededBy: "restart-api-state-v2", supersededAt: date(-30), importance: 1 },
    { verifiedDays: -30, content: "API versioning rule requires version labels.", supersededBy: "restart-api-state-v3", supersededAt: date(-1) },
    { verifiedDays: -1, content: "Current API versioning rule requires explicit contracts, backward-compatibility governance and migration evidence for breaking changes." },
  ] }),
  evolution({ id: "restart-memory-state", category: "compaction-restart", query: "After restart, what reusable memory rule is current?", sessionCount: 9, expectedIndex: 1, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -30, content: "Reusable memory can include unverified observations.", supersededBy: "restart-memory-state-v2", supersededAt: date(-1), importance: 1 },
    { verifiedDays: -1, content: "Current reusable memory requires supported evidence, confidence, freshness, provenance and explicit lifecycle governance." },
  ] }),

  evolution({ id: "premise-latest-price", category: "premise-awareness", query: "What is the latest pricing policy requirement?", domain: "commercial", sessionCount: 5, expectedIndex: 1, flags: { premise_awareness: true }, states: [
    { verifiedDays: -20, content: "Pricing policy requirement is fixed indefinitely.", supersededBy: "premise-latest-price-v2", supersededAt: date(-1), importance: 1 },
    { verifiedDays: -1, content: "Latest pricing policy requires current effective dates, approval evidence and explicit applicability before reuse." },
  ] }),
  evolution({ id: "premise-current-law", category: "premise-awareness", query: "What is the current legal compliance requirement?", domain: "compliance", sessionCount: 5, expectedIndex: 1, flags: { premise_awareness: true }, states: [
    { verifiedDays: -60, validDays: -1, content: "Legal compliance requirement can rely on old rules.", importance: 1 },
    { verifiedDays: -1, content: "Current legal compliance requirements require authoritative current evidence and jurisdiction-aware verification." },
  ] }),
  evolution({ id: "premise-current-model", category: "premise-awareness", query: "What is the current model promotion requirement?", sessionCount: 6, expectedIndex: 1, flags: { premise_awareness: true }, states: [
    { verifiedDays: -40, content: "Model promotion requires only one benchmark pass.", supersededBy: "premise-current-model-v2", supersededAt: date(-1), importance: 1 },
    { verifiedDays: -1, content: "Current model promotion requires independent certification, regression safety, governance and no automatic routing change." },
  ] }),

  evolution({ id: "workflow-ap", category: "workflow-experience", query: "What workflow should accounts payable follow before payment release?", domain: "finance", sessionCount: 6, expectedIndex: 1, flags: { cross_session: true, retention: true }, states: [
    { verifiedDays: -60, content: "Accounts payable workflow is capture then pay.", supersededBy: "workflow-ap-v2", supersededAt: date(-10), importance: 1 },
    { verifiedDays: -10, content: "Accounts payable workflow is capture, validate supplier bill, approve, post, schedule payment, release with authority, reconcile and preserve audit evidence." },
  ] }),
  evolution({ id: "workflow-research", category: "workflow-experience", query: "What workflow should contradictory research evidence follow?", sessionCount: 7, expectedIndex: 1, flags: { cross_session: true }, states: [
    { verifiedDays: -50, content: "Research workflow should average contradictory sources into one answer.", forgottenAt: date(-20), importance: 1 },
    { verifiedDays: -5, content: "Research workflow should preserve contradictory evidence explicitly, inspect provenance, reduce confidence, seek independent verification and block premature promotion." },
  ] }),
  evolution({ id: "workflow-project", category: "workflow-experience", query: "What workflow should a project deliverable follow?", domain: "projects", sessionCount: 6, expectedIndex: 0, flags: { retention: true }, states: [
    { verifiedDays: -80, content: "Project deliverable workflow requires owner, dependencies, execution, review, acceptance evidence and closure.", validDays: 400 },
  ] }),

  evolution({ id: "multi-revision-access", category: "multi-revision", query: "What is the current access-control policy?", domain: "integrations", sessionCount: 12, expectedIndex: 3, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -120, content: "Access control policy permits shared administrator accounts.", supersededBy: "multi-revision-access-v2", supersededAt: date(-80), importance: 1 },
    { verifiedDays: -80, content: "Access control policy requires named administrator accounts.", supersededBy: "multi-revision-access-v3", supersededAt: date(-30) },
    { verifiedDays: -30, content: "Access control policy requires roles and named accounts.", supersededBy: "multi-revision-access-v4", supersededAt: date(-1) },
    { verifiedDays: -1, content: "Current access-control policy requires named identities, least privilege, role governance, independent approval for sensitive changes and audit evidence." },
  ] }),
  evolution({ id: "multi-revision-inventory", category: "multi-revision", query: "What is the current inventory count policy?", domain: "supply-chain", sessionCount: 11, expectedIndex: 3, flags: { cross_session: true }, states: [
    { verifiedDays: -150, content: "Inventory count policy is annual only.", supersededBy: "multi-revision-inventory-v2", supersededAt: date(-90), importance: 1 },
    { verifiedDays: -90, content: "Inventory count policy is quarterly.", supersededBy: "multi-revision-inventory-v3", supersededAt: date(-40) },
    { verifiedDays: -40, content: "Inventory count policy combines quarterly and spot checks.", supersededBy: "multi-revision-inventory-v4", supersededAt: date(-2) },
    { verifiedDays: -2, content: "Current inventory count policy uses risk-based cycle counts, variance investigation, approval and traceable adjustment evidence." },
  ] }),
  evolution({ id: "multi-revision-memory", category: "multi-revision", query: "What is the current knowledge confidence policy?", sessionCount: 11, expectedIndex: 3, flags: { cross_session: true, compaction_restart: true }, states: [
    { verifiedDays: -100, content: "Knowledge confidence policy uses a fixed confidence of one.", supersededBy: "multi-revision-memory-v2", supersededAt: date(-70), importance: 1 },
    { verifiedDays: -70, content: "Knowledge confidence policy uses source count only.", supersededBy: "multi-revision-memory-v3", supersededAt: date(-30) },
    { verifiedDays: -30, content: "Knowledge confidence policy uses source quality and count.", supersededBy: "multi-revision-memory-v4", supersededAt: date(-1) },
    { verifiedDays: -1, content: "Current knowledge confidence policy combines evidence quality, provenance, contradiction state, freshness and verified outcomes without treating confidence as authorization." },
  ] }),

  evolution({ id: "distractor-old-strong", category: "distractor-resilience", query: "What is the current webhook delivery rule?", domain: "integrations", sessionCount: 5, expectedIndex: 1, flags: { cross_session: true }, states: [
    { verifiedDays: -40, content: "Webhook delivery rule requires immediate infinite retries, webhook callback event delivery webhook webhook.", supersededBy: "distractor-old-strong-v2", supersededAt: date(-2), importance: 1, confidence: 1 },
    { verifiedDays: -2, content: "Current webhook delivery rule requires authenticated callbacks, idempotency, bounded retries, observability and traceable event identifiers." },
  ] }),
  evolution({ id: "distractor-old-finance", category: "distractor-resilience", query: "What is the current cash payment approval rule?", domain: "finance", sessionCount: 5, expectedIndex: 1, states: [
    { verifiedDays: -50, content: "Cash payment approval rule cash payment approval payment cash approval allows self approval.", forgottenAt: date(-10), importance: 1, confidence: 1 },
    { verifiedDays: -4, content: "Current cash payment approval requires available liquidity, independent authority, payment evidence and reconciliation." },
  ] }),
  evolution({ id: "distractor-expired-ai", category: "distractor-resilience", query: "What is the current AI research evidence rule?", sessionCount: 6, expectedIndex: 1, states: [
    { verifiedDays: -100, validDays: -1, content: "AI research evidence rule research evidence AI research evidence accepts one source.", importance: 1, confidence: 1 },
    { verifiedDays: -1, content: "Current AI research evidence rule requires source diversity, provenance, contradiction handling and sufficient verified evidence before promotion." },
  ] }),

  evolution({ id: "cross-domain-finance", category: "cross-session-transfer", query: "Which retained principle applies when releasing a supplier payment?", domain: "finance", sessionCount: 8, expectedIndex: 0, flags: { cross_session: true, retention: true }, states: [
    { verifiedDays: -100, content: "Sensitive financial release actions require independent authorization, verified evidence and auditable execution state.", validDays: 500, aliases: ["supplier payment release"] },
  ] }),
  evolution({ id: "cross-domain-security", category: "cross-session-transfer", query: "Which retained principle applies when changing a privileged role?", domain: "integrations", sessionCount: 8, expectedIndex: 0, flags: { cross_session: true, retention: true }, states: [
    { verifiedDays: -100, content: "Sensitive privileged changes require independent authorization, least privilege and auditable execution evidence.", validDays: 500, aliases: ["privileged role change"] },
  ] }),
  evolution({ id: "cross-domain-research", category: "cross-session-transfer", query: "Which retained principle applies before promoting conflicting research into memory?", sessionCount: 8, expectedIndex: 0, flags: { cross_session: true, retention: true }, states: [
    { verifiedDays: -100, content: "Conflicting research evidence must remain explicit and block durable knowledge promotion until independently resolved or bounded.", validDays: 500 },
  ] }),
];

const result = evaluateAvantiqoLongHorizonMemoryCertification({
  cases,
  runCase: (benchmarkCase) => {
    const ranked = rankAvantiqoKnowledgeRows({
      rows: benchmarkCase.rows,
      query: benchmarkCase.query,
      domain: benchmarkCase.domain || null,
      jurisdiction: benchmarkCase.jurisdiction || null,
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

console.log("AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_DIAGNOSTICS");
console.log(JSON.stringify({ failures: result.failures, failed_cases: result.failed_cases }, null, 2));

assert.equal(result.contract, "AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_V1");
assert.equal(result.summary.case_count, cases.length);
assert.equal(result.success, true, JSON.stringify(result.failures));
assert.equal(result.summary.superseded_leakage_count, 0);
assert.equal(result.summary.forgotten_leakage_count, 0);
assert.equal(result.summary.expired_leakage_count, 0);

console.log("AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_PASS");
console.log(JSON.stringify({
  status: result.status,
  case_count: result.summary.case_count,
  category_count: result.summary.category_count,
  maximum_session_count: result.summary.maximum_session_count,
  maximum_revision_count: result.summary.maximum_revision_count,
  state_accuracy: result.summary.state_accuracy,
  cross_session_accuracy: result.summary.cross_session_accuracy,
  revision_accuracy: result.summary.revision_accuracy,
  retention_accuracy: result.summary.retention_accuracy,
  premise_awareness_accuracy: result.summary.premise_awareness_accuracy,
  compaction_restart_accuracy: result.summary.compaction_restart_accuracy,
  superseded_leakage_count: result.summary.superseded_leakage_count,
  forgotten_leakage_count: result.summary.forgotten_leakage_count,
  expired_leakage_count: result.summary.expired_leakage_count,
  maximum_context_chars: result.summary.maximum_context_chars,
  provider_execution_used: result.governance.external_provider_required,
  gpu_execution_used: result.governance.gpu_required,
  wallet_effect: result.governance.wallet_effect,
}, null, 2));
