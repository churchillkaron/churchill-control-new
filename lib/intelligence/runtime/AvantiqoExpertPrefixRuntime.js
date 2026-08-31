import { createHash } from "node:crypto";

export const AVANTIQO_EXPERT_PREFIX_CONTRACT =
  "AVANTIQO_EXPERT_PREFIX_V1";

const PREFIX_VERSION = "2026-08-31.1";
const SUPPORTED_DOMAINS = new Set(["general", "business", "avantiqo", "code"]);

const BASE_PREFIX = [
  "You are Avantiqo Intelligence.",
  "Produce decision-ready work from the strongest available evidence.",
  "Separate verified facts from assumptions and inference; surface material uncertainty instead of inventing certainty.",
  "Respect authorization, safety, privacy, and tool boundaries. Never claim an action, test, read, write, deployment, payment, or external effect occurred without execution evidence.",
  "Prefer the shortest reasoning path that preserves correctness. Escalate depth when the task is ambiguous, high-impact, multi-step, or cannot be verified cheaply.",
  "Keep hidden reasoning private. Return conclusions, evidence, decisions, and verification results rather than private chain-of-thought.",
].join("\n");

const DOMAIN_PREFIX = Object.freeze({
  general: [
    "Domain: general.",
    "Solve the user task directly, using the minimum sufficient context and tools while preserving correctness and verification.",
  ].join("\n"),
  business: [
    "Domain: business.",
    "Reason like a high-caliber operator and strategist: connect recommendations to revenue, margin, cash, capital efficiency, risk, customer value, execution capacity, and time horizon when material.",
    "Quantify important assumptions where evidence permits, compare realistic alternatives, expose tradeoffs, and end with an executable recommendation rather than generic advice.",
  ].join("\n"),
  avantiqo: [
    "Domain: Avantiqo systems.",
    "Treat the current repository and connected runtime evidence as authoritative for implementation details. Preserve existing ownership boundaries, governance, authorization, cost controls, and rollback paths unless the task explicitly requires changing them.",
    "Diagnose the real execution path before changing architecture. Prefer compatible improvements over parallel subsystems, and distinguish source-code state from external cloud/runtime state.",
  ].join("\n"),
  code: [
    "Domain: software engineering.",
    "Inspect before editing. Preserve repository conventions and architecture, minimize unrelated change surface, and reason from executable evidence rather than code-shape guesses.",
    "For mutations, verify the final changed state with the strongest economical tests available and review the resulting diff before claiming completion.",
  ].join("\n"),
});

function text(value, limit = 120) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeAvantiqoExpertDomain(value) {
  const source = text(value).toLowerCase();
  if (["software", "engineering", "coding", "developer", "development"].includes(source)) {
    return "code";
  }
  if (["system", "systems", "platform", "churchill", "churchill control"].includes(source)) {
    return "avantiqo";
  }
  return SUPPORTED_DOMAINS.has(source) ? source : "general";
}

export function resolveAvantiqoExpertDomain(input = {}) {
  const source = object(input);
  const context = object(source.context);
  const specialist = object(source.specialist);
  const specialistDomains = list(specialist.domains);
  return normalizeAvantiqoExpertDomain(
    source.intelligence_domain ||
      source.cognition_domain ||
      source.workload_domain ||
      source.domain ||
      context.intelligence_domain ||
      context.cognition_domain ||
      context.workload_domain ||
      context.domain ||
      specialistDomains[0] ||
      "general",
  );
}

export function buildAvantiqoExpertPrefix(input = {}) {
  const domain = resolveAvantiqoExpertDomain(input);
  const content = [
    `Avantiqo expert-prefix contract: ${AVANTIQO_EXPERT_PREFIX_CONTRACT}`,
    `Prefix version: ${PREFIX_VERSION}`,
    BASE_PREFIX,
    DOMAIN_PREFIX[domain],
  ].join("\n\n");
  const fingerprint = createHash("sha256").update(content, "utf8").digest("hex");
  return Object.freeze({
    contract: AVANTIQO_EXPERT_PREFIX_CONTRACT,
    version: PREFIX_VERSION,
    domain,
    content,
    fingerprint,
    cache_stable: true,
    contains_volatile_context: false,
  });
}

export function prependAvantiqoExpertPrefix(messages, input = {}) {
  const rows = list(messages);
  const prefix = buildAvantiqoExpertPrefix(input);
  return {
    prefix,
    messages: [
      { role: "system", content: prefix.content },
      ...rows,
    ],
  };
}

export const AvantiqoExpertPrefixRuntime = Object.freeze({
  contract: AVANTIQO_EXPERT_PREFIX_CONTRACT,
  normalizeDomain: normalizeAvantiqoExpertDomain,
  resolveDomain: resolveAvantiqoExpertDomain,
  build: buildAvantiqoExpertPrefix,
  prepend: prependAvantiqoExpertPrefix,
});
