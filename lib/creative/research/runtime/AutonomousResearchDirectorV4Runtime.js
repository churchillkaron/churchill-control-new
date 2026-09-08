import "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime";

import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolveActiveLegalEntitySelection } from "@/lib/platform/runtime/resolveActiveLegalEntitySelection";
import { runOperatorWebSourceRead } from "@/lib/platform/research/runtime/OperatorWebSourceReadRuntime";
import { ResearchRuntime } from "./ResearchRuntime";
import { buildResearchPlan } from "../reasoning/ResearchDirector";
import {
  extractResearchCitations,
  normalizeAndValidateResearch,
  researchContextIdentity,
  researchReportIsReusable,
  resolveResearchPolicy,
} from "./ResearchEvidenceContractRuntime";

export const RESEARCH_TRANSPORT_VERSION = "WEB_EVIDENCE_STRUCTURED_V5";
export const RESEARCH_CONTEXT_CONTRACT = "CREATIVE_RESEARCH_CONTEXT_V5";
export const RESEARCH_REPORT_CONTRACT = "CREATIVE_AUTONOMOUS_RESEARCH_V5";
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
  const grounding = object(metadata.organization_grounding);
  const brandScoped = text(grounding.public_identity_scope).toUpperCase() === "BRAND";
  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name,industry")
    .eq("id", organization_id)
    .maybeSingle();
  if (organizationError) {
    throw new Error(`CREATIVE_RESEARCH_ORGANIZATION_LOOKUP_FAILED:${organizationError.message}`);
  }
  const canonicalName = text(
    grounding.canonical_name || metadata.organization_name || organization?.name || organization?.legal_name,
  );
  if (!canonicalName) throw new Error("CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_REQUIRED");

  let legalEntity = null;
  let legalEntitySource = brandScoped ? "NOT_REQUIRED_FOR_BRAND_SCOPE" : "UNAVAILABLE";
  try {
    if (brandScoped) throw new Error("BRAND_SCOPE");
    const selection = await resolveActiveLegalEntitySelection({ organizationId: organization_id });
    if (selection?.entity?.id) {
      legalEntity = await resolveEntity({
        organizationId: organization_id,
        entityId: selection.entity.id,
      });
      legalEntitySource = legalEntity ? selection.source || "resolved" : "UNRESOLVED";
    }
  } catch (error) {
    if (!brandScoped) legalEntitySource = `UNAVAILABLE:${text(error?.message || error)}`;
  }

  const identity = {
    organization_id,
    canonical_name: canonicalName,
    industry: text(grounding.industry || metadata.organization_industry || organization?.industry) || null,
    legal_entity_id: legalEntity?.id || null,
    legal_entity_name: text(legalEntity?.display_name || legalEntity?.legal_name) || null,
    address: text(legalEntity?.address) || null,
    country: text(grounding.country || legalEntity?.country).toUpperCase() || null,
    timezone: text(legalEntity?.timezone) || null,
    legal_entity_resolution: legalEntitySource,
    official_website: text(grounding.official_website || metadata.official_website) || null,
    public_identity_scope: brandScoped ? "BRAND" : "ORGANIZATION",
    identity_source: {
      canonical_name: grounding.canonical_name ? "creative_project.organization_grounding" : "organizations",
      industry: grounding.industry ? "creative_project.organization_grounding" : "organizations",
      legal_entity: legalEntity ? "platform.legal_entities" : null,
    },
  };

  return {
    ...identity,
    search_seed: [identity.canonical_name, identity.official_website, identity.address, identity.country, identity.industry]
      .filter(Boolean)
      .join(" "),
  };
}

