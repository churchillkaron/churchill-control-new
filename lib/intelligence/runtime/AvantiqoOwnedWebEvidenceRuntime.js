import {
  runOperatorWebSourceRead,
} from "../../platform/research/runtime/OperatorWebSourceReadRuntime.js";

export const AVANTIQO_OWNED_WEB_EVIDENCE_CONTRACT =
  "AVANTIQO_OWNED_WEB_EVIDENCE_V1";

const DEFAULT_MINIMUM_SOURCES = 2;
const DEFAULT_MAXIMUM_SOURCES = 8;
const MAXIMUM_SOURCES = 12;
const MAXIMUM_SOURCE_CHARACTERS = 6_000;
const MAXIMUM_EVIDENCE_CHARACTERS = 2_400;

const SHARED_SOURCES = Object.freeze({
  oasisUbl: Object.freeze({
    url: "https://docs.oasis-open.org/ubl/UBL-2.3.html",
    title: "Universal Business Language 2.3",
    publisher: "OASIS Open",
    source_type: "official_standard",
    official: true,
    primary: true,
  }),
  omgBpmn: Object.freeze({
    url: "https://www.omg.org/bpmn/",
    title: "Business Process Model and Notation",
    publisher: "Object Management Group",
    source_type: "official_standard",
    official: true,
    primary: true,
  }),
});

