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
const OPEN_PUBLIC_EVIDENCE_POLICY = "OPEN_PUBLIC_EVIDENCE";
const PROHIBITED_OWNED_EVIDENCE_HOSTS = Object.freeze(["iso.org"]);

function openEvidenceSource({ id, url, title, publisher, sourceType }) {
  return Object.freeze({
    id,
    url,
    title,
    publisher,
    source_type: sourceType,
    official: true,
    primary: true,
    evidence_use_policy: OPEN_PUBLIC_EVIDENCE_POLICY,
  });
}

const SHARED_SOURCES = Object.freeze({
  oasisUbl: openEvidenceSource({
    id: "oasis-ubl-2-3",
    url: "https://docs.oasis-open.org/ubl/UBL-2.3.html",
    title: "Universal Business Language 2.3",
    publisher: "OASIS Open",
    sourceType: "official_standard",
  }),
  w3cProv: openEvidenceSource({
    id: "w3c-prov-o",
    url: "https://www.w3.org/TR/prov-o/",
    title: "PROV-O: The PROV Ontology",
    publisher: "W3C",
    sourceType: "official_standard",
  }),
  govCommercial: openEvidenceSource({
    id: "commercial-govs-008",
    url: "https://www.gov.uk/government/publications/government-functional-standard-govs-008-commercial-and-commercial-continuous-improvement-assessment-framework/government-functional-standard-govs-008-commercial-html",
    title: "Government Functional Standard GovS 008: Commercial",
    publisher: "UK Government Commercial Function",
    sourceType: "official_standard",
  }),
  govSourcing: openEvidenceSource({
    id: "commercial-sourcing-playbook",
    url: "https://www.gov.uk/government/publications/the-sourcing-and-consultancy-playbooks/the-sourcing-playbook-html",
    title: "The Sourcing Playbook",
    publisher: "UK Cabinet Office",
    sourceType: "official_guidance",
  }),
});