function researchSafeMetadata(value = {}) {
  return Object.fromEntries(
    Object.entries(object(value)).filter(([key]) =>
      !/(?:approval|billing|wallet|pricing|credential|secret|token|spend|reservation)/i.test(key)
    ),
  );
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
      metadata: researchSafeMetadata(project.metadata),
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
  const groundingUrls = list(validated.creative_grounding?.reference_candidates)
    .flatMap((reference) => [reference?.source_url, reference?.media_url])
    .filter(Boolean);
  const unbound = [
    ...list(validated.sources)
      .filter((source) => source.url && !source.internal)
      .map((source) => source.url),
    ...groundingUrls,
  ]
    .filter((url) => !allowed.has(canonicalUrl(url)));
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
  return `You are Avantiqo's evidence researcher. Use web search to resolve the exact real organization first, then collect factual evidence useful to a later research director AND the downstream Creative Studio.\n\nAUTHORITATIVE ORGANIZATION IDENTITY\n${JSON.stringify(context.organization)}\n\nMISSION-GROUNDING DUTY\nInfer dynamically from the supplied mission/project/brief what real-world truth the creative output must preserve. This may include any combination of real organizations, places, routes, landmarks, people, products, services, events, documents, offers, data, architecture, interiors, exteriors, brand marks or other factual subjects. Do not use category templates and do not assume a fixed list of grounding types. Search specifically for the strongest first-party or otherwise credible visual/reference evidence needed to keep those subjects real. When visual grounding matters, seek image-rich first-party pages, official galleries/profiles, credible map/listing pages or other sources that expose authentic visual evidence; distinguish a source page URL from a direct media URL when the evidence provides one. For ordered journeys, transformations, before/after states or spatial movement, collect evidence for every materially distinct waypoint/state rather than only the origin and destination.\n\nThe first search must combine canonical_name with the strongest locality/address/country and industry clues from search_seed. Reject same-name businesses that conflict with the authoritative identity. Prefer the official website and official profiles, then credible listings, customer evidence and relevant market sources. Never invent a media URL, landmark, route, person, product, location or visual fact. Return a concise cited evidence dossier in normal text; JSON is NOT required in this phase.\n\nResearch plan: ${JSON.stringify(plan)}\nPolicy: ${JSON.stringify(policy)}\nCurrent date: ${currentDate}\nInternal context: ${JSON.stringify(context)}`;
}


