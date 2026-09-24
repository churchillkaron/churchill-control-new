import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { normalizeAndValidateResearch } = await import("../lib/creative/research/runtime/ResearchEvidenceContractRuntime.js");

test("duplicate research URLs preserve source-id aliases for strategic evidence validation", () => {
  const report = normalizeAndValidateResearch({
    result: {
      summary: "Duplicate source ids can point at the same governed source without invalidating evidence.",
      company_resolution: {
        status: "RESOLVED",
        canonical_name: "Avantiqo Platform",
      },
      strategic_synthesis: {
        strategic_problem: {
          statement: "Preserve governed evidence identity after source URL deduplication.",
          creative_consequence: "Strategic evidence remains bound to the real source.",
          misuse_risk: "Dropping an equivalent source id can create a false invalid-source failure.",
          confidence: 100,
          source_ids: ["source-2"],
        },
        strategic_opportunity: {
          statement: "Treat duplicate ids for one canonical URL as validation aliases.",
          creative_consequence: "The validator remains strict while avoiding false negatives.",
          misuse_risk: "Aliases must not increase source counts.",
          confidence: 100,
          source_ids: ["source-1"],
        },
        creative_mandate: {
          statement: "Keep one public source row while retaining duplicate ids only for validation.",
          creative_consequence: "Research output remains deduplicated.",
          misuse_risk: "Returning alias rows would inflate evidence counts.",
          confidence: 100,
          source_ids: ["source-2"],
        },
        human_truths: [{
          statement: "Equivalent ids can reference the same canonical source.",
          creative_consequence: "Evidence remains traceable.",
          misuse_risk: "Identity must still resolve to a governed URL.",
          confidence: 100,
          source_ids: ["source-2"],
        }],
        category_conventions: [{
          statement: "Evidence validation must be URL-aware when source ids are duplicated.",
          creative_consequence: "Model renumbering does not create false failures.",
          misuse_risk: "Only ids for the same canonical source may alias.",
          confidence: 100,
          source_ids: ["source-2"],
        }],
        breakable_conventions: [],
        competitor_patterns: [],
        distinctive_brand_assets: [],
        cultural_context: [],
        attention_opportunities: [],
        contradictions: [],
        must_not_do: ["Do not count aliases as additional sources."],
      },
      creative_grounding: {
        mode: "NONE",
        truth_sensitivity: "LOW",
        reasoning: "No real-world grounding is required for this contract test.",
        entities: [],
        evidence_targets: [],
        reference_candidates: [],
        continuity_constraints: [],
      },
      sources: [
        {
          id: "source-1",
          title: "Avantiqo",
          url: "https://avantiqo.ai/",
          source_type: "official_website",
          official: true,
          primary: true,
        },
        {
          id: "source-2",
          title: "Avantiqo duplicate citation id",
          url: "https://avantiqo.ai/",
          source_type: "public_web_source",
        },
      ],
      claims: [],
      audience: {},
      market: {},
      confidence: { overall: 100 },
    },
    policy: {
      version: "test",
      mode: "EXTERNAL_COMPANY_MARKET",
      max_age_days: 30,
      minimum_external_sources: 1,
      minimum_primary_sources: 1,
      minimum_verified_claims: 0,
      minimum_confidence: 0,
      require_company_resolution: false,
      require_competitor_analysis: false,
      require_audience_evidence: false,
      require_market_context: false,
      require_reference_candidates: false,
      require_strategic_evidence: true,
      require_grounding_evidence: false,
    },
    context_identity: "duplicate-source-alias-test",
    researched_at: "2026-09-19T00:00:00.000Z",
  });

  assert.equal(report.validation.passed, true);
  assert.deepEqual(report.validation.strategic_synthesis_invalid_source_ids, []);
  assert.equal(report.sources.length, 1);
  assert.equal(report.sources[0].id, "source-1");
  assert.equal(Object.hasOwn(report.sources[0], "_alias_ids"), false);
});