const OWNED_RESEARCH_SOURCES_BY_DOMAIN = Object.freeze({
  finance: Object.freeze([
    Object.freeze({
      url: "https://www.ifrs.org/issued-standards/list-of-standards/conceptual-framework/",
      title: "Conceptual Framework for Financial Reporting",
      publisher: "IFRS Foundation",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    SHARED_SOURCES.oasisUbl,
  ]),
  "product-design": Object.freeze([
    Object.freeze({
      url: "https://www.w3.org/TR/WCAG22/",
      title: "Web Content Accessibility Guidelines 2.2",
      publisher: "W3C",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    Object.freeze({
      url: "https://www.w3.org/WAI/ARIA/apg/",
      title: "ARIA Authoring Practices Guide",
      publisher: "W3C",
      source_type: "official_guidance",
      official: true,
      primary: true,
    }),
  ]),
  "supply-chain": Object.freeze([
    Object.freeze({
      url: "https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard",
      title: "GS1 Global Traceability Standard",
      publisher: "GS1",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    SHARED_SOURCES.oasisUbl,
  ]),
  commercial: Object.freeze([
    SHARED_SOURCES.oasisUbl,
    SHARED_SOURCES.omgBpmn,
  ]),
  people: Object.freeze([
    Object.freeze({
      url: "https://www.iso.org/standard/30414",
      title: "ISO 30414 Human Capital Reporting and Disclosure",
      publisher: "International Organization for Standardization",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    Object.freeze({
      url: "https://www.iso.org/standard/79488.html",
      title: "ISO 30405 Guidelines on Recruitment",
      publisher: "International Organization for Standardization",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
  ]),
  projects: Object.freeze([
    Object.freeze({
      url: "https://www.iso.org/standard/74947.html",
      title: "ISO 21502 Guidance on Project Management",
      publisher: "International Organization for Standardization",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    SHARED_SOURCES.omgBpmn,
  ]),
  integrations: Object.freeze([
    Object.freeze({
      url: "https://spec.openapis.org/oas/latest.html",
      title: "OpenAPI Specification",
      publisher: "OpenAPI Initiative",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    Object.freeze({
      url: "https://www.rfc-editor.org/rfc/rfc9110.html",
      title: "RFC 9110 HTTP Semantics",
      publisher: "RFC Editor",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
  ]),
  intelligence: Object.freeze([
    Object.freeze({
      url: "https://www.nist.gov/itl/ai-risk-management-framework",
      title: "NIST AI Risk Management Framework",
      publisher: "National Institute of Standards and Technology",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
    Object.freeze({
      url: "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence",
      title: "NIST AI RMF Generative AI Profile",
      publisher: "National Institute of Standards and Technology",
      source_type: "official_standard",
      official: true,
      primary: true,
    }),
  ]),
});

const DOMAIN_ALIASES = Object.freeze({
  product: "product-design",
  design: "product-design",
  ux: "product-design",
  supply_chain: "supply-chain",
  supplychain: "supply-chain",
  integration: "integrations",
  api: "integrations",
  hr: "people",
  workforce: "people",
  project: "projects",
  ai: "intelligence",
});

const QUERY_DOMAIN_SIGNALS = Object.freeze([
  ["finance", /\b(account|accounting|invoice|ledger|journal|payable|receivable|financial)\b/i],
  ["product-design", /\b(accessibility|design system|form|table|keyboard|user experience|\bux\b)\b/i],
  ["supply-chain", /\b(procurement|inventory|warehouse|supplier|supply chain|traceability)\b/i],
  ["commercial", /\b(customer|crm|lead|opportunity|quotation|sales|commercial|contract)\b/i],
  ["people", /\b(workforce|human resources|\bhr\b|employee|recruitment|leave|performance)\b/i],
  ["projects", /\b(project|milestone|workstream|dependency|portfolio|programme)\b/i],
  ["integrations", /\b(api|webhook|oauth|http|integration|idempotency|pagination)\b/i],
  ["intelligence", /\b(ai|artificial intelligence|agent|reasoning|model|memory|provenance)\b/i],
]);

function text(value, maximum = 12_000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizedDomain(value) {
  const candidate = text(value, 120).toLowerCase();
  return DOMAIN_ALIASES[candidate] || candidate || null;
}

function inferredDomain(query) {
  const question = text(query, 4_000);
  return QUERY_DOMAIN_SIGNALS.find(([, pattern]) => pattern.test(question))?.[0] || null;
}

function safeErrorCode(error) {
  return text(error?.message || error || "SOURCE_READ_FAILED", 240)
    .replace(/https?:\/\/\S+/gi, "[url]");
}

export function listAvantiqoOwnedResearchSources({ domain, query } = {}) {
  const selectedDomain = normalizedDomain(domain) || inferredDomain(query);
  const sources = list(OWNED_RESEARCH_SOURCES_BY_DOMAIN[selectedDomain]);
  return {
    domain: selectedDomain,
    sources: sources.map((source) => ({ ...source })),
  };
}

export async function collectAvantiqoOwnedWebEvidence({
  context = {},
  payload = {},
  sourceReader = runOperatorWebSourceRead,
} = {}) {
  const organizationId = text(context.organizationId || context.organization_id, 160);
  if (!organizationId) throw new Error("AVANTIQO_OWNED_WEB_EVIDENCE_ORGANIZATION_REQUIRED");

  const query = text(payload.query, 4_000);
  if (!query) throw new Error("AVANTIQO_OWNED_WEB_EVIDENCE_QUERY_REQUIRED");

  const minimumSources = boundedInteger(
    payload.minimum_sources,
    DEFAULT_MINIMUM_SOURCES,
    1,
    8,
  );
  const maximumSources = boundedInteger(
    payload.max_sources,
    DEFAULT_MAXIMUM_SOURCES,
    minimumSources,
    MAXIMUM_SOURCES,
  );
  const registered = listAvantiqoOwnedResearchSources({
    domain: payload.domain,
    query,
  });
  const sourceSeeds = registered.sources.slice(0, maximumSources);
  if (sourceSeeds.length < minimumSources) {
    throw new Error(
      `AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_REGISTRY_INSUFFICIENT:${registered.domain || "unclassified"}:${sourceSeeds.length}:${minimumSources}`,
    );
  }

  const sources = [];
  const failures = [];
  for (const [index, seed] of sourceSeeds.entries()) {
    try {
      const result = await sourceReader({
        payload: {
          url: seed.url,
          max_characters: MAXIMUM_SOURCE_CHARACTERS,
        },
      });
      const evidence = text(result?.content, MAXIMUM_EVIDENCE_CHARACTERS);
      if (!evidence) throw new Error("AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_CONTENT_REQUIRED");
      sources.push({
        id: `source-${index + 1}`,
        url: text(result?.final_url || result?.source_url || seed.url, 2_000),
        title: text(result?.title || seed.title, 500) || null,
        publisher: seed.publisher,
        published_at: null,
        excerpt: evidence,
        source_type: seed.source_type,
        official: seed.official === true,
        primary: seed.primary === true,
        retrieved_at: text(result?.retrieved_at, 120) || new Date().toISOString(),
        content_hash_sha256: text(result?.content_hash_sha256, 128) || null,
      });
    } catch (error) {
      failures.push({
        source_id: `source-${index + 1}`,
        error: safeErrorCode(error),
      });
    }
  }

  if (sources.length < minimumSources) {
    throw new Error(
      `AVANTIQO_OWNED_WEB_EVIDENCE_MINIMUM_SOURCES_NOT_MET:${sources.length}:${minimumSources}`,
    );
  }

  const retrievedAt = new Date().toISOString();
  return {
    contract: AVANTIQO_OWNED_WEB_EVIDENCE_CONTRACT,
    status: "OWNED_PUBLIC_EVIDENCE_COLLECTED",
    query,
    objective: text(payload.objective, 2_000) || null,
    answer: `Collected ${sources.length} governed public source(s) for owned Avantiqo Intelligence reconciliation.`,
    claims: [],
    sources,
    uncertainty: failures.map((failure) => failure.error),
    follow_up_queries: [],
    evidence: {
      provider: "avantiqo-owned-source-reader",
      source_registry_domain: registered.domain,
      source_discovery: "AVANTIQO_OWNED_CURATED_PRIMARY_SOURCE_REGISTRY",
      public_web_sources_read: true,
      internet_search_performed: false,
      search_provider_used: false,
      external_intelligence_provider_used: false,
      openai_used: false,
      returned_source_count: sources.length,
      failed_source_count: failures.length,
      retrieved_at: retrievedAt,
    },
    governance: {
      internet_content_untrusted: true,
      external_evidence_only: true,
      owned_intelligence_only: true,
      external_intelligence_provider_allowed: false,
      authorization_effect: "NONE",
      permission_effect: "NONE",
      scope_effect: "NONE",
      execution_effect: "NONE",
      secrets_allowed: false,
      external_actions_allowed: false,
    },
  };
}

export default collectAvantiqoOwnedWebEvidence;