function structuredCreativeGroundingPrompt({ context, policy, currentDate, dossier }) {
  const evidence = {
    researched_at: dossier.researched_at,
    sources: dossier.sources,
  };
  return `You are Avantiqo Intelligence acting as the factual grounding director for a real-world creative mission. Return exactly one JSON object and nothing else. Use ONLY AUTHORITATIVE CONTEXT and PUBLIC WEB EVIDENCE. Do not use model memory to invent facts.

AUTHORITATIVE CONTEXT
${JSON.stringify(context)}

PUBLIC WEB EVIDENCE
${JSON.stringify(evidence)}

CURRENT DATE
${currentDate}

REQUIRED JSON SHAPE
{
  "summary": "concise evidence-backed grounding summary",
  "company_resolution": {"status":"RESOLVED|AMBIGUOUS|UNRESOLVED","canonical_name":"","official_website":"","location":"","industry":"","matched_internal_identity":"","reasoning":""},
  "company_truth": {},
  "brand_intelligence": {},
  "audience": {},
  "competitor_analysis": {"competitors":[]},
  "market": {},
  "commercial_intelligence": {},
  "messaging": {},
  "strategic_synthesis": {
    "strategic_problem":{"statement":"","creative_consequence":"","misuse_risk":"","confidence":0,"source_ids":[]},
    "strategic_opportunity":{"statement":"","creative_consequence":"","misuse_risk":"","confidence":0,"source_ids":[]},
    "creative_mandate":{"statement":"","creative_consequence":"","misuse_risk":"","confidence":0,"source_ids":[]},
    "human_truths":[{"statement":"","creative_consequence":"","misuse_risk":"","confidence":0,"source_ids":[]}],
    "category_conventions":[{"statement":"","creative_consequence":"","misuse_risk":"","confidence":0,"source_ids":[]}],
    "breakable_conventions":[],
    "competitor_patterns":[],
    "distinctive_brand_assets":[],
    "cultural_context":[],
    "attention_opportunities":[],
    "contradictions":[],
    "must_not_do":[""]
  },
  "creative_grounding": {
    "mode":"MISSION_GROUNDED",
    "truth_sensitivity":"HIGH|MEDIUM|LOW",
    "reasoning":"",
    "entities":[{"id":"","name":"","role":"","source_ids":[]}],
    "evidence_targets":[{"id":"","subject":"","required":true,"status":"SUPPORTED|UNRESOLVED","source_ids":[]}],
    "reference_candidates":[{"id":"","subject":"","role":"","media_kind":"PAGE|IMAGE|MAP|OTHER","source_id":"","source_url":"","media_url":null,"source_type":"","confidence":0,"selection_status":"SELECTED|SUPPORTING|REJECTED|UNRESOLVED","rights_status":"REVIEW_REQUIRED|UNKNOWN","notes":""}],
    "continuity_constraints":[{"constraint":"","source_ids":[]}],
    "spatial_path":{"required":false,"origin_node_id":null,"destination_node_id":null,"route_intent":"","directionality":"DIRECTED","ordered_nodes":[],"directed_edges":[]}
  },
  "creative_opportunities": [],
  "recommendations": [],
  "trends": [],
  "keywords": [],
  "sources": [{"id":"","title":"","url":"","publisher":"","source_type":"public_web_source","retrieved_at":"","published_at":null,"official":false,"primary":false,"excerpt":""}],
  "claims": [{"id":"","claim":"","category":"","source_ids":[],"confidence":0,"verification_status":"VERIFIED|PARTIAL|UNRESOLVED","verified":true,"public_usable":true,"sensitive":false,"expires_at":null,"notes":""}],
  "confidence": 0
}

RULES
- Copy source ids and URLs exactly from PUBLIC WEB EVIDENCE. Never invent a URL or source id.
- Include at least ${policy.minimum_external_sources} external sources and ${policy.minimum_verified_claims} verified claims when evidence supports them.
- Mark the actual first-party organization website official=true and primary=true only when the evidence supports that identity.
- Resolve the organization against the authoritative canonical name and locality. matched_internal_identity must equal the authoritative canonical name exactly. Same-name/lookalike domains that do not match the authoritative official website are identity collisions, not products, affiliates or competitors unless the evidence explicitly proves a relationship.
- Infer evidence targets from the mission itself, not from a category template.
- strategic_synthesis is mandatory. It must turn evidence into decision-grade understanding, not generic marketing language. Every strategic_problem, strategic_opportunity, creative_mandate, human truth, category convention, competitor pattern, distinctive brand asset, cultural observation, attention opportunity and contradiction must cite source_ids from PUBLIC WEB EVIDENCE whenever it states an external truth.
- A strategic insight is only useful when creative_consequence states what the director should do differently because of it and misuse_risk states how the evidence could be overgeneralized, stereotyped, copied or misread.
- Separate observation from interpretation. Do not call something a human truth, cultural tension, category convention or competitor pattern merely because it sounds plausible.
- Study category conventions to identify both what audiences need for comprehension and what can be broken for distinctiveness. Do not recommend novelty for novelty's sake.
- Identify distinctive brand assets only when evidence supports that they actually belong to the organization/brand; include visual, verbal, behavioral and sonic assets when evidenced.
- attention_opportunities must describe likely active-attention mechanisms grounded in human relevance, surprise, tension, emotion, sensory detail or brand-linked curiosity, not generic fast cuts or spectacle.
- must_not_do must capture evidence-based strategic traps, category cliches, brand-confusion risks, cultural misreads and unsupported claims.
- If the mission describes ordered travel, a route, a journey, spatial movement, or directional progression between real places, spatial_path.required MUST be true. Build ordered_nodes in the mission-required order only when each node is supported by evidence. Build directed_edges only when evidence supports the relationship. Each node and edge must include source_ids.
- Never treat image order as geographic route evidence. Never reverse a route for visual convenience. Never invent coordinates, roads, turns, adjacency, landmarks, or travel direction.
- If a route edge cannot be supported, keep the node/target but mark it UNRESOLVED and do not fabricate the edge.
- creative_grounding.entities, evidence_targets, spatial_path.ordered_nodes and spatial_path.directed_edges must be objects, not strings, and each externally grounded item must carry source_ids.
- reference_candidates are evidence references for Studio, not generated prompts. media_url must be null unless a direct media URL appears verbatim in PUBLIC WEB EVIDENCE; never copy a webpage URL into media_url.
- Preserve uncertainty. A partially grounded route is preferable to a fabricated complete route.`;
}

