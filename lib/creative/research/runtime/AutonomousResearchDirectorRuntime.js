import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolveActiveLegalEntitySelection } from "@/lib/platform/runtime/resolveActiveLegalEntitySelection";
import { ResearchRuntime } from "./ResearchRuntime";
import { buildResearchPlan } from "../reasoning/ResearchDirector";
import {
  normalizeAndValidateResearch,
  researchContextIdentity,
  researchReportIsReusable,
  resolveResearchPolicy,
} from "./ResearchEvidenceContractRuntime";

const RESEARCH_TRANSPORT_VERSION = "WEB_SEARCH_GROUNDED_V3";
const RESEARCH_CONTEXT_CONTRACT = "CREATIVE_RESEARCH_CONTEXT_V3";
const RESEARCH_REPORT_CONTRACT = "CREATIVE_AUTONOMOUS_RESEARCH_V3";

const NAME_STOP_WORDS = new Set([
  "and",
  "the",
  "company",
  "co",
  "limited",
  "ltd",
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "plc",
  "pte",
  "gmbh",
]);

const ADDRESS_STOP_WORDS = new Set([
  "and",
  "the",
  "road",
  "rd",
  "street",
  "st",
  "avenue",
  "ave",
  "lane",
  "ln",
  "drive",
  "dr",
  "boulevard",
  "blvd",
  "highway",
  "hwy",
  "soi",
  "moo",
  "district",
  "province",
  "county",
  "city",
  "state",
  "building",
  "floor",
  "unit",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedTokens(value, stopWords = new Set()) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .filter((item) => !/^\d+$/.test(item))
    .filter((item) => !stopWords.has(item));
}

function tokenMatch(expected, actual) {
  const expectedTokens = [...new Set(normalizedTokens(expected, NAME_STOP_WORDS))];
  const actualTokens = [...new Set(normalizedTokens(actual, NAME_STOP_WORDS))];
  if (!expectedTokens.length || !actualTokens.length) return false;
  const actualSet = new Set(actualTokens);
  const overlap = expectedTokens.filter((item) => actualSet.has(item)).length;
  const requiredOverlap = expectedTokens.length === 1
    ? 1
    : Math.min(2, expectedTokens.length);
  return (
    overlap >= requiredOverlap &&
    overlap / expectedTokens.length >= 0.5
  );
}

function addressAnchors(address) {
  const counts = new Map();
  for (const token of normalizedTokens(address, ADDRESS_STOP_WORDS)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 12)
    .map(([token]) => token);
}

function includesAnchor(value, anchors) {
  const corpus = ` ${normalizedTokens(value).join(" ")} `;
  return anchors.filter((anchor) => corpus.includes(` ${anchor} `));
}

function assetContext(asset = {}) {
  return {
    id: text(asset.id || asset.asset_id),
    name: text(asset.name || asset.title || asset.file_name),
    type: text(asset.asset_type || asset.type),
    description: text(asset.description || asset.analysis?.description),
    tags: list(asset.tags || asset.analysis?.tags),
    analysis: object(asset.analysis),
    rights: object(asset.rights || asset.metadata?.rights),
    restrictions: object(asset.restrictions || asset.metadata?.restrictions),
  };
}

async function authoritativeOrganizationIdentity({ organization_id, project = {} } = {}) {
  const metadata = object(project.metadata);
  const canonicalName = text(metadata.organization_name);
  if (!canonicalName) {
    throw new Error("CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_REQUIRED");
  }

  let legalEntity = null;
  let legalEntitySource = "UNAVAILABLE";
  try {
    const selection = await resolveActiveLegalEntitySelection({
      organizationId: organization_id,
    });
    if (selection?.entity?.id) {
      legalEntity = await resolveEntity({
        organizationId: organization_id,
        entityId: selection.entity.id,
      });
      legalEntitySource = legalEntity ? selection.source || "resolved" : "UNRESOLVED";
    }
  } catch (error) {
    legalEntitySource = `UNAVAILABLE:${text(error?.message || error)}`;
  }

  const identity = {
    organization_id,
    canonical_name: canonicalName,
    industry: text(metadata.organization_industry) || null,
    legal_entity_id: legalEntity?.id || null,
    legal_entity_name:
      text(legalEntity?.display_name || legalEntity?.legal_name) || null,
    address: text(legalEntity?.address) || null,
    country: text(legalEntity?.country).toUpperCase() || null,
    timezone: text(legalEntity?.timezone) || null,
    legal_entity_resolution: legalEntitySource,
    identity_source: {
      canonical_name: "creative_project.organization_grounding",
      industry: "creative_project.organization_grounding",
      legal_entity: legalEntity ? "platform.legal_entities" : null,
    },
  };

  return {
    ...identity,
    search_seed: [
      identity.canonical_name,
      identity.address,
      identity.country,
      identity.industry,
    ].filter(Boolean).join(" "),
  };
}

function internalContext({
  organization = {},
  mission = {},
  project = {},
  brief = {},
  assets = [],
} = {}) {
  return {
    organization,
    mission: {
      id: mission.id || null,
      title: mission.title || mission.name || null,
      objective: mission.objective || mission.business_goal || null,
      audience: mission.audience || null,
      channels: mission.channels || [],
      metadata: mission.metadata || {},
    },
    project: {
      id: project.id,
      name: project.name || project.title || null,
      objective: project.objective || null,
      production_type: project.production_type || null,
      target_duration: project.target_duration || null,
      metadata: project.metadata || {},
    },
    brief: {
      id: brief.id || null,
      title: brief.title || null,
      creative_objective: brief.creative_objective || null,
      business_goal: brief.business_goal || null,
      target_audience: brief.target_audience || null,
      requested_action: brief.requested_action || null,
      channels: brief.channels || [],
      languages: brief.languages || [],
      constraints: brief.constraints || {},
      metadata: brief.metadata || {},
    },
    assets: list(assets).map(assetContext),
  };
}

function approvedResearchExecution(project = {}) {
  const approval = object(project.metadata?.paid_research_approval);
  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const now = Date.now();
  const valid =
    approval.approved === true &&
    text(approval.provider) &&
    text(approval.pricing_id) &&
    Number(approval.maximum_customer_price) > 0 &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= now &&
    expiresAt > now &&
    (!text(approval.command_identity) ||
      text(approval.command_identity) === text(project.metadata?.command_identity));

  if (!valid) {
    throw new Error("CREATIVE_PAID_RESEARCH_APPROVAL_REQUIRED");
  }

  return approval;
}

function researchPrompt({ context, plan, policy, currentDate }) {
  return `
AUTHORITATIVE ORGANIZATION IDENTITY
${JSON.stringify(context.organization)}

The organization block above is first-party identity context and is authoritative for
which real business must be researched. The public trading/brand name can differ from
the legal-entity name. Never replace canonical_name with a different homonymous business.

FIRST RESEARCH ACTION
Use web search to resolve the exact organization. The first search must combine
canonical_name with the strongest available locality/address/country and industry clues
from search_seed. Do not use a generic name-only search when location clues are present.
If a result has the same or similar name but conflicts with the authoritative location,
country, industry or legal-entity context, reject it and continue searching. If the exact
business cannot be resolved, return AMBIGUOUS or UNRESOLVED rather than guessing.

You are Avantiqo's accountable Company and Market Research Director.
Investigate the real company, its public presence, audience, competitors, market
conditions and commercially useful creative opportunities BEFORE any story, concept or
campaign direction is created.

You MUST use the web-search tool. Do not rely on model memory for external facts.
After resolving the exact company, research its official website and official profiles,
then verified business listings, customer evidence, direct competitors and current market
context. Continue searching until every minimum in the supplied policy can be met.
Prefer official company sources, official social profiles, first-party product or service
pages, verified business listings, reputable news, credible industry sources and direct
competitor sources. Reviews and community sources may be used for customer-language
evidence but must not override official facts.

Do not invent company facts. Mark every material claim with source ids, confidence,
verification status and whether it is safe for public use. Public-use claims must be
verified by cited evidence.

Research plan:
${JSON.stringify(plan)}

Policy:
${JSON.stringify(policy)}

Current date:
${currentDate}

Internal Avantiqo context supplied by the organisation:
${JSON.stringify(context)}

Return strict JSON only using this structure:
{
  "summary": "evidence-based executive research summary",
  "company_resolution": {
    "status": "RESOLVED|AMBIGUOUS|UNRESOLVED",
    "canonical_name": "",
    "official_website": "",
    "location": "",
    "industry": "",
    "matched_internal_identity": "",
    "reasoning": ""
  },
  "company_truth": {
    "description": "",
    "products_services": [],
    "locations": [],
    "operating_facts": [],
    "verified_differentiators": [],
    "uncertainties": []
  },
  "brand_intelligence": {
    "personality": [],
    "tone_of_voice": [],
    "visual_language": [],
    "strengths": [],
    "inconsistencies": [],
    "reputation_signals": []
  },
  "audience": {
    "primary": [],
    "secondary": [],
    "motivations": [],
    "objections": [],
    "buying_triggers": [],
    "customer_language": [],
    "channel_behaviour": [],
    "evidence": ["source-id"]
  },
  "competitor_analysis": {
    "competitors": [{
      "name": "",
      "url": "",
      "positioning": "",
      "offers": [],
      "creative_patterns": [],
      "strengths": [],
      "weaknesses": [],
      "source_ids": []
    }],
    "market_gaps": [],
    "overused_category_patterns": []
  },
  "market": {
    "conditions": [],
    "seasonality": [],
    "cultural_context": [],
    "current_events": [],
    "risks": [],
    "evidence": ["source-id"]
  },
  "commercial_intelligence": {
    "business_objective": "",
    "strongest_offer": "",
    "conversion_action": "",
    "barriers": [],
    "measurable_outcomes": []
  },
  "messaging": {
    "primary": "",
    "secondary": [],
    "call_to_action": "",
    "prohibited_or_unverified_claims": []
  },
  "creative_opportunities": [{
    "title": "",
    "strategic_reason": "",
    "audience_tension": "",
    "creative_territory": "",
    "proof": [],
    "risks": [],
    "source_ids": []
  }],
  "recommendations": [],
  "trends": [],
  "keywords": [],
  "sources": [{
    "id": "stable source id",
    "title": "",
    "url": "https://...",
    "publisher": "",
    "source_type": "official_website|official_social|business_listing|news|industry|competitor|review|internal_context|other",
    "retrieved_at": "ISO timestamp",
    "published_at": "ISO timestamp or null",
    "official": false,
    "primary": false,
    "excerpt": "short evidence summary"
  }],
  "claims": [{
    "id": "stable claim id",
    "claim": "specific factual statement",
    "category": "company|brand|audience|competitor|market|commercial|creative",
    "source_ids": ["source-id"],
    "confidence": 0,
    "verification_status": "VERIFIED|UNVERIFIED|CONFLICTED",
    "verified": false,
    "public_usable": false,
    "sensitive": false,
    "expires_at": null,
    "notes": ""
  }],
  "confidence": 0
}

Mandatory rules:
- Research the exact organization identity before researching competitors.
- company_resolution.matched_internal_identity must equal organization.canonical_name.
- company_resolution.location must be consistent with the authoritative address/locality when one is supplied.
- Include at least ${policy.minimum_external_sources} distinct external sources with valid URLs.
- Include at least ${policy.minimum_primary_sources} official or primary source.
- Include at least ${policy.minimum_verified_claims} verified material claims.
- Put every source actually used into the sources array with a stable source id.
- Every verified claim must cite source ids that exist in sources.
- audience.evidence must contain valid source ids from sources.
- market.evidence must contain valid source ids from sources.
- Every competitor must include source_ids and a URL when one is available.
- Do not mark a claim public_usable unless it is verified and cited.
- Record uncertainty and source conflict explicitly.
- Recommendations must follow evidence; do not reverse-engineer evidence for a preferred idea.
- Do not create a final story, storyboard, campaign concept or shot plan. Research informs those later.
- Return one JSON object only. Do not wrap it in markdown and do not add commentary before or after it.
`;
}

function validateResolvedOrganization(validated = {}, expectedIdentity = {}) {
  const resolution = object(validated.company_resolution || validated.companyResolution);
  const expectedName = text(expectedIdentity.canonical_name);
  const resolvedName = text(resolution.canonical_name);
  const matchedInternalIdentity = text(resolution.matched_internal_identity);
  const anchors = addressAnchors(expectedIdentity.address);
  const resolvedLocation = text(resolution.location);
  const matchedLocationAnchors = anchors.length
    ? includesAnchor(resolvedLocation, anchors)
    : [];
  const requiredLocationAnchors = anchors.length
    ? Math.min(2, anchors.length)
    : 0;

  const validation = {
    contract: "CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_V3",
    expected_canonical_name: expectedName,
    resolved_canonical_name: resolvedName,
    matched_internal_identity: matchedInternalIdentity,
    expected_address: text(expectedIdentity.address) || null,
    expected_country: text(expectedIdentity.country) || null,
    resolved_location: resolvedLocation || null,
    address_anchors: anchors,
    matched_location_anchors: matchedLocationAnchors,
    required_location_anchor_count: requiredLocationAnchors,
    canonical_name_match: tokenMatch(expectedName, resolvedName),
    internal_identity_match: tokenMatch(expectedName, matchedInternalIdentity),
    location_match:
      !anchors.length || matchedLocationAnchors.length >= requiredLocationAnchors,
  };

  const blockers = [];
  if (!validation.canonical_name_match) blockers.push("COMPANY_CANONICAL_NAME_MISMATCH");
  if (!validation.internal_identity_match) blockers.push("COMPANY_INTERNAL_IDENTITY_MISMATCH");
  if (!validation.location_match) blockers.push("COMPANY_LOCATION_MISMATCH");

  if (blockers.length) {
    const error = new Error(
      `CREATIVE_RESEARCH_IDENTITY_VALIDATION_FAILED:${blockers.join(",")}`,
    );
    error.validation = {
      ...object(validated.validation),
      passed: false,
      blockers: [...list(validated.validation?.blockers), ...blockers],
      organization_identity: validation,
    };
    throw error;
  }

  return {
    ...validated,
    validation: {
      ...object(validated.validation),
      organization_identity: validation,
    },
  };
}

function reportDocument({
  validated,
  contextIdentity,
  organizationIdentity,
  policy,
  result,
  plan,
  project,
  brief,
}) {
  const competitors = list(validated.competitor_analysis?.competitors);
  return {
    organization_id: project.organization_id,
    creative_project_id: project.id,
    creative_brief_id: brief.id || null,
    summary: validated.summary,
    audience: validated.audience || {},
    competitors,
    trends: list(validated.trends),
    keywords: list(validated.keywords),
    messaging: validated.messaging || {},
    visual_direction: validated.brand_intelligence || {},
    recommendations: [
      ...list(validated.recommendations),
      ...list(validated.creative_opportunities).map((item) =>
        typeof item === "string" ? item : item.title || item.strategic_reason,
      ),
    ].filter(Boolean),
    confidence: validated.confidence,
    reasoning: {
      model: result.model || "",
      provider: result.provider || "",
      version: RESEARCH_REPORT_CONTRACT,
      usage_id: result.usage?.id || null,
      billing_id: result.billing?.id || null,
    },
    metadata: {
      contract: RESEARCH_REPORT_CONTRACT,
      research_transport_version: RESEARCH_TRANSPORT_VERSION,
      organization_identity: organizationIdentity,
      research_identity: validated.research_identity,
      context_identity: contextIdentity,
      validation: validated.validation,
      research_plan: plan,
      policy,
      company_resolution: validated.company_resolution || {},
      company_truth: validated.company_truth || {},
      brand_intelligence: validated.brand_intelligence || {},
      competitor_analysis: validated.competitor_analysis || {},
      market: validated.market || {},
      commercial_intelligence: validated.commercial_intelligence || {},
      creative_opportunities: validated.creative_opportunities || [],
      sources: validated.sources,
      claims: validated.claims,
      provider: result.provider || null,
      model: result.model || null,
      usage: result.usage || null,
      billing: result.billing || null,
      researched_at: validated.validation.researched_at,
    },
  };
}

function serviceResultFromUsage(usage = {}) {
  const providerResult = object(usage.metadata?.result);
  return {
    success: true,
    provider: usage.provider || providerResult.provider || null,
    model: usage.metadata?.model || providerResult.model || null,
    pricing: usage.metadata?.settled_pricing || null,
    reservation_pricing: usage.metadata?.reservation_pricing || null,
    usage,
    billing: {
      id: usage.billing_invoice_line_id || usage.invoice_id || null,
      usage,
    },
    output: providerResult,
  };
}

function rawResearchResult(result = {}) {
  return (
    result?.usage?.metadata?.result?.output?.raw ||
    result?.billing?.usage?.metadata?.result?.output?.raw ||
    result?.output?.output?.raw ||
    result?.output?.raw ||
    result?.raw ||
    null
  );
}

function hasWebSearchCall(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => hasWebSearchCall(item, seen));
  }
  if (text(value.type).toLowerCase() === "web_search_call") return true;
  return Object.values(value).some((item) => hasWebSearchCall(item, seen));
}

