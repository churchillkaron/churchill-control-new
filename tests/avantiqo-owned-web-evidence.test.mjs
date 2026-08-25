import test from "node:test";
import assert from "node:assert/strict";

import {
  collectAvantiqoOwnedWebEvidence,
  listAvantiqoOwnedResearchSources,
} from "../lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime.js";

test("registers at least two owned primary sources for every continuous-learning domain", () => {
  for (const domain of [
    "finance",
    "product-design",
    "supply-chain",
    "commercial",
    "people",
    "projects",
    "integrations",
    "intelligence",
  ]) {
    const registered = listAvantiqoOwnedResearchSources({ domain });
    assert.equal(registered.domain, domain);
    assert.ok(registered.sources.length >= 2, domain);
    assert.ok(registered.sources.every((source) => source.official && source.primary));
  }
});

test("collects public evidence without an external intelligence provider", async () => {
  const calls = [];
  const result = await collectAvantiqoOwnedWebEvidence({
    context: { organizationId: "platform-org" },
    payload: {
      query: "What should an invoice contain?",
      domain: "finance",
      minimum_sources: 2,
      max_sources: 2,
    },
    sourceReader: async ({ payload }) => {
      calls.push(payload);
      return {
        source_url: payload.url,
        final_url: payload.url,
        title: "Official source",
        content: "Authoritative public evidence for the requested enterprise domain.",
        retrieved_at: "2026-08-25T00:00:00.000Z",
        content_hash_sha256: "hash",
      };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "OWNED_PUBLIC_EVIDENCE_COLLECTED");
  assert.equal(result.sources.length, 2);
  assert.equal(result.evidence.provider, "avantiqo-owned-source-reader");
  assert.equal(result.evidence.external_intelligence_provider_used, false);
  assert.equal(result.evidence.openai_used, false);
  assert.equal(result.governance.owned_intelligence_only, true);
  assert.equal(result.governance.external_intelligence_provider_allowed, false);
});

test("fails closed when no owned source registry covers the question", async () => {
  await assert.rejects(
    () => collectAvantiqoOwnedWebEvidence({
      context: { organizationId: "platform-org" },
      payload: {
        query: "A topic outside the governed source registry",
        minimum_sources: 2,
      },
      sourceReader: async () => {
        throw new Error("must not be called");
      },
    }),
    /AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_REGISTRY_INSUFFICIENT/,
  );
});
