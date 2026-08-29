import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ROUTER_PATH =
  "lib/intelligence/runtime/AvantiqoKnowledgeRouterRuntime.js";

function functionSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("reusable knowledge evaluation is read-only and cannot fall through to web research", async () => {
  const source = await readFile(ROUTER_PATH, "utf8");
  const evaluation = functionSlice(
    source,
    "export async function evaluateAvantiqoReusableKnowledge",
    "export async function runAvantiqoKnowledgeAwareResearch",
  );

  assert.match(evaluation, /const organizationId = learningOrganizationId\(\)/);
  assert.match(evaluation, /recallCanonicalProductKnowledge/);
  assert.match(evaluation, /recallAvantiqoHybridKnowledge/);
  assert.match(evaluation, /NO_RELEVANT_VERIFIED_KNOWLEDGE/);
  assert.match(evaluation, /web_research_fallback_performed: false/);
  assert.match(evaluation, /internet_search_performed: false/);
  assert.match(evaluation, /external_intelligence_provider_used: false/);
  assert.match(evaluation, /database_write_performed: false/);
  assert.match(evaluation, /knowledge_promotion_performed: false/);
  assert.match(evaluation, /customer_organization_used_for_platform_knowledge: false/);
  assert.match(evaluation, /customer_private_memory_reused: false/);

  assert.equal(evaluation.includes("runKnowledgeAwareWebResearch("), false);
  assert.equal(evaluation.includes("context.organizationId"), false);
  assert.equal(evaluation.includes("context.organization_id"), false);
  assert.equal(evaluation.includes(".insert("), false);
  assert.equal(evaluation.includes(".upsert("), false);
  assert.equal(evaluation.includes(".update("), false);
  assert.equal(evaluation.includes(".delete("), false);
});

test("Knowledge Router exposes reuse evaluation separately from research", async () => {
  const source = await readFile(ROUTER_PATH, "utf8");
  assert.match(
    source,
    /AVANTIQO_REUSABLE_KNOWLEDGE_EVALUATION_V1/,
  );
  assert.match(
    source,
    /evaluateReusableKnowledge: evaluateAvantiqoReusableKnowledge/,
  );
  assert.match(
    source,
    /research: runAvantiqoKnowledgeAwareResearch/,
  );
});