const OWNED_RESEARCH_SOURCES_BY_DOMAIN = Object.freeze({
  finance: Object.freeze([
    openEvidenceSource({
      id: "finance-govs-006",
      url: "https://www.gov.uk/government/publications/government-finance-standards-page",
      title: "Government Functional Standard GovS 006: Finance",
      publisher: "UK Government Finance Function and HM Treasury",
      sourceType: "official_standard",
    }),
    SHARED_SOURCES.oasisUbl,
    SHARED_SOURCES.w3cProv,
  ]),
  "product-design": Object.freeze([
    openEvidenceSource({
      id: "product-wcag-2-2",
      url: "https://www.w3.org/TR/WCAG22/",
      title: "Web Content Accessibility Guidelines 2.2",
      publisher: "W3C",
      sourceType: "official_standard",
    }),
    openEvidenceSource({
      id: "product-aria-apg",
      url: "https://www.w3.org/WAI/ARIA/apg/",
      title: "ARIA Authoring Practices Guide",
      publisher: "W3C",
      sourceType: "official_guidance",
    }),
    openEvidenceSource({
      id: "product-wai-forms",
      url: "https://www.w3.org/WAI/tutorials/forms/",
      title: "WAI Forms Tutorial",
      publisher: "W3C",
      sourceType: "official_guidance",
    }),
  ]),
  "supply-chain": Object.freeze([
    SHARED_SOURCES.govCommercial,
    SHARED_SOURCES.govSourcing,
    SHARED_SOURCES.oasisUbl,
  ]),
  commercial: Object.freeze([
    SHARED_SOURCES.govCommercial,
    SHARED_SOURCES.govSourcing,
    SHARED_SOURCES.oasisUbl,
  ]),
  people: Object.freeze([
    openEvidenceSource({
      id: "people-govs-003",
      url: "https://www.gov.uk/government/publications/government-functional-standard-govs-003-human-resources/govenment-functional-standard-govs-003-people",
      title: "Government Functional Standard GovS 003: People",
      publisher: "UK Cabinet Office",
      sourceType: "official_standard",
    }),
    openEvidenceSource({
      id: "people-ilo-isco",
      url: "https://isco.ilo.org/",
      title: "International Standard Classification of Occupations",
      publisher: "International Labour Organization",
      sourceType: "official_standard",
    }),
    openEvidenceSource({
      id: "people-esco",
      url: "https://esco.ec.europa.eu/en/classification",
      title: "European Skills, Competences, Qualifications and Occupations",
      publisher: "European Commission",
      sourceType: "official_standard",
    }),
  ]),
  projects: Object.freeze([
    openEvidenceSource({
      id: "projects-govs-002",
      url: "https://www.gov.uk/government/publications/project-delivery-functional-standard",
      title: "Government Functional Standard GovS 002: Project Delivery",
      publisher: "UK Government Project Delivery and Cabinet Office",
      sourceType: "official_standard",
    }),
    SHARED_SOURCES.govSourcing,
    SHARED_SOURCES.w3cProv,
  ]),
  integrations: Object.freeze([
    openEvidenceSource({
      id: "integrations-openapi",
      url: "https://spec.openapis.org/oas/latest.html",
      title: "OpenAPI Specification",
      publisher: "OpenAPI Initiative",
      sourceType: "official_standard",
    }),
    openEvidenceSource({
      id: "integrations-rfc-9110",
      url: "https://www.rfc-editor.org/rfc/rfc9110.html",
      title: "RFC 9110 HTTP Semantics",
      publisher: "RFC Editor",
      sourceType: "official_standard",
    }),
    openEvidenceSource({
      id: "integrations-rfc-9457",
      url: "https://www.rfc-editor.org/rfc/rfc9457.html",
      title: "RFC 9457 Problem Details for HTTP APIs",
      publisher: "RFC Editor",
      sourceType: "official_standard",
    }),
  ]),
  intelligence: Object.freeze([
    openEvidenceSource({
      id: "intelligence-nist-ai-rmf",
      url: "https://www.nist.gov/itl/ai-risk-management-framework",
      title: "NIST AI Risk Management Framework",
      publisher: "National Institute of Standards and Technology",
      sourceType: "official_standard",
    }),
    openEvidenceSource({
      id: "intelligence-nist-generative-ai-profile",
      url: "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence",
      title: "NIST AI RMF Generative AI Profile",
      publisher: "National Institute of Standards and Technology",
      sourceType: "official_standard",
    }),
    SHARED_SOURCES.w3cProv,
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

function sourceId(seed, index) {
  return text(seed?.id, 120) || `source-${index + 1}`;
}

function assertAllowedEvidenceUrl(value, id) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_URL_INVALID:${id}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_HTTPS_REQUIRED:${id}`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const prohibited = PROHIBITED_OWNED_EVIDENCE_HOSTS.find(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
  if (prohibited) {
    throw new Error(`AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_POLICY_BLOCKED:${id}:${prohibited}`);
  }
}

function assertAllowedEvidenceSeed(seed, id) {
  if (seed?.evidence_use_policy !== OPEN_PUBLIC_EVIDENCE_POLICY) {
    throw new Error(`AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_POLICY_REQUIRED:${id}`);
  }
  if (seed?.official !== true || seed?.primary !== true) {
    throw new Error(`AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_GOVERNANCE_REQUIRED:${id}`);
  }
  assertAllowedEvidenceUrl(seed?.url, id);
}

function failureDiagnostics(failures) {
  return failures
    .map((failure) => `${failure.source_id}=${failure.error}`)
    .join("|")
    .slice(0, 1_200);
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
    const id = sourceId(seed, index);
    try {
      assertAllowedEvidenceSeed(seed, id);
      const result = await sourceReader({
        payload: {
          url: seed.url,
          max_characters: MAXIMUM_SOURCE_CHARACTERS,
        },
      });
      const evidence = text(result?.content, MAXIMUM_EVIDENCE_CHARACTERS);
      if (!evidence) throw new Error("AVANTIQO_OWNED_WEB_EVIDENCE_SOURCE_CONTENT_REQUIRED");
      const finalUrl = text(result?.final_url || result?.source_url || seed.url, 2_000);
      assertAllowedEvidenceUrl(finalUrl, id);
      sources.push({
        id,
        url: finalUrl,
        title: text(result?.title || seed.title, 500) || null,
        publisher: seed.publisher,
        published_at: null,
        excerpt: evidence,
        source_type: seed.source_type,
        official: seed.official === true,
        primary: seed.primary === true,
        evidence_use_policy: seed.evidence_use_policy,
        retrieved_at: text(result?.retrieved_at, 120) || new Date().toISOString(),
        content_hash_sha256: text(result?.content_hash_sha256, 128) || null,
      });
    } catch (error) {
      failures.push({
        source_id: id,
        error: safeErrorCode(error),
      });
    }
  }

  if (sources.length < minimumSources) {
    throw new Error(
      `AVANTIQO_OWNED_WEB_EVIDENCE_MINIMUM_SOURCES_NOT_MET:${sources.length}:${minimumSources}:failures=${failureDiagnostics(failures) || "none"}`,
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
    uncertainty: failures.map((failure) => `${failure.source_id}:${failure.error}`),
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
      failed_sources: failures.map((failure) => ({ ...failure })),
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
