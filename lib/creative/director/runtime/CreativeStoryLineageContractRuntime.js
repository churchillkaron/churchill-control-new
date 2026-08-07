import crypto from "node:crypto";

const CONTRACT = "CREATIVE_STORY_LINEAGE_CONTRACT_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map(text).filter(Boolean))];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function withoutLineage(plan = {}) {
  const source = object(plan);
  const metadata = object(source.metadata);
  const { story_lineage: ignoredMetadataLineage, ...metadataWithoutLineage } = metadata;
  const { story_lineage: ignoredRootLineage, ...planWithoutRootLineage } = source;
  return {
    ...planWithoutRootLineage,
    metadata: metadataWithoutLineage,
  };
}

function researchEvidence(research = {}) {
  const metadata = object(research.metadata);
  const claims = list(metadata.claims).filter((claim) => claim?.verified === true);
  const sources = list(metadata.sources);
  const claimIds = unique(claims.map((claim) =>
    claim?.id || claim?.claim_id || claim?.evidence_id,
  ));
  const sourceIds = unique(sources.map((source) =>
    source?.id || source?.source_id || source?.url,
  ));
  return {
    claim_ids: claimIds,
    source_ids: sourceIds,
    evidence_ids: unique([claimIds, sourceIds]),
  };
}

function researchAuthority(research = {}) {
  const metadata = object(research.metadata);
  const validation = object(metadata.validation);
  if (validation.passed !== true) {
    throw new Error("CREATIVE_STORY_LINEAGE_RESEARCH_VALIDATION_REQUIRED");
  }

  const researchIdentity = text(metadata.research_identity);
  if (!researchIdentity) {
    throw new Error("CREATIVE_STORY_LINEAGE_RESEARCH_IDENTITY_REQUIRED");
  }

  const companyResolution = object(metadata.company_resolution);
  const industry = text(companyResolution.industry || metadata.industry);
  if (!industry) {
    throw new Error("CREATIVE_STORY_LINEAGE_INDUSTRY_CONTEXT_REQUIRED");
  }

  const businessContext = {
    research_report_id: research.id || null,
    company_resolution: companyResolution,
    company_truth: object(metadata.company_truth),
    brand_intelligence: object(metadata.brand_intelligence),
    audience: object(research.audience),
    competitor_analysis: object(metadata.competitor_analysis),
    market: object(metadata.market),
    commercial_intelligence: object(metadata.commercial_intelligence),
    messaging: object(research.messaging),
  };

  return {
    research_report_id: research.id || null,
    research_identity: researchIdentity,
    industry,
    business_context_hash: digest(businessContext),
    industry_context_hash: digest({ industry }),
    evidence: researchEvidence(research),
    validation_passed: true,
  };
}

export function inspectCreativeStoryResearchAuthority(research = {}) {
  return researchAuthority(research);
}

function attachEvidence(plan = {}, evidence = {}) {
  const story = object(plan.story);
  const architecture = object(plan.story_architecture);
  const authority = Object.keys(story).length
    ? "story"
    : Object.keys(architecture).length
      ? "story_architecture"
      : null;

  if (!authority) {
    throw new Error("CREATIVE_STORY_LINEAGE_CANONICAL_STORY_REQUIRED");
  }

  const source = authority === "story" ? story : architecture;
  const enriched = {
    ...source,
    research_claims: unique([
      source.research_claims,
      source.claim_ids,
      evidence.claim_ids,
    ]),
    source_ids: unique([
      source.source_ids,
      source.research_source_ids,
      evidence.source_ids,
    ]),
    evidence_ids: unique([
      source.evidence_ids,
      evidence.evidence_ids,
    ]),
  };

  return {
    plan: {
      ...plan,
      [authority]: enriched,
    },
    authority,
    story: enriched,
  };
}

function selectedConceptHash(plan = {}) {
  return text(
    plan.concept_council?.concept_hash ||
    plan.production?.selected_concept_hash,
  ) || digest(object(plan.concept));
}

