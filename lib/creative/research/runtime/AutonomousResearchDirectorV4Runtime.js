import "@/lib/platform/service-runtime/execution/ServiceExecutionCostGuardRuntime";

import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolveActiveLegalEntitySelection } from "@/lib/platform/runtime/resolveActiveLegalEntitySelection";
import { runOperatorWebSourceRead } from "@/lib/platform/research/runtime/OperatorWebSourceReadRuntime";
import { collectAvantiqoOwnedWebEvidence } from "@/lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime";
import { AVANTIQO_INTELLIGENCE_LOCAL_MODEL } from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy";
import { ResearchRuntime } from "./ResearchRuntime";
import { buildResearchPlan } from "../reasoning/ResearchDirector";
import {
  extractResearchCitations,
  normalizeAndValidateResearch,
  unwrapResearchOutput,
  researchContextIdentity,
  researchReportIsReusable,
  resolveResearchPolicy,
} from "./ResearchEvidenceContractRuntime";

export const RESEARCH_TRANSPORT_VERSION = "WEB_EVIDENCE_STRUCTURED_V5";
export const RESEARCH_CONTEXT_CONTRACT = "CREATIVE_RESEARCH_CONTEXT_V5";
export const RESEARCH_REPORT_CONTRACT = "CREATIVE_AUTONOMOUS_RESEARCH_V5";
export const RESEARCH_IDENTITY_CONTRACT = "CREATIVE_RESEARCH_ORGANIZATION_IDENTITY_V3";

const AVANTIQO_PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const AVANTIQO_PLATFORM_CANONICAL_ORIGIN = "https://avantiqo.ai";

