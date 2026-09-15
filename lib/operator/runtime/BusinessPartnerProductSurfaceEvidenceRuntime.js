import snapshot from "../generated/BusinessPartnerProductSurfaceEvidence.generated.json" with { type: "json" };

export const BUSINESS_PARTNER_PRODUCT_SURFACE_EVIDENCE_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_PRODUCT_SURFACE_EVIDENCE_V1";

const SURFACE_TERMS = {
  finance: ["finance", "accounting", "accountant", "invoice", "bank", "ledger", "trial balance", "payable", "receivable"],
  people: ["people", "staff", "employee", "payroll", "attendance", "schedule"],
  supply_chain: ["supply chain", "inventory", "stock", "supplier", "purchase", "recipe", "costing"],
  operations: ["operations", "restaurant", "hotel", "pos", "booking", "reservation", "work order"],
  commercial: ["commercial", "customer", "quotation", "sales", "marketing", "campaign"],
  documents: ["document", "pdf", "spreadsheet", "excel", "csv", "file"],
  creative: ["creative", "studio", "video", "image", "music", "audio", "render", "production"],
  administration: ["administration", "admin", "role", "permission", "integration"],
  analytics: ["analytics", "dashboard", "report", "kpi", "metric"],
  business_partner: ["business partner", "operator", "chat", "conversation", "assistant"],
  platform: ["platform", "workspace", "navigation", "registry", "home"],
};

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}
function tokens(value) {
  return [...new Set(text(value).toLowerCase().match(/[a-z0-9_/-]{3,}/g) || [])];
}
function surfaceScore(message, surface) {
  const lower = text(message).toLowerCase();
  return (SURFACE_TERMS[surface] || []).reduce(
    (score, term) => score + (lower.includes(term) ? (term.includes(" ") ? 5 : 3) : 0),
    0,
  );
}
function entryScore(entry, queryTokens, query) {
  const path = text(entry?.path).toLowerCase();
  const excerpt = text(entry?.excerpt);
  const haystack = `${path} ${excerpt}`.toLowerCase();
  let score = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
  const uiIntent = /\b(ui|ux|mobile|screen|page|layout|navigation|workflow|flow|form|table|responsive)\b/i.test(text(query));
  const auditIntent = /\b(check|inspect|review|audit|status|missing|incorrect|wrong|broken|gap|incomplete|problem|issue|fix)\b/i.test(text(query));
  const structuralGap = /\b(?:todo|fixme|not implemented|placeholder)\b/i.test(excerpt) || /return\s+null\s*;/.test(excerpt);
  if (path.startsWith("components/")) score += uiIntent ? 8 : 3;
  if (path.startsWith("app/")) score += uiIntent ? 6 : 2;
  if (uiIntent && /(?:page|layout|workspace|overview|workcenter|form|table|mobile|responsive)/i.test(path)) score += 5;
  if (auditIntent && structuralGap) score += 12;
  return score;
}

export function readBusinessPartnerProductSurfaceEvidence({ message, max_files = 10 } = {}) {
  const query = text(message, 8000);
  const rankedSurfaces = Object.keys(SURFACE_TERMS)
    .map((surface) => ({ surface, score: surfaceScore(query, surface) }))
    .sort((a, b) => b.score - a.score || a.surface.localeCompare(b.surface));
  const bestScore = rankedSurfaces[0]?.score || 0;
  const selectedSurfaces = bestScore > 0
    ? rankedSurfaces.filter((entry) => entry.score === bestScore).slice(0, 2).map((entry) => entry.surface)
    : ["platform", "business_partner"];
  const queryTokens = tokens(query);
  const candidates = selectedSurfaces.flatMap((surface) =>
    (snapshot?.surfaces?.[surface] || []).map((entry) => ({ ...entry, surface })),
  );
  const evidence = candidates
    .map((entry) => ({ ...entry, relevance_score: entryScore(entry, queryTokens, query) }))
    .sort((a, b) => b.relevance_score - a.relevance_score || a.path.localeCompare(b.path))
    .slice(0, Math.max(1, Math.min(16, Number(max_files) || 10)));

  return {
    success: true,
    contract: BUSINESS_PARTNER_PRODUCT_SURFACE_EVIDENCE_CONTRACT,
    evidence_class: "SOURCE_EVIDENCE_ONLY",
    repository_head: snapshot?.repository_head || null,
    generated_at: snapshot?.generated_at || null,
    selected_surfaces: selectedSurfaces,
    query,
    files: evidence,
    verification: {
      current_source_snapshot: true,
      tests_run: false,
      browser_verified: false,
      runtime_verified: false,
      deployment_verified: false,
      business_state_verified: false,
    },
    disclaimer: snapshot?.disclaimer || "Source evidence only.",
  };
}

export default readBusinessPartnerProductSurfaceEvidence;
