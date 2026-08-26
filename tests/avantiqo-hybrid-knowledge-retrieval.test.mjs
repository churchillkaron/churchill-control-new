import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  rankAvantiqoKnowledgeRows,
} from "../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js";

function row({
  id,
  content,
  domain,
  confidence = 0.9,
  importance = 0.8,
  sources = [],
  verifiedAt = new Date().toISOString(),
} = {}) {
  return {
    id,
    memory_type: "lesson",
    subject: `knowledge:${id}`,
    content,
    importance,
    confidence,
    source: "verified_continuous_owned_web_evidence",
    active: true,
    valid_until: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      knowledge_domain: domain,
      topic_key: id,
      verified_at: verifiedAt,
      sources,
      evidence_status: "SUPPORTED",
    },
    updated_at: verifiedAt,
    created_at: verifiedAt,
  };
}

const officialSource = [{
  id: "source-1",
  url: "https://example.gov/standard",
  title: "Official standard",
  publisher: "Example Government",
  official: true,
  primary: true,
}];

test("supplier wording semantically retrieves vendor knowledge", () => {
  const result = rankAvantiqoKnowledgeRows({
    query: "What information should we keep for suppliers and supplier bills?",
    rows: [
      row({
        id: "vendor-management",
        domain: "supply-chain",
        content: "Vendor master records and vendor bills require controlled lifecycle, validation, approvals and audit evidence.",
        sources: officialSource,
      }),
      row({
        id: "project-milestones",
        domain: "projects",
        content: "Project milestones track delivery checkpoints and dependencies.",
        sources: officialSource,
      }),
    ],
  });

  assert.equal(result.ranked[0]?.row.id, "vendor-management");
  assert.ok(result.ranked[0]?.signals.concepts > 0);
  assert.ok(result.query_concepts.includes("supplier_vendor"));
});

test("receivables wording bridges to accounts receivable knowledge", () => {
  const result = rankAvantiqoKnowledgeRows({
    query: "How should we manage customer receivables and overdue balances?",
    rows: [
      row({
        id: "ar-core",
        domain: "finance",
        content: "Accounts receivable should track customer invoices, debtor balances, settlement state and collection evidence.",
        sources: officialSource,
      }),
    ],
  });

  assert.equal(result.ranked[0]?.row.id, "ar-core");
  assert.ok(result.query_concepts.includes("accounts_receivable"));
  assert.ok(result.ranked[0]?.signals.concepts >= 0.5);
});

test("stock wording bridges to inventory knowledge", () => {
  const result = rankAvantiqoKnowledgeRows({
    query: "What controls do we need for stock on hand and warehouse movements?",
    rows: [
      row({
        id: "inventory-core",
        domain: "supply-chain",
        content: "Inventory balances and warehouse movements require traceable documents, locations, quantities and audit history.",
        sources: officialSource,
      }),
    ],
  });

  assert.equal(result.ranked[0]?.row.id, "inventory-core");
  assert.ok(result.query_concepts.includes("inventory"));
  assert.ok(result.query_concepts.includes("warehouse"));
});

test("current questions reject stale knowledge during ranking", () => {
  const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = rankAvantiqoKnowledgeRows({
    query: "What is the current API standard requirement?",
    rows: [
      row({
        id: "old-api-standard",
        domain: "integrations",
        content: "API integration standards require documented endpoints and error contracts.",
        sources: officialSource,
        verifiedAt: stale,
      }),
    ],
  });

  assert.equal(result.ranked.length, 0);
  assert.equal(result.current_question, true);
});

test("low-confidence knowledge cannot become a retrieval result", () => {
  const result = rankAvantiqoKnowledgeRows({
    query: "How should vendor bills be approved?",
    rows: [
      row({
        id: "weak-vendor-bill",
        domain: "finance",
        confidence: 0.42,
        content: "Vendor bills use approval controls.",
        sources: officialSource,
      }),
    ],
  });

  assert.equal(result.ranked.length, 0);
});

test("hybrid retrieval has no external embedding or intelligence dependency", () => {
  const source = fs.readFileSync(
    new URL("../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js", import.meta.url),
    "utf8",
  );
  const router = fs.readFileSync(
    new URL("../lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js", import.meta.url),
    "utf8",
  );
  const index = fs.readFileSync(
    new URL("../lib/intelligence/index.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /AVANTIQO_HYBRID_KNOWLEDGE_RETRIEVAL_V1/);
  assert.match(source, /external_embedding_provider_used: false/);
  assert.match(source, /external_intelligence_provider_used: false/);
  assert.match(source, /inspectAvantiqoEvidenceGraph/);
  assert.match(router, /AVANTIQO_KNOWLEDGE_ROUTER_V3/);
  assert.match(router, /recallAvantiqoHybridKnowledge/);
  assert.match(router, /HYBRID_VERIFIED_KNOWLEDGE_REUSED/);
  assert.match(index, /AvantiqoHybridKnowledgeRetrievalRuntime/);
});