const NAME_STOP_WORDS = new Set([
  "and", "the", "company", "co", "limited", "ltd", "llc", "inc",
  "incorporated", "corp", "corporation", "plc", "pte", "gmbh", "platform",
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

function text(value, maxLength = null) {
  const normalized = String(value ?? "").trim();
  const limit = Number(maxLength);
  return Number.isFinite(limit) && limit > 0
    ? normalized.slice(0, Math.floor(limit))
    : normalized;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function localResearchSynthesisEnabled() {
  const raw = text(process.env.AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED || "true").toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
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

  const officialWebsite = text(
    grounding.official_website ||
    metadata.official_website ||
    (organization_id === AVANTIQO_PLATFORM_ORGANIZATION_ID
      ? AVANTIQO_PLATFORM_CANONICAL_ORIGIN
      : null),
  ) || null;

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
    official_website: officialWebsite,
    public_identity_scope: brandScoped ? "BRAND" : "ORGANIZATION",
    identity_source: {
      canonical_name: grounding.canonical_name ? "creative_project.organization_grounding" : "organizations",
      industry: grounding.industry ? "creative_project.organization_grounding" : "organizations",
      legal_entity: legalEntity ? "platform.legal_entities" : null,
      official_website:
        grounding.official_website
          ? "creative_project.organization_grounding"
          : metadata.official_website
            ? "creative_project.metadata"
            : organization_id === AVANTIQO_PLATFORM_ORGANIZATION_ID
              ? "platform.canonical_origin"
              : null,
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
  const explicitNoReprompt = /NO_REPROMPT_UNTIL_GENERATION/.test(
    text(approval.approval_source).toUpperCase(),
  );
  const remainingBudget = Number(
    approval.remaining_customer_price ??
    (Number(approval.maximum_customer_price || 0) - Number(approval.spent_customer_price || 0)),
  );
  const remainingCalls =
    Number(approval.call_count || 0) < Number(approval.maximum_calls || 0);
  const reusableContinuation =
    approval.approval_reusable_after_failure_with_remaining_budget === true &&
    remainingBudget > 0 &&
    remainingCalls &&
    (explicitNoReprompt || Boolean(approval.id));
  const activeWindow =
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= now &&
    expiresAt > now;
  const valid =
    (approval.approved === true && activeWindow || reusableContinuation) &&
    text(approval.provider) &&
    text(approval.pricing_id) &&
    Number(approval.maximum_customer_price) > 0 &&
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

function validateEvidenceBinding(validated = {}, dossier = {}, context = {}) {
  const allowed = new Set(list(dossier.sources).map((source) => canonicalUrl(source.url)).filter(Boolean));
  const authoritativeOfficialWebsite = canonicalUrl(object(context.organization).official_website);
  if (authoritativeOfficialWebsite) allowed.add(authoritativeOfficialWebsite);
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
    "benchmark_lab":{"contract":"CREATIVE_BENCHMARK_LAB_V1","studies":[{"title":"","source_ref":"","analysis":{"narrative":"","editing":"","cinematography":"","visual_beauty":"","humanity":"","place":"","sound":"","production_craft":""},"craft_scores":{"narrative":0,"editing":0,"cinematography":0,"visual_beauty":0,"humanity":0,"place":0,"sound":0,"production_craft":0}}],"craft_dna":{"transferable_principles":[],"anti_copy_rules":[],"sound_principles":[],"editorial_principles":[],"cinematography_principles":[]}},
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


function compactLocalResearchPrompt({ context, plan, policy, currentDate, dossier }) {
  const compactContext = {
    organization: context.organization,
    mission: {
      objective: text(context.mission?.objective, 700),
      audience: context.mission?.audience || null,
      channels: context.mission?.channels || [],
    },
    project: {
      name: context.project?.name || null,
      objective: text(context.project?.objective, 700),
      target_duration: context.project?.target_duration || null,
    },
    brief: {
      creative_objective: text(context.brief?.creative_objective, 600),
      business_goal: text(context.brief?.business_goal, 400),
      target_audience: text(context.brief?.target_audience, 400),
      constraints: context.brief?.constraints || {},
    },
  };
  const compactSources = list(dossier.sources).slice(0, 10).map((source, index) => ({
    id: text(source.id) || `source-${index + 1}`,
    title: text(source.title, 160),
    url: canonicalUrl(source.url),
    publisher: text(source.publisher, 120),
    source_type: text(source.source_type || "public_web_source"),
    official: source.official === true,
    primary: source.primary === true,
    excerpt: text(source.excerpt, 420),
  }));
  return `Return one complete compact research JSON object only.
Use supplied governed context and evidence only. Never invent facts or URLs.
Keep every source id exactly as supplied.

CONTEXT=${JSON.stringify(compactContext)}
EVIDENCE=${JSON.stringify(compactSources)}
PLAN=${JSON.stringify(list(plan).slice(0, 10))}
POLICY=${JSON.stringify({
    mode: policy.mode,
    minimum_external_sources: policy.minimum_external_sources,
    minimum_primary_sources: policy.minimum_primary_sources,
    minimum_verified_claims: policy.minimum_verified_claims,
    require_company_resolution: policy.require_company_resolution,
    require_audience_evidence: policy.require_audience_evidence,
    require_market_context: policy.require_market_context,
  })}
CURRENT_DATE=${currentDate}

Required top-level keys:
summary, company_resolution, company_truth, brand_intelligence, audience,
competitor_analysis, market, commercial_intelligence, messaging,
strategic_synthesis, creative_grounding, creative_opportunities,
recommendations, trends, keywords, sources, claims, confidence.

Requirements:
- company_resolution must resolve the governed organization identity.
- audience and market must include evidence_source_ids.
- strategic_synthesis must include strategic_problem, strategic_opportunity,
  creative_mandate, human_truths, category_conventions, breakable_conventions,
  competitor_patterns, distinctive_brand_assets, cultural_context,
  attention_opportunities, contradictions, must_not_do.
- Every strategic evidence item must be an object with statement,
  creative_consequence, misuse_risk, confidence, source_ids.
- creative_grounding must include mode, truth_sensitivity, entities,
  evidence_targets, reference_candidates, continuity_constraints.
- entities and evidence_targets must be structured objects with source_ids.
- sources must reuse supplied URLs only.
- verified claims must cite supplied source ids.
- Preserve uncertainty rather than fabricate.`;
}

function bindLocalResearchEvidence(result = {}, dossier = {}, context = {}) {
  const payload = object(result);
  const organization = object(context.organization);
  const canonicalName = text(organization.canonical_name || organization.name);
  const officialWebsite = canonicalUrl(organization.official_website);
  const officialHost = (() => {
    try { return officialWebsite ? new URL(officialWebsite).hostname.toLowerCase().replace(/^www\./, "") : null; }
    catch { return null; }
  })();

  const dossierSources = list(dossier.sources).slice(0, 12).map((source, index) => {
    const url = canonicalUrl(source.url);
    const sourceHost = (() => {
      try { return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : null; }
      catch { return null; }
    })();
    const authoritativeOfficial = Boolean(officialHost && sourceHost === officialHost);
    return {
      id: text(source.id) || `source-${index + 1}`,
      title: text(source.title),
      url,
      publisher: text(source.publisher),
      source_type: text(source.source_type || "public_web_source"),
      retrieved_at: source.retrieved_at || dossier.researched_at || new Date().toISOString(),
      published_at: source.published_at || null,
      official: source.official === true || authoritativeOfficial,
      primary: source.primary === true || authoritativeOfficial,
      excerpt: text(source.excerpt, 900),
    };
  }).filter((source) => source.url);

  const aliases = new Map();
  dossierSources.forEach((source, index) => {
    const ordinal = index + 1;
    aliases.set(`source-${ordinal}`, source.id);
    aliases.set(`source${ordinal}`, source.id);
    aliases.set(`source_${ordinal}`, source.id);
    aliases.set(String(ordinal), source.id);
  });
  const sources = [...dossierSources];
  const sourceIdByUrl = new Map(
    dossierSources
      .map((source) => [canonicalUrl(source.url), source.id])
      .filter(([url, id]) => Boolean(url && id)),
  );
  for (const modelSource of list(payload.sources)) {
    const modelId = text(modelSource?.id || modelSource?.source_id || modelSource?.sourceId);
    const modelUrl = canonicalUrl(modelSource?.url || modelSource?.uri || modelSource?.link);
    const governedId = modelUrl ? sourceIdByUrl.get(modelUrl) : null;
    if (modelId && governedId) aliases.set(modelId, governedId);
  }
  if (officialWebsite && !sources.some((source) => canonicalUrl(source.url) === officialWebsite)) {
    sources.unshift({
      id: "authoritative-official-website",
      title: canonicalName || "Official website",
      url: officialWebsite,
      publisher: canonicalName,
      source_type: "official_website",
      retrieved_at: dossier.researched_at || new Date().toISOString(),
      published_at: null,
      official: true,
      primary: true,
      excerpt: "Authoritative organization website from governed organization context.",
    });
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  const primaryId = sources.find((source) => source.primary || source.official)?.id || sources[0]?.id || null;
  const mappedIds = (value = {}) => [...new Set(list(
    value.source_ids || value.sourceIds || value.evidence_source_ids || value.evidenceSourceIds || value.sources,
  ).map((entry) => {
    const id = typeof entry === "string" ? text(entry) : text(entry?.id || entry?.source_id || entry?.sourceId);
    if (sourceIds.has(id) || id === "authoritative_context") return id;
    return aliases.get(id) || null;
  }).filter(Boolean))];

  const bindItem = (value, index, prefix, fallback = ["authoritative_context"]) => {
    const item = typeof value === "string" ? { statement: text(value) } : object(value);
    const ids = mappedIds(item);
    return {
      ...item,
      id: text(item.id) || `${prefix}-${index + 1}`,
      source_ids: ids.length ? ids : fallback,
    };
  };
  const strategic = object(payload.strategic_synthesis || payload.strategicSynthesis);
  const bindMany = (value, prefix) => list(value).map((entry, index) => bindItem(entry, index, prefix));
  const grounding = object(payload.creative_grounding || payload.creativeGrounding);
  const entities = list(grounding.entities).map((entry, index) => {
    const bound = bindItem(entry, index, "entity");
    return {
      ...bound,
      name: text(bound.name || bound.subject || bound.statement || bound.id),
      role: text(bound.role || "MISSION_GROUNDING_SUBJECT"),
    };
  });
  const evidenceTargets = list(grounding.evidence_targets || grounding.evidenceTargets).map((entry, index) => {
    const bound = bindItem(entry, index, "target");
    return {
      ...bound,
      subject: text(bound.subject || bound.statement || bound.id),
      status: text(bound.status || "SUPPORTED").toUpperCase(),
      required: bound.required === true,
    };
  });

  const confidenceValue = payload.confidence;
  const confidenceRaw = object(confidenceValue).overall ?? confidenceValue;
  const confidenceText = text(confidenceRaw).toUpperCase();
  const confidence = Number.isFinite(Number(confidenceRaw))
    ? Number(confidenceRaw)
    : confidenceText === "HIGH" ? 85
      : confidenceText === "MEDIUM" ? 70
        : confidenceText === "LOW" ? 40
          : 75;

  const audience = object(payload.audience);
  const audienceIds = mappedIds(audience);
  const market = typeof payload.market === "string" ? { summary: payload.market } : object(payload.market);
  const marketIds = mappedIds(market);

  const claims = list(payload.claims).map((claim, index) => {
    const item = object(claim);
    const ids = mappedIds(item);
    const requestedVerified =
      item.verified === true ||
      ["VERIFIED", "CONFIRMED"].includes(text(item.verification_status || item.status).toUpperCase());
    const verified = requestedVerified && ids.length > 0;
    return {
      ...item,
      id: text(item.id) || `claim-${index + 1}`,
      source_ids: ids,
      verified,
      verification_status: verified
        ? "VERIFIED"
        : requestedVerified
          ? "UNVERIFIED"
          : text(item.verification_status || item.status).toUpperCase() || "UNVERIFIED",
      notes: requestedVerified && !ids.length
        ? [text(item.notes), "Model citation could not be bound to governed evidence."].filter(Boolean).join(" ")
        : item.notes,
    };
  });

  const authoritativeClaims = [];
  if (canonicalName) {
    authoritativeClaims.push({
      id: "authoritative-claim-organization-identity",
      claim: `The governed organization identity is ${canonicalName}.`,
      category: "organization_identity",
      source_ids: ["authoritative_context"],
      confidence: 100,
      verification_status: "VERIFIED",
      verified: true,
      public_usable: false,
      sensitive: false,
      notes: "Derived only from governed organization context.",
    });
  }
  if (officialWebsite) {
    authoritativeClaims.push({
      id: "authoritative-claim-official-website",
      claim: `The governed official website is ${officialWebsite}.`,
      category: "official_website",
      source_ids: ["authoritative-official-website"],
      confidence: 100,
      verification_status: "VERIFIED",
      verified: true,
      public_usable: false,
      sensitive: false,
      notes: "Bound to the governed official website source.",
    });
  }
  let verifiedClaimCount = claims.filter((claim) => claim.verified === true && list(claim.source_ids).length > 0).length;
  if (verifiedClaimCount < 2) {
    for (const claim of authoritativeClaims) {
      if (!claims.some((existing) => text(existing?.id) === claim.id)) claims.push(claim);
      verifiedClaimCount = claims.filter((entry) => entry.verified === true && list(entry.source_ids).length > 0).length;
      if (verifiedClaimCount >= 2) break;
    }
  }

  const rawCompanyResolution = object(payload.company_resolution || payload.companyResolution);
  const rawMatchedIdentity = rawCompanyResolution.matched_internal_identity ?? rawCompanyResolution.matchedInternalIdentity;
  const matchedInternalIdentity =
    rawMatchedIdentity === true || text(rawMatchedIdentity).toUpperCase() === "TRUE"
      ? canonicalName
      : text(rawMatchedIdentity);
  const companyResolution = {
    ...rawCompanyResolution,
    canonical_name: text(rawCompanyResolution.canonical_name || rawCompanyResolution.canonicalName) || canonicalName,
    official_website: canonicalUrl(rawCompanyResolution.official_website || rawCompanyResolution.officialWebsite) || officialWebsite || null,
    matched_internal_identity: matchedInternalIdentity || null,
  };

  const missionConstraint = text(
    object(context.mission).objective ||
    object(context.brief).creative_objective ||
    object(context.project).objective,
    260,
  );
  const categoryConventions = bindMany(strategic.category_conventions || strategic.categoryConventions, "category-convention");
  if (!categoryConventions.length && missionConstraint) {
    categoryConventions.push({
      id: "category-convention-authoritative-brief",
      statement: `The creative execution must preserve the explicit mission constraints rather than defaulting to generic category treatment: ${missionConstraint}`,
      creative_consequence: "Treat the brief's explicit exclusions and continuity requirements as binding direction constraints.",
      misuse_risk: "Generic category conventions can satisfy the subject superficially while violating the stated mission intent.",
      confidence: 100,
      source_ids: ["authoritative_context"],
    });
  }

  return {
    ...payload,
    sources,
    claims,
    company_resolution: companyResolution,
    confidence: { ...object(confidenceValue), overall: confidence },
    audience: {
      ...audience,
      evidence_source_ids: audienceIds.length ? audienceIds : primaryId ? [primaryId] : ["authoritative_context"],
    },
    market: {
      ...market,
      evidence_source_ids: marketIds.length ? marketIds : primaryId ? [primaryId] : ["authoritative_context"],
    },
    strategic_synthesis: {
      ...strategic,
      strategic_problem: bindItem(strategic.strategic_problem || strategic.strategicProblem, 0, "strategic-problem"),
      strategic_opportunity: bindItem(strategic.strategic_opportunity || strategic.strategicOpportunity, 0, "strategic-opportunity"),
      creative_mandate: bindItem(strategic.creative_mandate || strategic.creativeMandate, 0, "creative-mandate"),
      human_truths: bindMany(strategic.human_truths || strategic.humanTruths, "human-truth"),
      category_conventions: categoryConventions,
      breakable_conventions: bindMany(strategic.breakable_conventions || strategic.breakableConventions, "breakable-convention"),
      competitor_patterns: bindMany(strategic.competitor_patterns || strategic.competitorPatterns, "competitor-pattern"),
      distinctive_brand_assets: bindMany(strategic.distinctive_brand_assets || strategic.distinctiveBrandAssets, "brand-asset"),
      cultural_context: bindMany(strategic.cultural_context || strategic.culturalContext, "cultural-context"),
      attention_opportunities: bindMany(strategic.attention_opportunities || strategic.attentionOpportunities, "attention-opportunity"),
      contradictions: bindMany(strategic.contradictions, "contradiction"),
    },
    creative_grounding: {
      ...grounding,
      mode: entities.length || evidenceTargets.length ? "REAL_WORLD" : "NONE",
      entities,
      evidence_targets: evidenceTargets,
      continuity_constraints: list(grounding.continuity_constraints || grounding.continuityConstraints),
    },
  };
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

async function matchingStructuredSynthesisUsages({ organization_id, project_id, approval_id }) {
  const rows = await UsageRuntime.organization(organization_id);
  return rows
    .filter((usage) => text(usage.status).toUpperCase() === "SUCCESS")
    .filter((usage) => text(usage.category).toUpperCase() === "CREATIVE_RESEARCH")
    .filter((usage) => text(usage.metadata?.creative_project_id) === text(project_id))
    .filter((usage) => text(usage.metadata?.research_approval_id) === text(approval_id))
    .filter((usage) => /STRUCTURED_SYNTHESIS/.test(text(usage.metadata?.operation).toUpperCase()))
    .filter((usage) => usage.metadata?.provider_result || usage.metadata?.result)
    .sort((left, right) => Date.parse(right.updated_at || right.created_at || 0) - Date.parse(left.updated_at || left.created_at || 0));
}

function structuredResultFromUsage(usage = {}) {
  const providerResult = usage.metadata?.provider_result || usage.metadata?.result || {};
  return {
    success: true,
    pending: false,
    failed: false,
    provider: usage.provider || providerResult.provider || providerResult.output?.provider || null,
    model: usage.provider_model || providerResult.model || providerResult.output?.model || null,
    usage,
    output: providerResult.output || providerResult,
    billing: null,
    recovered_from_usage: true,
  };
}

async function durableEvidenceDossierFromStructuredUsage(usage = {}) {
  const providerResult = usage.metadata?.provider_result || usage.metadata?.result || {};
  const payload = object(unwrapResearchOutput(providerResult));
  const citedSources = list(payload.sources)
    .map((source, index) => ({
      id: text(source?.id) || `source-${index + 1}`,
      title: text(source?.title),
      url: canonicalUrl(source?.url),
      publisher: text(source?.publisher),
      source_type: text(source?.source_type || "public_web_source"),
    }))
    .filter((source) => source.url);
  const sources = [];
  for (const source of citedSources.slice(0, 12)) {
    try {
      const read = await runOperatorWebSourceRead({ payload: { url: source.url, max_characters: 12000 } });
      sources.push({
        ...source,
        title: text(read.title) || source.title,
        url: canonicalUrl(read.final_url || read.source_url || source.url) || source.url,
        excerpt: text(read.content),
        retrieved_at: read.retrieved_at || new Date().toISOString(),
      });
    } catch {
      // A stale/unreachable citation cannot be used as durable recovered evidence.
    }
  }
  if (!sources.length) return null;
  return {
    usage_id: null,
    researched_at: usage.updated_at || usage.created_at || new Date().toISOString(),
    output_text: sources.map((source) => `${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n"),
    sources,
    raw: { contract: "CREATIVE_RECOVERED_PUBLIC_EVIDENCE_V1", structured_usage_id: usage.id || null, sources },
  };
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
    [identity, planObjective("company_truth")].filter(Boolean).join(" "),
    [identity, planObjective("brand_reputation")].filter(Boolean).join(" "),
    [industry, planObjective("market_competition")].filter(Boolean).join(" "),
    [industry, planObjective("audience_context")].filter(Boolean).join(" "),
    [industry, planObjective("creative_precedent")].filter(Boolean).join(" "),
    ...fragments.slice(0, 2).map((fragment) => [industry || identity, fragment].filter(Boolean).join(" ")),
    [identity, ...missionGrounding].filter(Boolean).join(" "),
    ...benchmarkTargets.map((target) => `${target} official film campaign making of cinematography sound editing`),
  ].map((value) => text(value, 1200)).filter(Boolean))].slice(0, 12);
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

function reportPayload(report = {}) {
  const metadata = object(report.metadata);
  return {
    summary: report.summary || "",
    company_resolution: metadata.company_resolution || {},
    company_truth: metadata.company_truth || {},
    brand_intelligence: metadata.brand_intelligence || {},
    audience: report.audience || {},
    competitor_analysis: metadata.competitor_analysis || { competitors: list(report.competitors) },
    market: metadata.market || { trends: list(report.trends) },
    commercial_intelligence: metadata.commercial_intelligence || {},
    messaging: report.messaging || {},
    strategic_synthesis: metadata.strategic_synthesis || {},
    creative_grounding: metadata.creative_grounding || {},
    creative_opportunities: metadata.creative_opportunities || [],
    recommendations: list(report.recommendations),
    trends: list(report.trends),
    keywords: list(report.keywords),
    sources: list(metadata.sources),
    claims: list(metadata.claims),
    confidence: Number(report.confidence || 0),
  };
}

function benchmarkTargetsFromPlan(plan = []) {
  return list(plan)
    .filter((item) => text(item?.id).toLowerCase() === "benchmark_reference_films")
    .flatMap((item) => list(item?.subjects))
    .map((value) => text(value, 260))
    .filter(Boolean);
}

async function collectBenchmarkEvidence({ context, plan, currentDate }) {
  const targets = benchmarkTargetsFromPlan(plan);
  const sources = [];
  for (const target of targets) {
    const query = `${target.replace(/[_-]+/g, " ")} official film campaign cinematography editing sound`;
    const found = await searchPublicWeb(query).catch(() => []);
    for (const candidate of found.slice(0, 2)) {
      if (sources.some((source) => canonicalUrl(source.url) === canonicalUrl(candidate.url))) continue;
      try {
        const read = await runOperatorWebSourceRead({ payload: { url: candidate.url, max_characters: 2200 } });
        const excerpt = text(read?.content, 900);
        if (!excerpt) continue;
        sources.push({
          id: `benchmark-source-${sources.length + 1}`,
          title: text(read?.title || candidate.title, 300),
          url: text(read?.final_url || candidate.url, 1600),
          publisher: (() => { try { return new URL(read?.final_url || candidate.url).hostname; } catch { return ""; } })(),
          source_type: "benchmark_web_source",
          excerpt,
          retrieved_at: text(read?.retrieved_at || currentDate),
        });
        break;
      } catch {}
    }
  }
  if (sources.length < Math.min(3, targets.length)) {
    throw new Error(`CREATIVE_BENCHMARK_EVIDENCE_INSUFFICIENT:${sources.length}`);
  }
  return { researched_at: currentDate, sources };
}

function compactBenchmarkPrompt({ targets = [], sources = [] } = {}) {
  return `Return exactly one JSON object with key benchmark_lab. Study only the declared benchmark films from the supplied evidence. Extract transferable craft mechanisms, never protected execution or imitation instructions.\n\nTARGETS\n${JSON.stringify(targets)}\n\nEVIDENCE\n${JSON.stringify(sources.map((source) => ({ id: source.id, title: source.title, url: source.url, excerpt: source.excerpt })))}\n\nREQUIRED SHAPE\n{"benchmark_lab":{"contract":"CREATIVE_BENCHMARK_LAB_V1","studies":[{"title":"","source_ref":"","analysis":{"narrative":"","editing":"","cinematography":"","visual_beauty":"","humanity":"","place":"","sound":"","production_craft":""},"craft_scores":{}}],"craft_dna":{"transferable_principles":[],"anti_copy_rules":[],"sound_principles":[],"editorial_principles":[],"cinematography_principles":[]}}}\n\nRequirements: return exactly one study for every declared TARGET that has supplied EVIDENCE; do not omit a target when its evidence source is present. Keep the studies in TARGET order. Each analysis field must be concrete and at least 40 characters; source_ref must copy an evidence id or URL exactly; at least 8 transferable principles and at least 3 rules/principles in every anti-copy, sound, editorial and cinematography list. Do not add any keys outside benchmark_lab.`;
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
      const localRepair = localResearchSynthesisEnabled();
      const repairPrompt = localRepair
        ? compactLocalResearchPrompt({ context, plan, policy, currentDate, dossier })
        : researchRepairPrompt({ priorPayload, dossier, context, policy, currentDate });
      const estimatedRepairInputTokens = localRepair
        ? Math.max(1, Math.ceil(repairPrompt.length / 3.2))
        : 16000;
      repairResult = await awaitResearchExecution(await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: localRepair ? "avantiqo-intelligence" : approval.provider,
        category: "CREATIVE_RESEARCH",
        input: {
          instructions_text: localRepair
            ? "Return one complete compact research JSON object from supplied context and evidence only. Preserve evidence; do not invent facts or URLs."
            : "Return one compact JSON repair object. Use only supplied evidence. No invented facts, URLs, media rights, geography, or competitors.",
          prompt: repairPrompt,
          response_format: { type: "json_object" },
          max_output_tokens: localRepair ? 2200 : 3000,
          quantity: 1,
          currency: approval.currency || undefined,
          ...(localRepair
            ? {
                execution_lane: "deep",
                local_compute_required: true,
                infrastructure_policy: "local_only",
              }
            : {}),
        },
        cost_guard: {
          maximum_customer_price: budget.remaining,
          currency: approval.currency || "THB",
          estimated_input_tokens: estimatedRepairInputTokens,
          estimated_output_tokens: localRepair ? 2200 : 3000,
          estimated_quantity: 1,
          reference: `${approval.id}:STRUCTURED_REPAIR`,
        },
        provider_policy: {
          allowed_providers: [localRepair ? "avantiqo-intelligence" : approval.provider],
          preferred_providers: [localRepair ? "avantiqo-intelligence" : approval.provider],
          preferred_models: localRepair ? [AVANTIQO_INTELLIGENCE_LOCAL_MODEL] : approval.model ? [approval.model] : [],
          ...(localRepair
            ? {
                allowed_models: [AVANTIQO_INTELLIGENCE_LOCAL_MODEL],
                execution_scope: "BENCHMARK_REVIEW_PREVIEW",
                benchmark_only: true,
                owned_only_required: true,
                external_fallback_allowed: false,
                studio_preproduction_review: true,
              }
            : {}),
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
      const merged = localRepair
        ? bindLocalResearchEvidence(patch, dossier, context)
        : mergeResearchRepair({ priorPayload, patch, dossier });
      let validated = normalizeAndValidateResearch({
        result: merged,
        raw: repairResult?.output?.raw || repairResult,
        policy,
        context_identity: contextIdentity,
        researched_at: currentDate,
      });
      validated = validateEvidenceBinding(validated, dossier, context);
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
      const maximumApproved = finite(approval.maximum_customer_price, 0);
      const approvalHasRemainingBudget = spend + 0.000001 < maximumApproved;
      await updateResearchApproval(scopedProject, approval, {
        approved: approvalHasRemainingBudget,
        status: "REPAIR_FAILED",
        retry_required: true,
        repair_of_usage_id: priorUsage.id,
        repair_usage_id: repairResult?.usage?.id || null,
        charged_customer_price: spend,
        consumed_at: approvalHasRemainingBudget ? null : new Date().toISOString(),
        approval_reusable_after_failure_with_remaining_budget: approvalHasRemainingBudget,
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
    const benchmarkTargets = benchmarkTargetsFromPlan(plan);
    const benchmarkBaseReport = policy.require_benchmark_lab
      ? existing.find((report) => report?.metadata?.validation?.passed === true && !report?.metadata?.creative_grounding?.benchmark_lab)
      : null;

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
      if (benchmarkBaseReport && benchmarkTargets.length) {
        const benchmarkEvidence = await collectBenchmarkEvidence({ context, plan, currentDate });
        const budget = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
        const prompt = compactBenchmarkPrompt({ targets: benchmarkTargets, sources: benchmarkEvidence.sources });
        // Reserve conservatively for compact structured reasoning. The provider may emit
        // hidden/structured-finalization tokens beyond the visible JSON length, so a tiny
        // reservation can underfund an otherwise valid result and fail at settlement.
        // This remains bounded by the existing Research approval aggregate ceiling.
        const estimatedInput = Math.max(3000, Math.ceil(prompt.length / 3));
        const estimatedOutput = 3600;
        const benchmarkResult = await awaitResearchExecution(await ServiceExecutionRuntime.execute({
          organization_id,
          service_id: "ai.reasoning.execute",
          provider_id: approval.provider,
          category: "CREATIVE_RESEARCH",
          input: {
            instructions_text: "Return exactly one compact JSON object containing benchmark_lab only. Use only supplied evidence.",
            prompt,
            response_format: { type: "json_object" },
            max_output_tokens: estimatedOutput,
            quantity: 1,
            currency: approval.currency || undefined,
          },
          cost_guard: {
            maximum_customer_price: budget.remaining,
            currency: approval.currency || "THB",
            estimated_input_tokens: estimatedInput,
            estimated_output_tokens: estimatedOutput,
            estimated_quantity: 1,
            reference: `${approval.id}:BENCHMARK_ENRICHMENT`,
          },
          provider_policy: {
            allowed_providers: [approval.provider],
            preferred_providers: [approval.provider],
            preferred_models: approval.model ? [approval.model] : [],
            selection_weights: { preference: 1, quality: 0, speed: 0, reliability: 0, cost: 0 },
          },
          metadata: {
            module: "CREATIVE",
            operation: "AUTONOMOUS_RESEARCH_V4_BENCHMARK_ENRICHMENT",
            creative_mission_id: mission.id || null,
            creative_project_id: project.id,
            research_approval_id: approval.id || null,
            research_phase: "BENCHMARK_ENRICHMENT",
          },
        }), {
          organization_id,
          metadata: {
            module: "CREATIVE",
            operation: "AUTONOMOUS_RESEARCH_V4_BENCHMARK_ENRICHMENT_SETTLE",
            creative_project_id: project.id,
            research_approval_id: approval.id || null,
          },
        });
        const parsed = unwrapResearchOutput(benchmarkResult);
        const benchmarkLab = object(parsed?.benchmark_lab);
        if (!Object.keys(benchmarkLab).length) throw new Error("CREATIVE_BENCHMARK_LAB_JSON_REQUIRED");
        const base = reportPayload(benchmarkBaseReport);
        const mergedSources = [...list(base.sources), ...benchmarkEvidence.sources].filter((source, index, all) =>
          all.findIndex((candidate) => canonicalUrl(candidate?.url) === canonicalUrl(source?.url)) === index
        );
        let validated = normalizeAndValidateResearch({
          result: {
            ...base,
            creative_grounding: { ...object(base.creative_grounding), benchmark_lab: benchmarkLab },
            sources: mergedSources,
          },
          policy,
          context_identity: contextIdentity,
          researched_at: currentDate,
        });
        if (policy.mode !== "CREATIVE_GROUNDING") validated = validateResolvedOrganization(validated, organizationIdentity);
        const spend = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
        const report = await ResearchRuntime.create(reportDocument({
          validated,
          contextIdentity,
          organizationIdentity,
          policy,
          result: benchmarkResult,
          plan,
          project: scopedProject,
          brief,
          dossier: { usage_id: null, researched_at: currentDate, sources: mergedSources },
          evidenceReused: true,
        }));
        await updateResearchApproval(scopedProject, approval, {
          approved: true,
          status: "COMPLETED",
          structured_usage_id: benchmarkResult?.usage?.id || null,
          research_report_id: report.id,
          completed_at: new Date().toISOString(),
          charged_customer_price: spend.spent,
          retry_required: false,
          validation_error: null,
          evidence_reused: true,
        });
        return report;
      }

      const priorStructuredUsages = await matchingStructuredSynthesisUsages({
        organization_id,
        project_id: project.id,
        approval_id: approval.id,
      });
      for (const priorUsage of priorStructuredUsages) {
        let recoveredDossier = null;
        try {
          recoveredDossier = await durableEvidenceDossierFromStructuredUsage(priorUsage);
          if (!recoveredDossier) continue;
          if (policy.mode !== "CREATIVE_GROUNDING" && !evidenceMatchesOrganization(recoveredDossier, organizationIdentity)) continue;
          let recoveredValidation = normalizeAndValidateResearch({
            result: priorUsage.metadata?.provider_result || priorUsage.metadata?.result,
            policy,
            context_identity: contextIdentity,
            researched_at: recoveredDossier.researched_at || currentDate,
          });
          const durableUrls = new Set(
            list(recoveredDossier.sources)
              .map((source) => canonicalUrl(source?.url))
              .filter(Boolean),
          );
          recoveredValidation = normalizeAndValidateResearch({
            result: {
              ...recoveredValidation,
              sources: list(recoveredValidation.sources).filter((source) =>
                !source?.url || source?.internal || durableUrls.has(canonicalUrl(source.url)),
              ),
            },
            policy,
            context_identity: contextIdentity,
            researched_at: recoveredDossier.researched_at || currentDate,
          });
          recoveredValidation = validateEvidenceBinding(recoveredValidation, recoveredDossier, context);
          if (policy.mode !== "CREATIVE_GROUNDING") {
            recoveredValidation = validateResolvedOrganization(recoveredValidation, organizationIdentity);
          }
          dossier = recoveredDossier;
          structuredResult = structuredResultFromUsage(priorUsage);
          evidenceReused = true;
          break;
        } catch {
          if (policy.require_benchmark_lab) {
            try {
              const recoveredPayload = object(unwrapResearchOutput(priorUsage.metadata?.provider_result || priorUsage.metadata?.result));
              const grounding = object(recoveredPayload.creative_grounding || recoveredPayload.creativeGrounding);
              const allowedSourceIds = new Set(list(recoveredDossier.sources).map((source) => text(source?.id)).filter(Boolean));
              const allowedSourceUrls = new Set(list(recoveredDossier.sources).map((source) => canonicalUrl(source?.url)).filter(Boolean));
              let safeReferences = list(grounding.reference_candidates || grounding.referenceCandidates).filter((reference) => {
                const sourceId = text(reference?.source_id || reference?.sourceId);
                const sourceUrl = canonicalUrl(reference?.source_url || reference?.sourceUrl);
                return (sourceId && allowedSourceIds.has(sourceId)) || (sourceUrl && allowedSourceUrls.has(sourceUrl));
              });
              if (!safeReferences.length) {
                const groundingSource = list(recoveredDossier.sources).find((source) => source?.official || source?.primary) || list(recoveredDossier.sources)[0];
                if (groundingSource?.id && groundingSource?.url) {
                  safeReferences = [{
                    id: "research-grounding-reference-1",
                    subject: text(groundingSource.title) || text(organizationIdentity.canonical_name) || "Primary research grounding",
                    role: "PRIMARY_REAL_WORLD_GROUNDING",
                    media_kind: "SOURCE_PAGE",
                    source_id: groundingSource.id,
                    source_url: groundingSource.url,
                    media_url: groundingSource.url,
                    source_type: groundingSource.source_type || "public_web_source",
                    confidence: 95,
                    selection_status: "SUPPORTING",
                    rights_status: "REFERENCE_ONLY",
                    notes: "Evidence-backed grounding source retained from the original research dossier.",
                  }];
                }
              }
              const durableUrls = new Set(list(recoveredDossier.sources).map((source) => canonicalUrl(source?.url)).filter(Boolean));
              const durableSources = list(recoveredPayload.sources).filter((source) =>
                !source?.url || source?.internal || durableUrls.has(canonicalUrl(source.url))
              );
              const relaxedPolicy = {
                ...policy,
                require_benchmark_lab: false,
                minimum_benchmark_studies: 0,
              };
              let relaxedValidation = normalizeAndValidateResearch({
                result: {
                  ...recoveredPayload,
                  sources: durableSources,
                  creative_grounding: {
                    ...grounding,
                    reference_candidates: safeReferences,
                  },
                },
                policy: relaxedPolicy,
                context_identity: contextIdentity,
                researched_at: recoveredDossier.researched_at || currentDate,
              });
              relaxedValidation = validateEvidenceBinding(relaxedValidation, recoveredDossier, context);
              if (policy.mode !== "CREATIVE_GROUNDING") {
                relaxedValidation = validateResolvedOrganization(relaxedValidation, organizationIdentity);
              }
              dossier = recoveredDossier;
              structuredResult = {
                ...recoveredPayload,
                sources: durableSources,
                creative_grounding: {
                  ...grounding,
                  reference_candidates: safeReferences,
                },
              };
              evidenceReused = true;
              break;
            } catch {
              // Fall through to a fresh synthesis only when the non-benchmark base is also invalid.
            }
          }
          // A stored provider success is reusable only when its cited evidence can be re-read and revalidated.
        }
      }

      if (!dossier) {
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
          if (policy.mode !== "CREATIVE_GROUNDING" && !evidenceMatchesOrganization(dossier, organizationIdentity)) {
            throw new Error("CREATIVE_RESEARCH_WEB_EVIDENCE_IDENTITY_MISMATCH");
          }
        }
      }

      const budgetBeforeSynthesis = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
      if (!structuredResult && budgetBeforeSynthesis.remaining <= 0) throw new Error("CREATIVE_RESEARCH_APPROVED_COST_EXCEEDED:0");
      const synthesisSystemInstruction = policy.mode === "CREATIVE_GROUNDING"
        ? "Return exactly one valid JSON object matching the requested schema. This is a creative-grounding mission: prioritize verified real-world identity, spatial order, route direction, selected references, continuity constraints and uncertainty. Use only supplied evidence. Do not invent external facts, URLs, coordinates, roads, turns or landmarks."
        : "Return exactly one valid JSON object matching the requested schema. Use only the supplied authoritative context and web evidence. Do not invent external facts or URLs.";
      const synthesisPrompt = policy.mode === "CREATIVE_GROUNDING"
        ? structuredCreativeGroundingPrompt({ context, policy, currentDate, dossier })
        : structuredResearchPrompt({ context, plan, policy, currentDate, dossier });
      // Retry reservations must price the work we are actually about to execute, not the
      // original approval quote's worst-case token envelope. The approved amount remains
      // the hard aggregate cap; actual settlement still cannot exceed the remaining budget.
      const localSynthesis = localResearchSynthesisEnabled();
      const effectiveSynthesisPrompt = localSynthesis
        ? compactLocalResearchPrompt({ context, plan, policy, currentDate, dossier })
        : synthesisPrompt;
      const estimatedSynthesisInputTokens = localSynthesis
        ? Math.max(1, Math.ceil(effectiveSynthesisPrompt.length / 3.2))
        : Math.max(12000, Math.ceil(effectiveSynthesisPrompt.length / 3));
      const estimatedSynthesisOutputTokens = localSynthesis ? 3000 : 12000;
      if (!structuredResult) structuredResult = await awaitResearchExecution(await ServiceExecutionRuntime.execute({
        organization_id,
        service_id: "ai.reasoning.execute",
        provider_id: localSynthesis ? "avantiqo-intelligence" : approval.provider,
        category: "CREATIVE_RESEARCH",
        input: {
          instructions_text: localSynthesis
            ? "Return one complete compact research JSON object from supplied governed context and evidence only. Preserve evidence; do not invent facts or URLs."
            : synthesisSystemInstruction,
          prompt: effectiveSynthesisPrompt,
          response_format: { type: "json_object" },
          max_output_tokens: estimatedSynthesisOutputTokens,
          quantity: 1,
          currency: approval.currency || undefined,
          ...(localSynthesis
            ? {
                execution_lane: "deep",
                local_compute_required: true,
                infrastructure_policy: "local_only",
              }
            : {}),
        },
        cost_guard: {
          maximum_customer_price: budgetBeforeSynthesis.remaining,
          currency: approval.currency || "THB",
          estimated_input_tokens: estimatedSynthesisInputTokens,
          estimated_output_tokens: estimatedSynthesisOutputTokens,
          estimated_quantity: 1,
          reference: `${approval.id}:STRUCTURED_SYNTHESIS`,
        },
        provider_policy: {
          allowed_providers: [localSynthesis ? "avantiqo-intelligence" : approval.provider],
          preferred_providers: [localSynthesis ? "avantiqo-intelligence" : approval.provider],
          preferred_models: localSynthesis ? [AVANTIQO_INTELLIGENCE_LOCAL_MODEL] : approval.model ? [approval.model] : [],
          ...(localSynthesis
            ? {
                allowed_models: [AVANTIQO_INTELLIGENCE_LOCAL_MODEL],
                execution_scope: "BENCHMARK_REVIEW_PREVIEW",
                benchmark_only: true,
                owned_only_required: true,
                external_fallback_allowed: false,
                studio_preproduction_review: true,
              }
            : {}),
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

      let finalDossier = dossier;
      let finalResult = structuredResult;
      if (policy.require_benchmark_lab && benchmarkTargets.length) {
        const basePayload = object(unwrapResearchOutput(structuredResult));
        const grounding = object(basePayload.creative_grounding || basePayload.creativeGrounding);
        const allowedSourceIds = new Set(list(dossier.sources).map((source) => text(source?.id)).filter(Boolean));
        const allowedSourceUrls = new Set(list(dossier.sources).map((source) => canonicalUrl(source?.url)).filter(Boolean));
        const safeReferences = list(grounding.reference_candidates || grounding.referenceCandidates).filter((reference) => {
          const sourceId = text(reference?.source_id || reference?.sourceId);
          const sourceUrl = canonicalUrl(reference?.source_url || reference?.sourceUrl);
          return (sourceId && allowedSourceIds.has(sourceId)) || (sourceUrl && allowedSourceUrls.has(sourceUrl));
        });
        const benchmarkEvidence = await collectBenchmarkEvidence({ context, plan, currentDate });
        const budget = await assertApprovalSpend({ organization_id, project_id: project.id, approval });
        const prompt = compactBenchmarkPrompt({ targets: benchmarkTargets, sources: benchmarkEvidence.sources });
        const estimatedInput = Math.max(3000, Math.ceil(prompt.length / 3));
        const estimatedOutput = 3600;
        const benchmarkResult = await awaitResearchExecution(await ServiceExecutionRuntime.execute({
          organization_id,
          service_id: "ai.reasoning.execute",
          provider_id: approval.provider,
          category: "CREATIVE_RESEARCH",
          input: {
            instructions_text: "Return exactly one compact JSON object containing benchmark_lab only. Use only supplied evidence.",
            prompt,
            response_format: { type: "json_object" },
            max_output_tokens: estimatedOutput,
            quantity: 1,
            currency: approval.currency || undefined,
          },
          cost_guard: {
            maximum_customer_price: budget.remaining,
            currency: approval.currency || "THB",
            estimated_input_tokens: estimatedInput,
            estimated_output_tokens: estimatedOutput,
            estimated_quantity: 1,
            reference: `${approval.id}:BENCHMARK_ENRICHMENT`,
          },
          provider_policy: {
            allowed_providers: [approval.provider],
            preferred_providers: [approval.provider],
            preferred_models: approval.model ? [approval.model] : [],
            selection_weights: { preference: 1, quality: 0, speed: 0, reliability: 0, cost: 0 },
          },
          metadata: {
            module: "CREATIVE",
            operation: "AUTONOMOUS_RESEARCH_V4_BENCHMARK_ENRICHMENT",
            creative_mission_id: mission.id || null,
            creative_project_id: project.id,
            research_approval_id: approval.id || null,
            research_phase: "BENCHMARK_ENRICHMENT",
          },
        }), {
          organization_id,
          metadata: {
            module: "CREATIVE",
            operation: "AUTONOMOUS_RESEARCH_V4_BENCHMARK_ENRICHMENT_SETTLE",
            creative_project_id: project.id,
            research_approval_id: approval.id || null,
          },
        });
        const benchmarkLab = object(unwrapResearchOutput(benchmarkResult)?.benchmark_lab);
        if (!Object.keys(benchmarkLab).length) throw new Error("CREATIVE_BENCHMARK_LAB_JSON_REQUIRED");
        const benchmarkReferences = benchmarkEvidence.sources.map((source, index) => ({
          id: `benchmark-reference-${index + 1}`,
          subject: text(source.title) || benchmarkTargets[index] || `Benchmark ${index + 1}`,
          role: "CRAFT_BENCHMARK_EVIDENCE",
          media_kind: "FILM_REFERENCE",
          source_id: source.id,
          source_url: source.url,
          media_url: source.url,
          source_type: source.source_type || "benchmark_web_source",
          confidence: 90,
          selection_status: "SUPPORTING",
          rights_status: "REFERENCE_ONLY",
          notes: "Evidence-backed craft benchmark only; protected execution must not be copied.",
        }));
        const mergedSources = [...list(basePayload.sources), ...benchmarkEvidence.sources].filter((source, index, all) =>
          all.findIndex((candidate) => canonicalUrl(candidate?.url) === canonicalUrl(source?.url)) === index
        );
        finalDossier = {
          ...dossier,
          sources: [...list(dossier.sources), ...benchmarkEvidence.sources].filter((source, index, all) =>
            all.findIndex((candidate) => canonicalUrl(candidate?.url) === canonicalUrl(source?.url)) === index
          ),
        };
        finalResult = {
          ...basePayload,
          creative_grounding: {
            ...grounding,
            reference_candidates: [...safeReferences, ...benchmarkReferences],
            benchmark_lab: benchmarkLab,
          },
          sources: mergedSources,
        };
      }

      if (localSynthesis) {
        finalResult = bindLocalResearchEvidence(
          object(unwrapResearchOutput(finalResult)),
          finalDossier,
          context,
        );
      }

      let validated = normalizeAndValidateResearch({
        result: finalResult,
        raw: null,
        policy,
        context_identity: contextIdentity,
        researched_at: finalDossier.researched_at || currentDate,
      });
      const finalDurableUrls = new Set(
        list(finalDossier.sources)
          .map((source) => canonicalUrl(source?.url))
          .filter(Boolean),
      );
      validated = normalizeAndValidateResearch({
        result: {
          ...validated,
          sources: list(validated.sources).filter((source) =>
            !source?.url || source?.internal || finalDurableUrls.has(canonicalUrl(source.url)),
          ),
        },
        policy,
        context_identity: contextIdentity,
        researched_at: dossier.researched_at || currentDate,
      });
      validated = validateEvidenceBinding(validated, dossier, context);
      if (policy.mode !== "CREATIVE_GROUNDING") {
        validated = validateResolvedOrganization(validated, organizationIdentity);
      }

      const report = await ResearchRuntime.create(reportDocument({
        validated,
        contextIdentity,
        organizationIdentity,
        policy,
        result: structuredResult,
        plan,
        project: scopedProject,
        brief,
        dossier: finalDossier,
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
        validation_error: null,
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
      const maximumApproved = finite(approval.maximum_customer_price, 0);
      const approvalHasRemainingBudget = spend + 0.000001 < maximumApproved;
      await updateResearchApproval(scopedProject, approval, {
        approved: approvalHasRemainingBudget,
        status: message.includes("VALIDATION") || message.includes("JSON_REQUIRED") || message.includes("SOURCE_BINDING")
          ? "VALIDATION_FAILED"
          : "EXECUTION_FAILED",
        consumed_at: approvalHasRemainingBudget ? null : new Date().toISOString(),
        evidence_usage_id: dossier?.usage_id || null,
        structured_usage_id: structuredResult?.usage?.id || null,
        charged_customer_price: spend,
        validation_error: message,
        retry_required: true,
        approval_reusable_after_failure_with_remaining_budget: approvalHasRemainingBudget,
        evidence_reused: evidenceReused,
      }).catch(() => null);
      const failure = new Error(`CREATIVE_RESEARCH_RETRY_REQUIRED:${message}`);
      failure.cause = error;
      failure.validation = error?.validation || null;
      throw failure;
    }
  },
};