function structuredResearchPrompt({ context, plan, policy, currentDate, dossier }) {
  const evidence = {
    usage_id: dossier.usage_id,
    researched_at: dossier.researched_at,
    output_text: dossier.output_text,
    sources: dossier.sources,
  };
  return `You are Avantiqo's accountable Company and Market Research Director. Convert the supplied WEB EVIDENCE into one rigorous research JSON object. You have NO web tool in this phase. Use only the authoritative organization context and supplied evidence; do not use model memory for external facts and do not invent URLs. Every external source in the final JSON must reuse a URL present in WEB EVIDENCE. Preserve evidence source ids where practical, and every verified claim must cite source ids present in the final sources array.\n\nAUTHORITATIVE CONTEXT\n${JSON.stringify(context)}\n\nWEB EVIDENCE\n${JSON.stringify(evidence)}\n\nRESEARCH PLAN\n${JSON.stringify(plan)}\n\nPOLICY\n${JSON.stringify(policy)}\n\nCURRENT DATE\n${currentDate}\n\nReturn exactly one JSON object with these top-level keys: summary, company_resolution, company_truth, brand_intelligence, audience, competitor_analysis, market, commercial_intelligence, messaging, strategic_synthesis, creative_grounding, creative_opportunities, recommendations, trends, keywords, sources, claims, confidence. company_resolution.status MUST be exactly RESOLVED when the authoritative identity is confirmed. audience MUST be an object containing evidence_source_ids plus audience segments/insights; never return audience as an array. competitor_analysis MUST be an object containing a competitors array; each competitor must be a genuinely relevant category competitor supported by evidence, never a same-name or lookalike search result. strategic_synthesis and creative_grounding are mandatory. strategic_synthesis must contain strategic_problem, strategic_opportunity, creative_mandate, human_truths, category_conventions, breakable_conventions, competitor_patterns, distinctive_brand_assets, cultural_context, attention_opportunities, contradictions and must_not_do. strategic_problem, strategic_opportunity and creative_mandate MUST each be objects with statement, creative_consequence, misuse_risk, confidence and source_ids. Every item in human_truths, category_conventions, breakable_conventions, competitor_patterns, distinctive_brand_assets, cultural_context, attention_opportunities and contradictions MUST also be an object with statement, creative_consequence, misuse_risk, confidence and source_ids. must_not_do MUST be an array of concise strings. Every evidence-derived synthesis item must cite source_ids from WEB EVIDENCE. It must distinguish facts from interpretation and reject generic agency language not earned by evidence. creative_grounding must be inferred from the actual mission rather than a category template. It must contain mode, truth_sensitivity, reasoning, entities, evidence_targets, reference_candidates, continuity_constraints, and may contain spatial_path. mode may be NONE only when no real-world subject requires fidelity. When the mission contains ordered travel, a route, a journey, spatial movement between real places, or any sequence whose direction matters, spatial_path is required and must be mission-derived: set required true; provide origin_node_id, destination_node_id, route_intent, directionality, ordered_nodes and directed_edges. Every ordered node and directed edge must cite source_ids from WEB EVIDENCE. directed_edges must state from_node_id, to_node_id and the evidence-backed directional relationship. Never infer a route merely from image order, never reverse an evidence-backed direction for visual convenience, and never invent coordinates, roads, turns, landmarks or adjacency. Each entity/evidence target that relies on external truth must cite source_ids. reference_candidates must represent authentic source material useful to Studio and contain id, subject, role, media_kind, source_id, source_url, media_url, source_type, confidence, selection_status, rights_status, notes. source_url and media_url must reuse URLs present in WEB EVIDENCE; never invent or synthesize URLs. selection_status should distinguish SELECTED, SUPPORTING, REJECTED and UNRESOLVED. continuity_constraints must describe only evidence-backed identity/spatial/temporal/brand constraints that downstream generation should preserve; do not write provider prompts or a storyboard. company_resolution must contain status, canonical_name, official_website, location, industry, matched_internal_identity, reasoning. company_resolution.matched_internal_identity must equal the authoritative organization canonical_name. company_resolution.location must match the authoritative locality when supplied. sources items must contain id, title, url, publisher, source_type, retrieved_at, published_at, official, primary, excerpt. claims items must contain id, claim, category, source_ids, confidence, verification_status, verified, public_usable, sensitive, expires_at, notes. audience must contain evidence source ids. market must contain evidence source ids when market context is required. Do not create a story, storyboard, campaign concept or shot plan. Include at least ${policy.minimum_external_sources} external sources, ${policy.minimum_primary_sources} official/primary sources, and ${policy.minimum_verified_claims} verified claims when the evidence supports them. If evidence cannot support a requirement, mark uncertainty rather than fabricating evidence.`;
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


function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function duckDuckGoTarget(value) {
  const raw = decodeHtmlEntities(String(value || "").trim());
  if (!raw) return null;
  try {
    const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
    const parsed = new URL(absolute, "https://duckduckgo.com");
    if (parsed.hostname === "duckduckgo.com" && parsed.pathname === "/l/") {
      const target = parsed.searchParams.get("uddg");
      if (!target) return null;
      const resolved = new URL(target);
      return resolved.protocol === "https:" ? resolved.toString() : null;
    }
    return parsed.protocol === "https:" && parsed.hostname !== "duckduckgo.com"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function searchPublicWeb(query) {
  const endpoint = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "text/html",
      "User-Agent": "AvantiqoResearch/1.0 (+public-evidence-discovery)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`CREATIVE_RESEARCH_PUBLIC_SEARCH_HTTP:${response.status}`);
  const html = await response.text();
  const results = [];
  const pattern = /<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"][^'"]*result-link[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = duckDuckGoTarget(match[1]);
    const title = stripHtml(match[2]);
    if (!url || !title || /sponsored/i.test(title)) continue;
    if (!results.some((item) => item.url === url)) results.push({ url, title });
    if (results.length >= 12) break;
  }
  return results;
}

function discoveryQueries({ context, plan }) {
  const organization = object(context.organization);
  const mission = object(context.mission);
  const project = object(context.project);
  const locality = [organization.address, organization.country]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" ");
  const identity = [organization.canonical_name, locality]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" ");
  const objective = text(
    mission.objective || mission.business_goal || project.objective || project.title,
    1600,
  );
  const fragments = objective
    .split(/[,;]|\b(?:from|to|into|through|via|towards?|ending(?:\s+with)?|across|past|along)\b/gi)
    .map((value) => text(value, 280))
    .filter((value) => value.length >= 4)
    .filter((value) => !/^(?:create|use|do not|preserve|this is|private|no publication)\b/i.test(value))
    .slice(0, 8);
  const missionGrounding = list(plan)
    .filter((item) => text(item?.id).toLowerCase() === "mission_grounding")
    .flatMap((item) => [item?.objective, ...list(item?.evidence)])
    .map((value) => text(value, 260))
    .filter(Boolean);
  let officialHost = "";
  try {
    officialHost = new URL(text(organization.official_website)).hostname.replace(/^www\./, "");
  } catch {}
  return [...new Set([
    [organization.canonical_name, organization.official_website].filter(Boolean).join(" "),
    [organization.canonical_name, officialHost ? `site:${officialHost}` : ""].filter(Boolean).join(" "),
    [identity, organization.industry].filter(Boolean).join(" "),
    [organization.industry, "competitors alternatives category leaders"].filter(Boolean).join(" "),
    [organization.industry, "market comparison enterprise platform"].filter(Boolean).join(" "),
    [identity, objective].filter(Boolean).join(" "),
    ...fragments.map((fragment) => [fragment, locality].filter(Boolean).join(" ")),
    [identity, ...missionGrounding].filter(Boolean).join(" "),
  ].map((value) => text(value, 1200)).filter(Boolean))].slice(0, 8);
}

