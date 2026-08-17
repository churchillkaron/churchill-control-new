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
    .select(
      "id,name,legal_name,industry,address,country,organization_type,status,organization_status",
    )
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
        "customer praise and complaints from attributable public sources",
      ],
    },
    {
      id: "audience",
      objective: "Identify real audience motivations, objections, buying triggers, channel behaviour and language customers use.",
      required: true,
      evidence: [
        "customer or community language",
        "market or category evidence",
        "internal brief and audience context",
      ],
    },
    {
      id: "competition",
      objective: "Identify direct and indirect competitors, their positioning, offers, strengths, weaknesses and repeated creative patterns.",
      required: true,
      evidence: [
        "direct competitor first-party sources",
        "current offers or positioning",
        "market gaps and overused category conventions",
      ],
    },
    {
      id: "market",
      objective: "Understand current market conditions, culture, seasonality, location context, events, risks and timing opportunities.",
      required: true,
      evidence: [
        "recent credible market or news sources",
        "local or cultural context where relevant",
        "retrieval and publication dates",
      ],
    },
    {
      id: "commercial_diagnosis",
      objective: "Determine the strongest evidence-backed offer, conversion action, commercial barriers and measurable outcome.",
      required: true,
      evidence: [
        "verified company capability",
        "audience need or tension",
        "competitive whitespace",
      ],
    },
    {
      id: "creative_whitespace",
      objective: "Recommend original strategic territories that follow the evidence without writing the final story or campaign.",
      required: true,
      evidence: [
        "company proof",
        "audience tension",
        "market or cultural opportunity",
        "clear differentiation from competitor creative patterns",
      ],
    },
    {
      id: "claims_governance",
      objective: "Classify which facts may be used publicly, which need owner verification and which must not enter creative output.",
      required: true,
      evidence: [
        "source-linked claims",
        "confidence and verification status",
        "freshness or expiry where the fact may change",
      ],
    },
  ];
}