import "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime";

import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolveActiveLegalEntitySelection } from "@/lib/platform/runtime/resolveActiveLegalEntitySelection";
import { ResearchRuntime } from "./ResearchRuntime";
import { buildResearchPlan } from "../reasoning/ResearchDirector";
import {
  extractResearchCitations,
  normalizeAndValidateResearch,
  researchContextIdentity,
  researchReportIsReusable,
  resolveResearchPolicy,
} from "./ResearchEvidenceContractRuntime";

export const RESEARCH_TRANSPORT_VERSION = "WEB_EVIDENCE_STRUCTURED_V4";
export const RESEARCH_CONTEXT_CONTRACT = "CREATIVE_RESEARCH_CONTEXT_V4";
export const RESEARCH_REPORT_CONTRACT = "CREATIVE_AUTONOMOUS_RESEARCH_V4";
export const RESEARCH_IDENTITY_CONTRACT = "CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_V3";

const NAME_STOP_WORDS = new Set([
  "and", "the", "company", "co", "limited", "ltd", "llc", "inc",
  "incorporated", "corp", "corporation", "plc", "pte", "gmbh",
]);

const ADDRESS_STOP_WORDS = new Set([
  "and", "the", "road", "rd", "street", "st", "avenue", "ave", "lane",
  "ln", "drive", "dr", "boulevard", "blvd", "highway", "hwy", "soi",
  "moo", "district", "province", "county", "city", "state", "building",
  "floor", "unit", "beach", "tower", "center", "centre",
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

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const requiredOverlap = expectedTokens.length === 1 ? 1 : Math.min(2, expectedTokens.length);
  return overlap >= requiredOverlap && overlap / expectedTokens.length >= 0.5;
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

function canonicalUrl(value) {
  try {
    const url = new URL(text(value));
    url.search = "";
    url.hash = "";
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
  } catch {
    return null;
  }
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
  if (!canonicalName) throw new Error("CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_REQUIRED");

  let legalEntity = null;
  let legalEntitySource = "UNAVAILABLE";
  try {
    const selection = await resolveActiveLegalEntitySelection({ organizationId: organization_id });
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
    legal_entity_name: text(legalEntity?.display_name || legalEntity?.legal_name) || null,
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
    search_seed: [identity.canonical_name, identity.address, identity.country, identity.industry]
      .filter(Boolean)
      .join(" "),
  };
}

function internalContext({ organization = {}, mission = {}, project = {}, brief = {}, assets = [] } = {}) {
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
  if (!valid) throw new Error("CREATIVE_PAID_RESEARCH_APPROVAL_REQUIRED");
  return approval;
}

function rawFromUsage(usage = {}) {
  return usage?.metadata?.result?.output?.raw || null;
}

function outputTextFromUsage(usage = {}) {
  return text(
    usage?.metadata?.result?.output?.text ||
    rawFromUsage(usage)?.output_text,
  );
}

function hasWebSearchCall(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasWebSearchCall(item, seen));
  if (text(value.type).toLowerCase() === "web_search_call") return true;
  return Object.values(value).some((item) => hasWebSearchCall(item, seen));
}

function evidenceDossierFromUsage(usage = {}) {
  const raw = rawFromUsage(usage);
  const citations = extractResearchCitations(raw, usage.updated_at || usage.created_at);
  return {
    usage_id: usage.id || null,
    researched_at: usage.updated_at || usage.created_at || new Date().toISOString(),
    output_text: outputTextFromUsage(usage),
    sources: citations.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      source_type: source.source_type,
      excerpt: source.excerpt,
    })),
    raw,
  };
}

function evidenceMatchesOrganization(dossier = {}, identity = {}) {
  const corpus = [
    dossier.output_text,
    ...list(dossier.sources).flatMap((source) => [source.title, source.url, source.publisher, source.excerpt]),
  ].filter(Boolean).join(" ");
  if (!tokenMatch(identity.canonical_name, corpus)) return false;
  const anchors = addressAnchors(identity.address);
  if (!anchors.length) return true;
  return includesAnchor(corpus, anchors).length >= Math.min(2, anchors.length);
}