async function matchingSuccessfulUsages({
  organization_id,
  project_id,
  context_identity,
  approval_id,
}) {
  const rows = await UsageRuntime.organization(organization_id);
  return rows
    .filter((usage) => text(usage.status).toUpperCase() === "SUCCESS")
    .filter((usage) => text(usage.category).toUpperCase() === "CREATIVE_RESEARCH")
    .filter((usage) => text(usage.metadata?.creative_project_id) === text(project_id))
    .filter((usage) =>
      text(usage.metadata?.research_context_identity) === text(context_identity) ||
      (
        text(approval_id) &&
        text(usage.metadata?.research_approval_id) === text(approval_id)
      ),
    )
    .filter((usage) => Object.keys(object(usage.metadata?.result)).length > 0)
    .sort((left, right) =>
      Date.parse(right.created_at || right.updated_at || 0) -
      Date.parse(left.created_at || left.updated_at || 0),
    );
}

async function updateResearchApproval(project = {}, approval = {}, patch = {}) {
  const current = await CreativeProjectRuntime.get(project.id);
  return CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(current?.metadata || project.metadata || {}),
      paid_research_approval: {
        ...approval,
        ...patch,
      },
    },
  });
}

function validationFailure(error) {
  return text(error?.message || error) || "CREATIVE_RESEARCH_VALIDATION_FAILED";
}

