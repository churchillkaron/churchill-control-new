import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

async function loadOrganizationIdentity(project = {}, supplied = {}) {
  if (text(supplied.name || supplied.legal_name)) {
    return supplied;
  }

  const organizationId = text(project.organization_id);
  if (!organizationId) return supplied;

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`CREATIVE_RESEARCH_ORGANIZATION_LOOKUP_FAILED:${error.message}`);
  }

  return data || supplied;
}

export async function buildResearchPlan(
  project = {},
  brief = {},
  organizationIdentity = {},
) {
  // A creative project title is not a company identity. Resolve the authoritative organization
  // record instead, while still allowing an explicitly supplied company/brand identity for work
  // produced on behalf of a named brand.
  const organization = await loadOrganizationIdentity(
    project,
    organizationIdentity,
  );

  const namedCompany = text(
    organization.name ||
    organization.legal_name ||
    project.metadata?.company_name ||
    project.metadata?.organization_name ||
    brief.company_name ||
    brief.metadata?.company_name,
  );

  return [
    {
      id: "company_resolution",
      objective: "Resolve the exact real-world company identity before any external conclusions are drawn.",
      required: true,
      evidence: [
        "official website or verified first-party presence",
        "location, products or services that match internal context",
        "explicit ambiguity report when multiple businesses match",
      ],
      subject: namedCompany || null,
    },
    {
      id: "company_truth",
      objective: "Establish what the company actually offers, where it operates, what it can prove and what remains uncertain.",
      required: true,
      evidence: [
        "official product or service pages",
        "official business listing or first-party operating information",
        "current public claims classified by verification status",
      ],
    },
    {
      id: "brand_reputation",
      objective: "Understand the current brand voice, visual identity, public reputation, strengths and inconsistencies.",
      required: true,
      evidence: [
        "official website and social channels",
        "uploaded Avantiqo brand assets and analysis",
        "reputable reviews or coverage where available",
      ],
    },
    {
      id: "market_competition",
      objective: "Map the current competitive field, category conventions, whitespace and credible differentiation opportunities.",
      required: true,
      evidence: [
        "current competitor sites and public offers",
        "category pricing, positioning and message patterns",
        "source-backed opportunity or saturation signals",
      ],
    },
    {
      id: "audience_context",
      objective: "Understand the likely audience context, needs, language and decision criteria without inventing demographic facts.",
      required: true,
      evidence: [
        "first-party audience evidence when available",
        "current reviews, community language or public discussion",
        "clear separation between evidence and inference",
      ],
    },
    {
      id: "cultural_context",
      objective: "Identify current cultural, geographic, seasonal and platform context that can materially affect creative strategy.",
      required: true,
      evidence: [
        "current local or category signals",
        "current platform or format behavior where relevant",
        "dated sources for time-sensitive claims",
      ],
    },
    {
      id: "creative_precedent",
      objective: "Study current high-performing creative patterns and category precedents without copying protected campaigns or artist identity.",
      required: true,
      evidence: [
        "current campaign examples or first-party creative references",
        "observable execution patterns",
        "original strategic implications rather than imitation instructions",
      ],
    },
    {
      id: "constraints_and_risks",
      objective: "Identify claims, rights, compliance, reputational and operational risks that should constrain the creative system.",
      required: true,
      evidence: [
        "source-backed claim limitations",
        "rights or licensing constraints",
        "operational facts that must not be invented",
      ],
    },
  ];
}