function validateResolvedOrganization(validated = {}, expectedIdentity = {}) {
  const resolution = object(validated.company_resolution || validated.companyResolution);
  const anchors = addressAnchors(expectedIdentity.address);
  const matchedLocationAnchors = anchors.length ? includesAnchor(resolution.location, anchors) : [];
  const requiredLocationAnchors = anchors.length ? Math.min(2, anchors.length) : 0;
  const validation = {
    contract: RESEARCH_IDENTITY_CONTRACT,
    expected_canonical_name: text(expectedIdentity.canonical_name),
    resolved_canonical_name: text(resolution.canonical_name),
    matched_internal_identity: text(resolution.matched_internal_identity),
    expected_address: text(expectedIdentity.address) || null,
    expected_country: text(expectedIdentity.country) || null,
    resolved_location: text(resolution.location) || null,
    address_anchors: anchors,
    matched_location_anchors: matchedLocationAnchors,
    required_location_anchor_count: requiredLocationAnchors,
    canonical_name_match: tokenMatch(expectedIdentity.canonical_name, resolution.canonical_name),
    internal_identity_match: tokenMatch(expectedIdentity.canonical_name, resolution.matched_internal_identity),
    location_match: !anchors.length || matchedLocationAnchors.length >= requiredLocationAnchors,
  };
  const blockers = [];
  if (!validation.canonical_name_match) blockers.push("COMPANY_CANONICAL_NAME_MISMATCH");
  if (!validation.internal_identity_match) blockers.push("COMPANY_INTERNAL_IDENTITY_MISMATCH");
  if (!validation.location_match) blockers.push("COMPANY_LOCATION_MISMATCH");
  if (blockers.length) {
    const error = new Error(`CREATIVE_RESEARCH_IDENTITY_VALIDATION_FAILED:${blockers.join(",")}`);
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
    validation: { ...object(validated.validation), organization_identity: validation },
  };
}

function validateEvidenceBinding(validated = {}, dossier = {}) {
  const allowed = new Set(list(dossier.sources).map((source) => canonicalUrl(source.url)).filter(Boolean));
  const unbound = list(validated.sources)
    .filter((source) => source.url && !source.internal)
    .filter((source) => !allowed.has(canonicalUrl(source.url)))
    .map((source) => source.url);
  if (unbound.length) {
    const error = new Error(`CREATIVE_RESEARCH_SOURCE_BINDING_FAILED:${unbound.length}`);
    error.validation = {
      ...object(validated.validation),
      passed: false,
      blockers: [...list(validated.validation?.blockers), "RESEARCH_SOURCE_NOT_IN_WEB_EVIDENCE"],
      unbound_sources: unbound,
    };
    throw error;
  }
  return validated;
}

function webEvidencePrompt({ context, plan, policy, currentDate }) {
  return `You are Avantiqo's evidence researcher. Use web search to resolve the exact real organization first, then collect factual evidence useful to a later research director.\n\nAUTHORITATIVE ORGANIZATION IDENTITY\n${JSON.stringify(context.organization)}\n\nThe first search must combine canonical_name with the strongest locality/address/country and industry clues from search_seed. Reject same-name businesses that conflict with the authoritative identity. Prefer the official website and official profiles, then credible listings, customer evidence and relevant market sources. Do not invent facts. Return a concise cited evidence dossier in normal text; JSON is NOT required in this phase.\n\nResearch plan: ${JSON.stringify(plan)}\nPolicy: ${JSON.stringify(policy)}\nCurrent date: ${currentDate}\nInternal context: ${JSON.stringify(context)}`;
}

