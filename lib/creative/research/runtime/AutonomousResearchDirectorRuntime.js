import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { ResearchRuntime } from "./ResearchRuntime";
import { buildResearchPlan } from "../reasoning/ResearchDirector";
import {
  normalizeAndValidateResearch,
  researchContextIdentity,
  researchReportIsReusable,
  resolveResearchPolicy,
} from "./ResearchEvidenceContractRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
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

function internalContext({ mission = {}, project = {}, brief = {}, assets = [] } = {}) {
  return {
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

function researchPrompt({ context, plan, policy, currentDate }) {
  return `
You are Avantiqo's accountable Company and Market Research Director.
You must investigate the real company, its public presence, audience, competitors,
market conditions and commercially useful creative opportunities BEFORE any story,
concept or campaign direction is created.

Use web search extensively. Prefer official company sources, official social profiles,
first-party product or service pages, verified business listings, reputable news,
credible industry sources and direct competitor sources. Reviews and community sources
may be used for customer-language evidence but must not override official facts.

Do not invent company facts. When identity is ambiguous, return company_resolution.status
as AMBIGUOUS or UNRESOLVED. A persuasive guess is not resolution. Mark every material
claim with source ids, confidence, verification status and whether it is safe for public use.
Public-use claims must be verified by cited evidence.

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
- Research the company identity before researching competitors.
- Include at least the policy minimum number of external and primary sources.
- Include at least the policy minimum number of verified material claims.
- Every verified claim must cite source ids that exist in sources.
- Do not mark a claim public_usable unless it is verified and cited.
- Record uncertainty and source conflict explicitly.
- Recommendations must follow evidence; do not reverse-engineer evidence for a preferred idea.
- Do not create a final story, storyboard, campaign concept or shot plan. Research informs those later.
`;
}

function reportDocument({ validated, contextIdentity, policy, result, plan, project, brief }) {
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
      version: "CREATIVE_AUTONOMOUS_RESEARCH_V1",
      usage_id: result.usage?.id || null,
      billing_id: result.billing?.id || null,
    },
    metadata: {
      contract: "CREATIVE_AUTONOMOUS_RESEARCH_V1",
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
    const context = internalContext({ mission, project: scopedProject, brief, assets });
    const contextIdentity = researchContextIdentity({
      contract: "CREATIVE_RESEARCH_CONTEXT_V1",
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

    const plan = await buildResearchPlan(scopedProject, brief);
    const currentDate = new Date().toISOString();
    let result;
    try {
      result = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: null,
        category: "CREATIVE_RESEARCH",
        input: {
          prompt: researchPrompt({ context, plan, policy, currentDate }),
          tools: [{ type: "web_search" }],
          tool_choice: "auto",
          response_format: { type: "json_object" },
          max_output_tokens: 16000,
          quantity: 1,
        },
        metadata: {
          module: "CREATIVE",
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V1",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          research_policy_version: policy.version,
          research_context_identity: contextIdentity,
          required_output_contract: "JSON_OBJECT",
        },
      });
    } catch (error) {
      const failure = new Error(
        `CREATIVE_AUTONOMOUS_RESEARCH_FAILED_CLOSED:${error?.message || String(error)}`,
      );
      failure.cause = error;
      throw failure;
    }

    const validated = normalizeAndValidateResearch({
      result,
      raw: result?.output?.output?.raw || result?.output?.raw || null,
      policy,
      context_identity: contextIdentity,
      researched_at: currentDate,
    });
    return ResearchRuntime.create(reportDocument({
      validated,
      contextIdentity,
      policy,
      result,
      plan,
      project: scopedProject,
      brief,
    }));
  },
};
