import test from "node:test";
import assert from "node:assert/strict";

import {
  collectAvantiqoOwnedWebEvidence,
  listAvantiqoOwnedResearchSources,
} from "../lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime.js";

test("registers at least three policy-approved primary sources for every continuous-learning domain", () => {
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
    assert.ok(registered.sources.length >= 3, domain);
    assert.ok(registered.sources.every((source) => source.official && source.primary));
    assert.ok(
      registered.sources.every(
        (source) => source.evidence_use_policy === "OPEN_PUBLIC_EVIDENCE",
      ),
      domain,
    );
    assert.ok(
      registered.sources.every(({ url }) => {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname !== "iso.org" && !hostname.endsWith(".iso.org");
      }),
      domain,
    );
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

test("continues with two governed sources and reports one source failure", async () => {
  let callCount = 0;
  const result = await collectAvantiqoOwnedWebEvidence({
    context: { organizationId: "platform-org" },
    payload: {
      query: "How should projects be governed?",
      domain: "projects",
      minimum_sources: 2,
      max_sources: 3,
    },
    sourceReader: async ({ payload }) => {
      callCount += 1;
      if (callCount === 1) throw new Error("SOURCE_TEMPORARILY_UNAVAILABLE");
      return {
        source_url: payload.url,
        final_url: payload.url,
        title: "Official source",
        content: "Independent authoritative evidence for project governance.",
        retrieved_at: "2026-08-25T00:00:00.000Z",
        content_hash_sha256: "hash",
      };
    },
  });

  assert.equal(callCount, 3);
  assert.equal(result.sources.length, 2);
  assert.equal(result.evidence.failed_source_count, 1);
  assert.deepEqual(result.evidence.failed_sources, [{
    source_id: "projects-govs-002",
    error: "SOURCE_TEMPORARILY_UNAVAILABLE",
  }]);
  assert.deepEqual(result.uncertainty, [
    "projects-govs-002:SOURCE_TEMPORARILY_UNAVAILABLE",
  ]);
});

test("includes stable source diagnostics when the minimum cannot be met", async () => {
  await assert.rejects(
    () => collectAvantiqoOwnedWebEvidence({
      context: { organizationId: "platform-org" },
      payload: {
        query: "How should projects be governed?",
        domain: "projects",
        minimum_sources: 3,
        max_sources: 3,
      },
      sourceReader: async ({ payload }) => {
        if (payload.url.includes("project-delivery-functional-standard")) {
          throw new Error("SOURCE_POLICY_REJECTED");
        }
        return {
          source_url: payload.url,
          final_url: payload.url,
          title: "Official source",
          content: "Independent authoritative evidence for project governance.",
        };
      },
    }),
    /AVANTIQO_OWNED_WEB_EVIDENCE_MINIMUM_SOURCES_NOT_MET:2:3:failures=projects-govs-002=SOURCE_POLICY_REJECTED/,
  );
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