function structuredResearchPrompt({ context, plan, policy, currentDate, dossier }) {
  const evidence = {
    usage_id: dossier.usage_id,
    researched_at: dossier.researched_at,
    output_text: dossier.output_text,
    sources: dossier.sources,
  };
  return `You are Avantiqo's accountable Company and Market Research Director. Convert the supplied WEB EVIDENCE into one rigorous research JSON object. You have NO web tool in this phase. Use only the authoritative organization context and supplied evidence; do not use model memory for external facts and do not invent URLs. Every external source in the final JSON must reuse a URL present in WEB EVIDENCE. Preserve evidence source ids where practical, and every verified claim must cite source ids present in the final sources array.\n\nAUTHORITATIVE CONTEXT\n${JSON.stringify(context)}\n\nWEB EVIDENCE\n${JSON.stringify(evidence)}\n\nRESEARCH PLAN\n${JSON.stringify(plan)}\n\nPOLICY\n${JSON.stringify(policy)}\n\nCURRENT DATE\n${currentDate}\n\nReturn exactly one JSON object with these top-level keys: summary, company_resolution, company_truth, brand_intelligence, audience, competitor_analysis, market, commercial_intelligence, messaging, creative_opportunities, recommendations, trends, keywords, sources, claims, confidence. company_resolution must contain status, canonical_name, official_website, location, industry, matched_internal_identity, reasoning. company_resolution.matched_internal_identity must equal the authoritative organization canonical_name. company_resolution.location must match the authoritative locality when supplied. sources items must contain id, title, url, publisher, source_type, retrieved_at, published_at, official, primary, excerpt. claims items must contain id, claim, category, source_ids, confidence, verification_status, verified, public_usable, sensitive, expires_at, notes. audience must contain evidence source ids. market must contain evidence source ids when market context is required. Do not create a story, storyboard, campaign concept or shot plan. Include at least ${policy.minimum_external_sources} external sources, ${policy.minimum_primary_sources} official/primary sources, and ${policy.minimum_verified_claims} verified claims when the evidence supports them. If evidence cannot support a requirement, mark uncertainty rather than fabricating evidence.`;
}

async function matchingEvidenceUsages({ organization_id, project_id, identity }) {
  const rows = await UsageRuntime.organization(organization_id);
  return rows
    .filter((usage) => text(usage.status).toUpperCase() === "SUCCESS")
    .filter((usage) => text(usage.category).toUpperCase() === "CREATIVE_RESEARCH")
    .filter((usage) => text(usage.metadata?.creative_project_id) === text(project_id))
    .filter((usage) => hasWebSearchCall(rawFromUsage(usage)))
    .map((usage) => ({ usage, dossier: evidenceDossierFromUsage(usage) }))
    .filter(({ dossier }) => evidenceMatchesOrganization(dossier, identity))
    .sort((left, right) => Date.parse(right.usage.created_at || 0) - Date.parse(left.usage.created_at || 0));
}

async function currentApprovalSpend({ organization_id, project_id, approval_id }) {
  const rows = await UsageRuntime.organization(organization_id);
  return rows
    .filter((usage) => text(usage.status).toUpperCase() === "SUCCESS")
    .filter((usage) => text(usage.category).toUpperCase() === "CREATIVE_RESEARCH")
    .filter((usage) => text(usage.metadata?.creative_project_id) === text(project_id))
    .filter((usage) => text(usage.metadata?.research_approval_id) === text(approval_id))
    .reduce((sum, usage) => sum + finite(usage.customer_price ?? usage.charged_amount, 0), 0);
}

async function assertApprovalSpend({ organization_id, project_id, approval }) {
  const spent = await currentApprovalSpend({
    organization_id,
    project_id,
    approval_id: approval.id,
  });
  const maximum = finite(approval.maximum_customer_price, 0);
  if (spent > maximum + 0.000001) {
    throw new Error(`CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:${spent}:${maximum}`);
  }
  return { spent, remaining: Math.max(0, maximum - spent) };
}

async function updateResearchApproval(project = {}, approval = {}, patch = {}) {
  const current = await CreativeProjectRuntime.get(project.id);
  return CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(current?.metadata || project.metadata || {}),
      paid_research_approval: { ...approval, ...patch },
    },
  });
}

function reportDocument({ validated, contextIdentity, organizationIdentity, policy, result, plan, project, brief, dossier, evidenceReused }) {
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
      evidence_usage_id: dossier.usage_id || null,
      structured_usage_id: result.usage?.id || null,
      evidence_reused: evidenceReused,
      provider: result.provider || null,
      model: result.model || null,
      usage: result.usage || null,
      billing: result.billing || null,
      researched_at: validated.validation.researched_at,
    },
  };
}