export const AutonomousResearchDirectorRuntime = {
  async run({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    assets = [],
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const scopedProject = { ...project, organization_id };
    const policy = resolveResearchPolicy(scopedProject, brief);
    const organizationIdentity = await authoritativeOrganizationIdentity({
      organization_id,
      project: scopedProject,
    });
    const context = internalContext({
      organization: organizationIdentity,
      mission,
      project: scopedProject,
      brief,
      assets,
    });
    const contextIdentity = researchContextIdentity({
      contract: RESEARCH_CONTEXT_CONTRACT,
      transport_version: RESEARCH_TRANSPORT_VERSION,
      context,
      policy,
    });

    const existing = await ResearchRuntime.list({
      organization_id,
      creative_project_id: project.id,
    });
    if (!force) {
      const reusable = existing.find((report) =>
        researchReportIsReusable(report, { context_identity: contextIdentity, policy }),
      );
      if (reusable) return reusable;
    }

    const approval = approvedResearchExecution(scopedProject);
    const plan = await buildResearchPlan(scopedProject, brief);
    const currentDate = new Date().toISOString();

    const priorUsages = await matchingSuccessfulUsages({
      organization_id,
      project_id: project.id,
      context_identity: contextIdentity,
      approval_id: approval.id,
    });
    for (const priorUsage of priorUsages) {
      const recoveredResult = serviceResultFromUsage(priorUsage);
      const recoveredRaw = rawResearchResult(recoveredResult);
      if (!hasWebSearchCall(recoveredRaw)) continue;
      try {
        const normalized = normalizeAndValidateResearch({
          result: recoveredResult,
          raw: recoveredRaw,
          policy,
          context_identity: contextIdentity,
          researched_at: priorUsage.updated_at || priorUsage.created_at || currentDate,
        });
        const recoveredValidation = validateResolvedOrganization(
          normalized,
          organizationIdentity,
        );
        const recoveredReport = await ResearchRuntime.create(reportDocument({
          validated: recoveredValidation,
          contextIdentity,
          organizationIdentity,
          policy,
          result: recoveredResult,
          plan,
          project: scopedProject,
          brief,
        }));
        await updateResearchApproval(scopedProject, approval, {
          approved: true,
          status: "COMPLETED_FROM_EXISTING_USAGE",
          recovered_from_usage_id: priorUsage.id,
          research_report_id: recoveredReport.id,
          completed_at: new Date().toISOString(),
          retry_required: false,
        });
        return recoveredReport;
      } catch {
        // Invalid historical usage is evidence of a failed attempt, not a reason to consume
        // the current approval. Continue until a recoverable prior result is found.
      }
    }

    await updateResearchApproval(scopedProject, approval, {
      approved: false,
      status: "EXECUTING",
      attempt_started_at: new Date().toISOString(),
      retry_required: false,
    });

    let result;
    try {
      result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: approval.provider,
        category: "CREATIVE_RESEARCH",
        input: {
          instructions_text:
            "Use web search before the final answer. The final answer must be exactly one valid JSON object matching the requested research contract, with no prose before or after it.",
          prompt: researchPrompt({ context, plan, policy, currentDate }),
          tools: [{
            type: "web_search",
            search_context_size: "high",
          }],
          tool_choice: "auto",
          provider_parameters: {
            include: ["web_search_call.action.sources"],
            max_tool_calls: 8,
          },
          max_output_tokens: 16000,
          quantity: 1,
          currency: approval.currency || undefined,
        },
        provider_policy: {
          allowed_providers: [approval.provider],
          preferred_providers: [approval.provider],
          preferred_models: approval.model ? [approval.model] : [],
          selection_weights: {
            preference: 1,
            quality: 0,
            speed: 0,
            reliability: 0,
            cost: 0,
          },
        },
        metadata: {
          module: "CREATIVE",
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V3",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          research_policy_version: policy.version,
          research_context_identity: contextIdentity,
          research_transport_version: RESEARCH_TRANSPORT_VERSION,
          research_approval_id: approval.id || null,
          research_approved_at: approval.approved_at,
          research_maximum_customer_price: approval.maximum_customer_price,
          research_approval_currency: approval.currency,
          required_output_contract: "JSON_TEXT_WITH_LOCAL_EVIDENCE_AND_IDENTITY_VALIDATION",
          structured_output_transport: "WEB_SEARCH_TEXT_PLUS_LOCAL_JSON_VALIDATION",
          organization_identity_contract: "CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_V3",
          web_search_required: true,
          web_search_sources_included: true,
          web_search_json_mode_disabled: true,
        },
      });
    } catch (error) {
      await updateResearchApproval(scopedProject, approval, {
        approved: false,
        status: "EXECUTION_FAILED",
        consumed_at: new Date().toISOString(),
        execution_error: text(error?.message || error),
        retry_required: true,
      }).catch(() => null);
      const failure = new Error(
        `CREATIVE_AUTONOMOUS_RESEARCH_FAILED_CLOSED:${error?.message || String(error)}`,
      );
      failure.cause = error;
      throw failure;
    }

    const chargedPrice = Number(
      result?.pricing?.customer_price ??
      result?.reservation_pricing?.customer_price ??
      0,
    );
    if (
      chargedPrice > 0 &&
      chargedPrice > Number(approval.maximum_customer_price)
    ) {
      await updateResearchApproval(scopedProject, approval, {
        approved: false,
        status: "APPROVED_COST_EXCEEDED",
        consumed_at: new Date().toISOString(),
        charged_customer_price: chargedPrice,
        retry_required: true,
      }).catch(() => null);
      throw new Error(
        `CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:${chargedPrice}:${approval.maximum_customer_price}`,
      );
    }

    let validated;
    try {
      const raw = rawResearchResult(result);
      if (!hasWebSearchCall(raw)) {
        throw new Error("CREATIVE_RESEARCH_WEB_SEARCH_REQUIRED");
      }
      const normalized = normalizeAndValidateResearch({
        result,
        raw,
        policy,
        context_identity: contextIdentity,
        researched_at: currentDate,
      });
      validated = validateResolvedOrganization(normalized, organizationIdentity);
    } catch (error) {
      const failureMessage = validationFailure(error);
      await updateResearchApproval(scopedProject, approval, {
        approved: false,
        status: "VALIDATION_FAILED",
        consumed_at: new Date().toISOString(),
        usage_id: result?.usage?.id || null,
        validation_error: failureMessage,
        retry_required: true,
      }).catch(() => null);
      const failure = new Error(`CREATIVE_RESEARCH_RETRY_REQUIRED:${failureMessage}`);
      failure.cause = error;
      failure.validation = error?.validation || null;
      throw failure;
    }

    const report = await ResearchRuntime.create(reportDocument({
      validated,
      contextIdentity,
      organizationIdentity,
      policy,
      result,
      plan,
      project: scopedProject,
      brief,
    }));
    await updateResearchApproval(scopedProject, approval, {
      approved: true,
      status: "COMPLETED",
      usage_id: result?.usage?.id || null,
      research_report_id: report.id,
      completed_at: new Date().toISOString(),
      retry_required: false,
    });
    return report;
  },
};