async function collectDynamicPublicEvidence({ context, plan, policy, currentDate }) {
  const queryResults = [];
  for (const query of discoveryQueries({ context, plan })) {
    queryResults.push({ query, found: await searchPublicWeb(query).catch(() => []) });
  }
  const candidates = [];
  const seenUrls = new Set();
  for (let rank = 0; rank < 12; rank += 1) {
    for (const { query, found } of queryResults) {
      const item = found[rank];
      if (!item?.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      candidates.push({ ...item, query, discovery_rank: rank + 1 });
    }
  }
  const sources = [];
  for (const candidate of candidates) {
    if (sources.length >= Math.max(8, Number(policy.minimum_external_sources || 4))) break;
    try {
      const read = await runOperatorWebSourceRead({ payload: { url: candidate.url, max_characters: 7000 } });
      const excerpt = text(read?.content, 2600);
      if (!excerpt) continue;
      sources.push({
        id: `source-${sources.length + 1}`,
        title: text(read?.title || candidate.title, 500),
        url: text(read?.final_url || candidate.url, 2000),
        publisher: (() => { try { return new URL(read?.final_url || candidate.url).hostname; } catch { return ""; } })(),
        source_type: "public_web_source",
        excerpt,
        retrieved_at: text(read?.retrieved_at || currentDate),
      });
    } catch {
      // Continue to the next public result. Individual source failures are non-authoritative.
    }
  }
  if (sources.length < Number(policy.minimum_external_sources || 4)) {
    throw new Error(`CREATIVE_RESEARCH_PUBLIC_EVIDENCE_INSUFFICIENT:${sources.length}`);
  }
  return {
    usage_id: null,
    researched_at: currentDate,
    output_text: sources.map((source) => `${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n"),
    sources,
    raw: { contract: "CREATIVE_DYNAMIC_PUBLIC_EVIDENCE_V1", search_provider: "DUCKDUCKGO_LITE", sources },
  };
}

async function awaitResearchExecution(result, { organization_id, metadata = {} } = {}) {
  if (!result?.pending) return result;
  const execution = {
    provider: result.provider,
    provider_job_id: result.provider_job_id,
    usage_id: result.usage?.id,
    pricing: result.pricing || {},
    credential_id: result.credential_id || null,
    started_at: result.started_at || null,
    model: result.model || null,
  };
  if (!execution.provider || !execution.provider_job_id || !execution.usage_id) {
    throw new Error("CREATIVE_RESEARCH_PENDING_EXECUTION_IDENTITY_REQUIRED");
  }
  let current = result;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    current = await ServiceExecutionRuntime.settle({
      organization_id,
      provider: execution.provider,
      provider_job_id: execution.provider_job_id,
      usage_id: execution.usage_id,
      pricing: execution.pricing,
      credential_id: execution.credential_id,
      started_at: execution.started_at,
      metadata,
      provider_status_input: { model: execution.model },
    });
    if (!current?.pending) return current;
  }
  throw new Error("CREATIVE_RESEARCH_PENDING_TIMEOUT");
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
      strategic_synthesis: validated.strategic_synthesis || {},
      creative_grounding: validated.creative_grounding || {},
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


function parsedStructuredUsagePayload(usage = {}) {
  const providerResult = object(usage.metadata?.provider_result || usage.metadata?.result);
  const rawText = text(providerResult?.output?.text || providerResult?.output?.output?.text);
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText);
    return object(parsed);
  } catch {
    return null;
  }
}

function officialIdentityHost(identity = {}) {
  try {
    return new URL(text(identity.official_website)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function combinedRepairDossier({ priorPayload = {}, discovered = {}, identity = {}, researchedAt }) {
  const officialHost = officialIdentityHost(identity);
  const retained = list(priorPayload.sources).filter((source) => {
    try {
      const host = new URL(text(source?.url)).hostname.toLowerCase().replace(/^www\./, "");
      return Boolean(officialHost && host === officialHost);
    } catch {
      return false;
    }
  });
  const used = new Set(retained.map((source) => text(source.id)).filter(Boolean));
  const discoveredSources = list(discovered.sources).map((source, index) => {
    let id = `repair-source-${index + 1}`;
    while (used.has(id)) id = `${id}-r`;
    used.add(id);
    return { ...source, id, official: false, primary: false };
  });
  const sources = [...retained, ...discoveredSources];
  return {
    usage_id: null,
    researched_at: researchedAt,
    sources,
    output_text: sources.map((source) => `${source.id}\n${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n"),
    raw: { contract: "CREATIVE_RESEARCH_REPAIR_EVIDENCE_V1", sources },
  };
}

function researchRepairPrompt({ priorPayload = {}, dossier = {}, context = {}, policy = {}, currentDate }) {
  const prior = {
    summary: priorPayload.summary,
    company_resolution: priorPayload.company_resolution,
    company_truth: priorPayload.company_truth,
    brand_intelligence: priorPayload.brand_intelligence,
    audience: priorPayload.audience,
    market: priorPayload.market,
    strategic_synthesis: priorPayload.strategic_synthesis,
    creative_grounding: priorPayload.creative_grounding,
  };
  return `Repair a previously completed Avantiqo research synthesis using ONLY the supplied evidence. Return exactly one JSON object with keys competitor_analysis, market, strategic_synthesis, creative_grounding, confidence. Do not rewrite unrelated fields.\n\nAUTHORITATIVE CONTEXT\n${JSON.stringify(context)}\n\nPRIOR SYNTHESIS\n${JSON.stringify(prior)}\n\nFRESH DIVERSIFIED EVIDENCE\n${JSON.stringify(dossier.sources)}\n\nPOLICY\n${JSON.stringify(policy)}\n\nCURRENT DATE\n${currentDate}\n\nRULES\n- competitor_analysis.competitors must contain only genuine category competitors supported by evidence. Each competitor object must contain name, relationship, evidence_source_ids, category_pattern, creative_consequence. Never use same-name/lookalike domains as competitors unless the evidence actually places them in the same category.\n- market must contain evidence_source_ids from the supplied evidence.\n- strategic_synthesis must return ONLY category_conventions and competitor_patterns. Every item must be an object with statement, creative_consequence, misuse_risk, confidence, source_ids.\n- creative_grounding.mode must be exactly REAL_WORLD. entities and evidence_targets must be arrays of objects, never strings. Every externally factual item must cite source_ids. Do not claim a city, country, industry location, route, adjacency, human setting, or physical place unless a supplied source supports it. Put unresolved mission geography into unresolved_requirements instead of inventing it.\n- reference_candidates may use a source page as source_url, but media_url MUST be null unless the evidence contains a direct media-file URL. Public-web rights_status MUST be UNRESOLVED.\n- Preserve Avantiqo's exact identity and official website. Do not invent ownership relationships, product relationships, rights, routes, or media URLs.\n- Keep the patch concise and evidence-bound.`;
}

function mergeResearchRepair({ priorPayload = {}, patch = {}, dossier = {} }) {
  return {
    ...priorPayload,
    competitor_analysis: object(patch.competitor_analysis),
    market: Object.keys(object(patch.market)).length ? object(patch.market) : object(priorPayload.market),
    strategic_synthesis: {
      ...object(priorPayload.strategic_synthesis),
      category_conventions: list(patch.strategic_synthesis?.category_conventions),
      competitor_patterns: list(patch.strategic_synthesis?.competitor_patterns),
    },
    creative_grounding: object(patch.creative_grounding),
    confidence: Math.min(
      finite(priorPayload.confidence, 0) || 100,
      finite(patch.confidence, finite(priorPayload.confidence, 0)),
    ),
    sources: list(dossier.sources),
  };
}

async function latestCompletedStructuredSynthesis({ organization_id, project_id }) {
  const rows = await UsageRuntime.organization(organization_id);
  return rows
    .filter((usage) => text(usage.status).toUpperCase() === "SUCCESS")
    .filter((usage) => text(usage.category).toUpperCase() === "CREATIVE_RESEARCH")
    .filter((usage) => text(usage.metadata?.creative_project_id) === text(project_id))
    .filter((usage) => text(usage.metadata?.research_phase).toUpperCase() === "STRUCTURED_SYNTHESIS")
    .filter((usage) => parsedStructuredUsagePayload(usage))
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0] || null;
}

export const AutonomousResearchDirectorV4Runtime = {
  async repairCompletedSynthesis({ organization_id, mission = {}, project = {}, brief = {}, assets = [] } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");
    const scopedProject = { ...project, organization_id };
    const policy = resolveResearchPolicy(scopedProject, brief);
    const organizationIdentity = await authoritativeOrganizationIdentity({ organization_id, project: scopedProject });
    const context = internalContext({ organization: organizationIdentity, mission, project: scopedProject, brief, assets });
    const contextIdentity = researchContextIdentity({ contract: RESEARCH_CONTEXT_CONTRACT, context, policy });
    const approval = approvedResearchExecution(scopedProject);
    const priorUsage = await latestCompletedStructuredSynthesis({ organization_id, project_id: project.id });
    if (!priorUsage) throw new Error("CREATIVE_RESEARCH_COMPLETED_SYNTHESIS_REQUIRED");
    const priorPayload = parsedStructuredUsagePayload(priorUsage);
    if (!priorPayload) throw new Error("CREATIVE_RESEARCH_COMPLETED_SYNTHESIS_JSON_REQUIRED");
    const plan = await buildResearchPlan(scopedProject, brief);
    const currentDate = new Date().toISOString();
    const discovered = await collectDynamicPublicEvidence({ context, plan, policy, currentDate });
    const dossier = combinedRepairDossier({ priorPayload, discovered, identity: organizationIdentity, researchedAt: currentDate });
    const budget = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
    if (budget.remaining <= 0) throw new Error("CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:0");
    await updateResearchApproval(scopedProject, approval, {
      approved: false,
      status: "REPAIR_EXECUTING",
      retry_required: false,
      repair_of_usage_id: priorUsage.id,
    });
    let repairResult;
    try {
      repairResult = await awaitResearchExecution(await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: approval.provider,
        category: "CREATIVE_RESEARCH",
        input: {
          instructions_text: "Return one compact JSON repair object. Use only supplied evidence. No invented facts, URLs, media rights, geography, or competitors.",
          prompt: researchRepairPrompt({ priorPayload, dossier, context, policy, currentDate }),
          response_format: { type: "json_object" },
          max_output_tokens: 3000,
          quantity: 1,
          currency: approval.currency || undefined,
        },
        cost_guard: {
          maximum_customer_price: budget.remaining,
          currency: approval.currency || "THB",
          estimated_input_tokens: 16000,
          estimated_output_tokens: 3000,
          estimated_quantity: 1,
          reference: `${approval.id}:STRUCTURED_REPAIR`,
        },
        provider_policy: {
          allowed_providers: [approval.provider],
          preferred_providers: [approval.provider],
          preferred_models: approval.model ? [approval.model] : [],
          selection_weights: { preference: 1, quality: 0, speed: 0, reliability: 0, cost: 0 },
        },
        metadata: {
          module: "CREATIVE",
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_STRUCTURED_REPAIR",
          creative_mission_id: mission.id || null,
          creative_project_id: project.id,
          research_phase: "STRUCTURED_REPAIR",
          research_approval_id: approval.id || null,
          research_context_identity: contextIdentity,
          repair_of_usage_id: priorUsage.id,
        },
      }), {
        organization_id,
        metadata: {
          module: "CREATIVE",
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_STRUCTURED_REPAIR_SETTLE",
          creative_project_id: project.id,
          research_approval_id: approval.id || null,
          repair_of_usage_id: priorUsage.id,
        },
      });
      const repairText = text(repairResult?.output?.output?.text || repairResult?.output?.raw?.output?.text || repairResult?.output?.raw?.text);
      let patch;
      try { patch = object(JSON.parse(repairText)); } catch { throw new Error("CREATIVE_RESEARCH_REPAIR_JSON_REQUIRED"); }
      const merged = mergeResearchRepair({ priorPayload, patch, dossier });
      let validated = normalizeAndValidateResearch({
        result: merged,
        raw: repairResult?.output?.raw || repairResult,
        policy,
        context_identity: contextIdentity,
        researched_at: currentDate,
      });
      validated = validateEvidenceBinding(validated, dossier);
      validated = validateResolvedOrganization(validated, organizationIdentity);
      const report = await ResearchRuntime.create(reportDocument({
        validated,
        contextIdentity,
        organizationIdentity,
        policy,
        result: repairResult,
        plan,
        project: scopedProject,
        brief,
        dossier,
        evidenceReused: false,
      }));
      const spend = await currentApprovalSpend({ organization_id, project_id: project.id, approval_id: approval.id });
      await updateResearchApproval(scopedProject, approval, {
        approved: true,
        status: "COMPLETED",
        research_report_id: report.id,
        repair_of_usage_id: priorUsage.id,
        repair_usage_id: repairResult?.usage?.id || null,
        completed_at: new Date().toISOString(),
        charged_customer_price: spend,
        retry_required: false,
      });
      return report;
    } catch (error) {
      const spend = await currentApprovalSpend({ organization_id, project_id: project.id, approval_id: approval.id }).catch(() => 0);
      await updateResearchApproval(scopedProject, approval, {
        approved: false,
        status: "REPAIR_FAILED",
        retry_required: true,
        repair_of_usage_id: priorUsage.id,
        repair_usage_id: repairResult?.usage?.id || null,
        charged_customer_price: spend,
        validation_error: text(error?.message || error),
      }).catch(() => null);
      throw error;
    }
  },

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
        dossier = await collectDynamicPublicEvidence({ context, plan, policy, currentDate });
        if (!evidenceMatchesOrganization(dossier, organizationIdentity)) {
          throw new Error("CREATIVE_RESEARCH_WEB_EVIDENCE_IDENTITY_MISMATCH");
        }
      }

      const budgetBeforeSynthesis = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
      if (budgetBeforeSynthesis.remaining <= 0) throw new Error("CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:0");
      const synthesisSystemInstruction = policy.mode === "CREATIVE_GROUNDING"
        ? "Return exactly one valid JSON object matching the requested schema. This is a creative-grounding mission: prioritize verified real-world identity, spatial order, route direction, selected references, continuity constraints and uncertainty. Use only supplied evidence. Do not invent external facts, URLs, coordinates, roads, turns or landmarks."
        : "Return exactly one valid JSON object matching the requested schema. Use only the supplied authoritative context and web evidence. Do not invent external facts or URLs.";
      structuredResult = await awaitResearchExecution(await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: approval.provider,
        category: "CREATIVE_RESEARCH",
        input: {
          instructions_text: synthesisSystemInstruction,
          prompt: policy.mode === "CREATIVE_GROUNDING"
            ? structuredCreativeGroundingPrompt({ context, policy, currentDate, dossier })
            : structuredResearchPrompt({ context, plan, policy, currentDate, dossier }),
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
      }), {
        organization_id,
        metadata: {
          module: "CREATIVE",
          operation: "AUTONOMOUS_COMPANY_MARKET_RESEARCH_V4_STRUCTURED_SYNTHESIS_SETTLE",
          creative_project_id: project.id,
          research_approval_id: approval.id || null,
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