export const AutonomousResearchDirectorV4Runtime = {
  async run({ organization_id, mission = {}, project = {}, brief = {}, assets = [], force = false } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const scopedProject = { ...project, organization_id };
    const policy = resolveResearchPolicy(scopedProject, brief);
    const organizationIdentity = await authoritativeOrganizationIdentity({ organization_id, project: scopedProject });
    const context = internalContext({ organization: organizationIdentity, mission, project: scopedProject, brief, assets });
    const contextIdentity = researchContextIdentity({
      contract: RESEARCH_CONTEXT_CONTRACT,
      transport_version: RESEARCH_TRANSPORT_VERSION,
      context,
      policy,
    });

    const existing = await ResearchRuntime.list({ organization_id, creative_project_id: project.id });
    if (!force) {
      const reusable = existing.find((report) => researchReportIsReusable(report, { context_identity: contextIdentity, policy }));
      if (reusable) return reusable;
    }

    const approval = approvedResearchExecution(scopedProject);
    const plan = await buildResearchPlan(scopedProject, brief);
    const currentDate = new Date().toISOString();

    await updateResearchApproval(scopedProject, approval, {
      approved: false,
      status: "EXECUTING",
      attempt_started_at: new Date().toISOString(),
      retry_required: false,
      research_transport_version: RESEARCH_TRANSPORT_VERSION,
    });

    let dossier;
    let evidenceReused = false;
    let structuredResult;
    try {
      const priorEvidence = await matchingEvidenceUsages({
        organization_id,
        project_id: project.id,
        identity: organizationIdentity,
      });
      if (priorEvidence.length) {
        dossier = priorEvidence[0].dossier;
        evidenceReused = true;
      } else {
        const budgetBeforeEvidence = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
        if (budgetBeforeEvidence.remaining <= 0) throw new Error("CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:0");
        const evidenceResult = await ServiceExecutionRuntime.execute({
          organization_id,
          service_id: "ai.reasoning.execute",
          provider_id: approval.provider,
          category: "CREATIVE_RESEARCH",
          input: {
            instructions_text: "Use web search to collect cited evidence for the exact organization. Normal cited prose is expected in this evidence phase.",
            prompt: webEvidencePrompt({ context, plan, policy, currentDate }),
            tools: [{ type: "web_search", search_context_size: "high" }],
            tool_choice: "auto",
            provider_parameters: { include: ["web_search_call.action.sources"], max_tool_calls: 8 },
            max_output_tokens: 4000,
            quantity: 1,
            currency: approval.currency || undefined,
          },
          cost_guard: {
            maximum_customer_price: budgetBeforeEvidence.remaining,
            currency: approval.currency || "THB",
            estimated_input_tokens: 9000,
            estimated_output_tokens: 2000,
            estimated_quantity: 1,
            reference: `${approval.id}:WEB_EVIDENCE`,
          },
          provider_policy: {
            allowed_providers: [approval.provider],
            preferred_providers: [approval.provider],
            preferred_models: approval.model ? [approval.model] : [],
            selection_weights: { preference: 1, quality: 0, speed: 0, reliability: 0, cost: 0 },
          },
          metadata: {
            module: "CREATIVE",
            operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_WEB_EVIDENCE",
            creative_mission_id: mission.id || null,
            creative_project_id: project.id,
            research_policy_version: policy.version,
            research_context_identity: contextIdentity,
            research_transport_version: RESEARCH_TRANSPORT_VERSION,
            research_phase: "WEB_EVIDENCE",
            research_approval_id: approval.id || null,
            organization_identity_contract: RESEARCH_IDENTITY_CONTRACT,
            web_search_required: true,
          },
        });
        await assertApprovalSpend({ organization_id, project_id: project.id, approval });
        const usage = evidenceResult.usage || evidenceResult.billing?.usage;
        dossier = evidenceDossierFromUsage(usage || {});
        if (!hasWebSearchCall(dossier.raw)) throw new Error("CREATIVE_RESEARCH_WEB_SEARCH_REQUIRED");
        if (!evidenceMatchesOrganization(dossier, organizationIdentity)) {
          throw new Error("CREATIVE_RESEARCH_WEB_EVIDENCE_IDENTITY_MISMATCH");
        }
      }

      const budgetBeforeSynthesis = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
      if (budgetBeforeSynthesis.remaining <= 0) throw new Error("CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:0");
      structuredResult = await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: approval.provider,
        category: "CREATIVE_RESEARCH",
        input: {
          instructions_text: "Return exactly one valid JSON object. Use only the supplied authoritative context and web evidence. Do not invent external facts or URLs.",
          prompt: structuredResearchPrompt({ context, plan, policy, currentDate, dossier }),
          response_format: { type: "json_object" },
          max_output_tokens: 12000,
          quantity: 1,
          currency: approval.currency || undefined,
        },
        cost_guard: {
          maximum_customer_price: budgetBeforeSynthesis.remaining,
          currency: approval.currency || "THB",
          estimated_input_tokens: 12000,
          estimated_output_tokens: 8000,
          estimated_quantity: 1,
          reference: `${approval.id}:STRUCTURED_SYNTHESIS`,
        },
        provider_policy: {
          allowed_providers: [approval.provider],
          preferred_providers: [approval.provider],
          preferred_models: approval.model ? [approval.model] : [],
          selection_weights: { preference: 1, quality: 0, speed: 0, reliability: 0, cost: 0 },
        },
        metadata: {
          module: "CREATIVE",
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_STRUCTURED_SYNTHESIS",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          research_policy_version: policy.version,
          research_context_identity: contextIdentity,
          research_transport_version: RESEARCH_TRANSPORT_VERSION,
          research_phase: "STRUCTURED_SYNTHESIS",
          research_approval_id: approval.id || null,
          evidence_usage_id: dossier.usage_id || null,
          organization_identity_contract: RESEARCH_IDENTITY_CONTRACT,
          structured_output_transport: "JSON_OBJECT_WITH_LOCAL_EVIDENCE_VALIDATION",
          web_search_required_in_evidence_phase: true,
        },
      });
      const spend = await assertApprovalSpend({ organization_id, project_id: project.id, approval });

      let validated = normalizeAndValidateResearch({
        result: structuredResult,
        raw: structuredResult?.output?.output?.raw || structuredResult?.output?.raw || null,
        policy,
        context_identity: contextIdentity,
        researched_at: dossier.researched_at || currentDate,
      });
      validated = validateEvidenceBinding(validated, dossier);
      validated = validateResolvedOrganization(validated, organizationIdentity);

      const report = await ResearchRuntime.create(reportDocument({
        validated,
        contextIdentity,
        organizationIdentity,
        policy,
        result: structuredResult,
        plan,
        project: scopedProject,
        brief,
        dossier,
        evidenceReused,
      }));
      await updateResearchApproval(scopedProject, approval, {
        approved: true,
        status: "COMPLETED",
        evidence_usage_id: dossier.usage_id || null,
        structured_usage_id: structuredResult?.usage?.id || null,
        research_report_id: report.id,
        completed_at: new Date().toISOString(),
        charged_customer_price: spend.spent,
        retry_required: false,
        evidence_reused: evidenceReused,
      });
      return report;
    } catch (error) {
      const spend = await currentApprovalSpend({
        organization_id,
        project_id: project.id,
        approval_id: approval.id,
      }).catch(() => 0);
      const message = text(error?.message || error) || "CREATIVE_RESEARCH_V4_FAILED";
      await updateResearchApproval(scopedProject, approval, {
        approved: false,
        status: message.includes("VALIDATION") || message.includes("JSON_REQUIRED") || message.includes("SOURCE_BINDING")
          ? "VALIDATION_FAILED"
          : "EXECUTION_FAILED",
        consumed_at: new Date().toISOString(),
        evidence_usage_id: dossier?.usage_id || null,
        structured_usage_id: structuredResult?.usage?.id || null,
        charged_customer_price: spend,
        validation_error: message,
        retry_required: true,
        evidence_reused: evidenceReused,
      }).catch(() => null);
      const failure = new Error(`CREATIVE_RESEARCH_RETRY_REQUIRED:${message}`);
      failure.cause = error;
      failure.validation = error?.validation || null;
      throw failure;
    }
  },
};
