import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
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
You are Avantiqo's accountable Company and Market Research Director.
You must investigate the real company, its public presence, audience, competitors,
market conditions and commercially useful creative opportunities BEFORE any story,
concept or campaign direction is created.

You MUST use the web-search tool. Do not rely on model memory for external facts.
Search the company identity first, then its official website and official profiles,
then verified business listings, customer evidence, direct competitors and current
market context. Continue searching until every minimum in the supplied policy can be met.
Prefer official company sources, official social profiles, first-party product or service
pages, verified business listings, reputable news, credible industry sources and direct
competitor sources. Reviews and community sources may be used for customer-language
evidence but must not override official facts.

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
      version: "CREATIVE_AUTONOMOUS_RESEARCH_V2",
      usage_id: result.usage?.id || null,
      billing_id: result.billing?.id || null,
    },
    metadata: {
      contract: "CREATIVE_AUTONOMOUS_RESEARCH_V2",
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
  return result?.output?.output?.raw || result?.output?.raw || result?.raw || null;
}

async function matchingSuccessfulUsage({
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
    )[0] || null;
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

    const approval = approvedResearchExecution(scopedProject);
    const plan = await buildResearchPlan(scopedProject, brief);
    const currentDate = new Date().toISOString();

    const priorUsage = await matchingSuccessfulUsage({
      organization_id,
      project_id: project.id,
      context_identity: contextIdentity,
      approval_id: approval.id,
    });
    if (priorUsage) {
      const recoveredResult = serviceResultFromUsage(priorUsage);
      try {
        const recoveredValidation = normalizeAndValidateResearch({
          result: recoveredResult,
          raw: rawResearchResult(recoveredResult),
          policy,
          context_identity: contextIdentity,
          researched_at: priorUsage.updated_at || priorUsage.created_at || currentDate,
        });
        const recoveredReport = await ResearchRuntime.create(reportDocument({
          validated: recoveredValidation,
          contextIdentity,
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
      } catch (error) {
        const failure = validationFailure(error);
        await updateResearchApproval(scopedProject, approval, {
          approved: false,
          status: "VALIDATION_FAILED",
          consumed_at: new Date().toISOString(),
          failed_usage_id: priorUsage.id,
          validation_error: failure,
          retry_required: true,
        });
        throw new Error(`CREATIVE_RESEARCH_RETRY_REQUIRED:${failure}`);
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
          prompt: researchPrompt({ context, plan, policy, currentDate }),
          tools: [{
            type: "web_search",
            search_context_size: "high",
          }],
          tool_choice: "required",
          provider_parameters: {
            include: ["web_search_call.action.sources"],
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
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V2",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          research_policy_version: policy.version,
          research_context_identity: contextIdentity,
          research_approval_id: approval.id || null,
          research_approved_at: approval.approved_at,
          research_maximum_customer_price: approval.maximum_customer_price,
          research_approval_currency: approval.currency,
          required_output_contract: "JSON_TEXT_WITH_LOCAL_VALIDATION",
          structured_output_transport: "PROMPT_AND_LOCAL_VALIDATION",
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
      validated = normalizeAndValidateResearch({
        result,
        raw: rawResearchResult(result),
        policy,
        context_identity: contextIdentity,
        researched_at: currentDate,
      });
    } catch (error) {
      await updateResearchApproval(scopedProject, approval, {
        approved: false,
        status: "VALIDATION_FAILED",
        consumed_at: new Date().toISOString(),
        usage_id: result?.usage?.id || null,
        validation_error: validationFailure(error),
        retry_required: true,
      }).catch(() => null);
      throw error;
    }

    const report = await ResearchRuntime.create(reportDocument({
      validated,
      contextIdentity,
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