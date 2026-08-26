import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const hybrid = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js", import.meta.url),
  "utf8",
);
const router = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js", import.meta.url),
  "utf8",
);
const release = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js", import.meta.url),
  "utf8",
);
const lifecycle = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoReleasedKnowledgeLifecycleRuntime.js", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../app/api/internal/intelligence/continuous-learning/process/route.js", import.meta.url),
  "utf8",
);

test("general learned knowledge recall accepts only explicit final releases", () => {
  assert.match(hybrid, /FINAL_RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release"/);
  assert.match(hybrid, /\.eq\("source", FINAL_RELEASE_SOURCE\)/);
  assert.match(hybrid, /explicit_final_release_required_for_general_knowledge_reuse: true/);
  assert.match(hybrid, /legacy_pre_epistemic_platform_knowledge_reused: false/);
});

test("expired released knowledge cannot remain live merely because it is active", () => {
  assert.match(hybrid, /validUntil <= nowMs/);
  assert.match(hybrid, /expired_valid_until_blocks_reuse: true/);
});

test("legacy fallback cannot reuse pre-epistemic platform knowledge", () => {
  assert.match(router, /const forceRefresh = true;/);
  assert.match(router, /force_refresh: true/);
  assert.match(router, /hybrid_is_only_general_learned_knowledge_reuse_authority: true/);
  assert.match(router, /legacy_fallback_knowledge_reuse_allowed: false/);
  assert.match(router, /fallback_fresh_research_required: true/);
});

test("successful explicit-release revalidation renews bounded validity only for the same cycle", () => {
  assert.match(lifecycle, /AVANTIQO_RELEASED_KNOWLEDGE_LIFECYCLE_V1/);
  assert.match(lifecycle, /reconcileAvantiqoReleasedKnowledgeRevalidation/);
  assert.match(lifecycle, /revalidatedAt < startedAt/);
  assert.match(lifecycle, /release_status, 80\) !== "RELEASED_MONITORED"/);
  assert.match(lifecycle, /valid_until: validUntil/);
  assert.match(lifecycle, /ttl_renewal_requires_successful_revalidation: true/);
  assert.match(lifecycle, /quarantine_never_renews_valid_until: true/);
  assert.match(lifecycle, /automatic_unquarantine_allowed: false/);
});

test("quarantine remains fail closed and hourly lifecycle never gains release authority", () => {
  assert.match(release, /active: false,[\s\S]{0,300}forgotten_at: nowIso/);
  assert.match(release, /automatic_unquarantine_allowed: false/);
  assert.match(route, /reconcileAvantiqoReleasedKnowledgeLifecycle/);
  assert.doesNotMatch(route, /releaseAvantiqoFinalKnowledge/);
  assert.doesNotMatch(route, /AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED/);
  for (const source of [lifecycle, route]) {
    assert.doesNotMatch(source, /api\.runpod\.ai|rest\.runpod\.io/);
    assert.doesNotMatch(source, /workersMax\s*[:=]|workersMin\s*[:=]/);
  }
});