function conceptCouncilHash(plan = {}) {
  return text(
    plan.concept_council?.council_hash ||
    plan.production?.concept_council_hash,
  ) || null;
}

export function buildCreativeStoryLineageContract({
  plan = {},
  research = {},
} = {}) {
  const authority = researchAuthority(research);
  const evidenced = attachEvidence(object(plan), authority.evidence);
  const basePlan = withoutLineage(evidenced.plan);
  const selectedHash = selectedConceptHash(basePlan);
  const councilHash = conceptCouncilHash(basePlan);
  const storyContractHash = digest({
    research_identity: authority.research_identity,
    business_context_hash: authority.business_context_hash,
    industry_context_hash: authority.industry_context_hash,
    selected_concept_hash: selectedHash,
    concept_council_hash: councilHash,
    story_authority: evidenced.authority,
    story: evidenced.story,
  });
  const masterPlanHash = digest(basePlan);

  const lineage = {
    contract: CONTRACT,
    research_report_id: research.id || null,
    research_identity: authority.research_identity,
    industry: authority.industry,
    business_context_hash: authority.business_context_hash,
    industry_context_hash: authority.industry_context_hash,
    selected_concept_hash: selectedHash,
    concept_council_hash: councilHash,
    story_contract_hash: storyContractHash,
    master_plan_hash: masterPlanHash,
    approval_plan_hash: masterPlanHash,
    approval_hash_basis: "MASTER_PLAN_HASH",
    story_authority: evidenced.authority === "story"
      ? "plan.story"
      : "plan.story_architecture",
    research_claim_ids: authority.evidence.claim_ids,
    research_source_ids: authority.evidence.source_ids,
    evidence_ids: authority.evidence.evidence_ids,
    immutable: true,
  };

  return {
    contract: CONTRACT,
    lineage,
    plan: {
      ...evidenced.plan,
      story_lineage: lineage,
      metadata: {
        ...object(evidenced.plan.metadata),
        story_lineage: lineage,
      },
    },
  };
}

export function validateCreativeStoryLineageContract(plan = {}) {
  const lineage = object(plan.story_lineage || plan.metadata?.story_lineage);
  const required = [
    "research_identity",
    "business_context_hash",
    "industry_context_hash",
    "selected_concept_hash",
    "story_contract_hash",
    "master_plan_hash",
    "approval_plan_hash",
  ];
  const missing = required.filter((key) => !text(lineage[key]));
  const story = object(
    lineage.story_authority === "plan.story_architecture"
      ? plan.story_architecture
      : plan.story,
  );
  const evidenceIds = unique([
    story.evidence_ids,
    story.source_ids,
    story.research_claims,
  ]);

  return {
    contract: CONTRACT,
    passed:
      lineage.contract === CONTRACT &&
      lineage.immutable === true &&
      missing.length === 0 &&
      evidenceIds.length > 0,
    missing_fields: missing,
    story_evidence_reference_count: evidenceIds.length,
    story_contract_hash: lineage.story_contract_hash || null,
    master_plan_hash: lineage.master_plan_hash || null,
  };
}

export function assertCreativeStoryLineageContract(plan = {}) {
  const validation = validateCreativeStoryLineageContract(plan);
  if (!validation.passed) {
    const error = new Error(
      `CREATIVE_STORY_LINEAGE_CONTRACT_INVALID:${validation.missing_fields.join(",") || "STORY_EVIDENCE_REQUIRED"}`,
    );
    error.validation = validation;
    throw error;
  }
  return validation;
}

export const CreativeStoryLineageContractRuntime = Object.freeze({
  contract: CONTRACT,
  inspectResearch: inspectCreativeStoryResearchAuthority,
  build: buildCreativeStoryLineageContract,
  validate: validateCreativeStoryLineageContract,
  assert: assertCreativeStoryLineageContract,
});
