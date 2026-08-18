function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function lower(value) {
  return text(value).toLowerCase();
}

function firstNumber(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function outcomeMetrics(performance = {}) {
  const revenue = firstNumber(performance, [
    "attributed_revenue",
    "revenue",
    "actual_revenue",
    "conversion_value",
    "purchase_value",
  ]);
  const grossProfit = firstNumber(performance, [
    "attributed_gross_profit",
    "gross_profit",
    "contribution_margin",
  ]);
  const conversions = firstNumber(performance, [
    "qualified_conversions",
    "qualified_leads",
    "bookings",
    "reservations",
    "sales",
    "conversions",
  ]);
  const leads = firstNumber(performance, [
    "leads",
    "inquiries",
    "messages",
  ]);
  const spend = firstNumber(performance, [
    "spend",
    "actual_spend",
    "media_spend",
    "cost",
  ]);

  return {
    revenue,
    gross_profit: grossProfit,
    conversions,
    leads,
    spend,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    cost_per_conversion: spend > 0 && conversions > 0 ? spend / conversions : null,
    lead_to_conversion_rate:
      leads > 0 && conversions > 0 ? conversions / leads : null,
  };
}

function classifyObjective(content = {}, campaign = {}) {
  const haystack = lower([
    content.goal,
    content.offer,
    content.primary_cta,
    campaign.campaign_name,
  ].filter(Boolean).join(" "));

  if (/booking|reservation|reserve|visit|direction/.test(haystack)) return "BOOKING_OR_VISIT";
  if (/lead|inquiry|inspection|quote|audit|demo|contact|message/.test(haystack)) return "QUALIFIED_LEAD";
  if (/sale|purchase|revenue|order|contract|deposit/.test(haystack)) return "REVENUE";
  return "BUSINESS_OUTCOME";
}

function recommendedNorthStar(objectiveType) {
  switch (objectiveType) {
    case "REVENUE":
      return "Attributed gross profit per advertising baht";
    case "BOOKING_OR_VISIT":
      return "Cost per completed booking or verified visit, then revenue per booking";
    case "QUALIFIED_LEAD":
      return "Cost per qualified opportunity, then close rate and attributed revenue";
    default:
      return "Cost per qualified business outcome and attributed economic value";
  }
}

function campaignDecision(member) {
  const campaign = member?.campaign || {};
  const content = campaign.campaign_content || {};
  const performance = campaign.performance_metrics || {};
  const metrics = outcomeMetrics(performance);
  const budget = number(campaign.budget);
  const objectiveType = classifyObjective(content, campaign);
  const assets = list(campaign.assets);
  const measurement = list(content.measurement);
  const channels = list(content.channels);

  const blockers = [];
  const opportunities = [];

  if (!measurement.length) {
    blockers.push("No explicit business-outcome measurement contract is configured.");
  }
  if (!metrics.conversions && !metrics.revenue) {
    blockers.push("No closed-loop conversion or revenue signal is available yet.");
  }
  if (!metrics.spend) {
    blockers.push("Actual provider spend has not been reconciled into campaign performance yet.");
  }
  if (!assets.length) {
    blockers.push("No campaign creative is attached.");
  }
  if (!channels.length) {
    blockers.push("No execution channel is configured.");
  }

  if (metrics.roas !== null && metrics.roas >= 3) {
    opportunities.push("Strong economic signal: prepare a controlled scale test, subject to spend authorization.");
  } else if (metrics.roas !== null && metrics.roas < 1) {
    opportunities.push("Economic return is weak: protect budget and test offer, audience or creative before scaling.");
  }

  if (metrics.lead_to_conversion_rate !== null && metrics.lead_to_conversion_rate < 0.1) {
    opportunities.push("Lead quality or follow-up is weak: optimize the conversion path, not only the ad.");
  }

  if (assets.length === 1) {
    opportunities.push("Only one creative is active: prepare controlled concept variants to avoid creative fatigue and false conclusions.");
  }

  const evidenceScore = [
    measurement.length > 0,
    metrics.spend > 0,
    metrics.conversions > 0,
    metrics.revenue > 0,
    assets.length >= 2,
    channels.length > 0,
  ].filter(Boolean).length;

  let decision = "LEARN";
  if (metrics.roas !== null && metrics.roas >= 3 && metrics.conversions >= 3) decision = "SCALE_CANDIDATE";
  if (metrics.roas !== null && metrics.roas < 1 && metrics.spend > 0) decision = "REPAIR_BEFORE_SCALE";
  if (metrics.cost_per_conversion !== null && metrics.conversions >= 3 && metrics.revenue === 0) {
    decision = "PROVE_VALUE_BEFORE_SCALE";
  }

  return {
    organization_id: member.organization_id,
    organization_name: member.organization?.name || "Organization",
    campaign_id: campaign.id,
    campaign_name: campaign.campaign_name,
    budget,
    objective_type: objectiveType,
    north_star_metric: recommendedNorthStar(objectiveType),
    evidence_score: evidenceScore,
    evidence_max: 6,
    decision,
    metrics,
    blockers,
    opportunities,
    experimentation: {
      principle: "Change one major variable at a time and compare business outcomes, not vanity engagement.",
      next_tests: [
        "Offer / CTA test",
        "Creative concept test",
        "Audience or intent-segment test",
      ],
      scale_gate: "Do not scale until conversion quality and economic value are measured with sufficient evidence.",
    },
  };
}

function rankScaleCandidates(campaigns) {
  return [...campaigns]
    .filter((item) => item.decision === "SCALE_CANDIDATE")
    .sort((a, b) => {
      const aRoas = a.metrics.roas ?? -1;
      const bRoas = b.metrics.roas ?? -1;
      if (bRoas !== aRoas) return bRoas - aRoas;
      return b.metrics.conversions - a.metrics.conversions;
    });
}

export function buildAdsPortfolioIntelligence(group = {}) {
  const members = list(group.members);
  const campaigns = members.map(campaignDecision);
  const masterBudget = number(group.budget || group.campaign_content?.total_monthly_budget_thb);
  const organizationBudget = campaigns.reduce((sum, item) => sum + item.budget, 0);
  const scaleCandidates = rankScaleCandidates(campaigns);
  const repairCandidates = campaigns.filter((item) => item.decision === "REPAIR_BEFORE_SCALE");
  const blindCampaigns = campaigns.filter((item) => item.evidence_score <= 2);

  const totalSpend = campaigns.reduce((sum, item) => sum + item.metrics.spend, 0);
  const totalRevenue = campaigns.reduce((sum, item) => sum + item.metrics.revenue, 0);
  const totalGrossProfit = campaigns.reduce((sum, item) => sum + item.metrics.gross_profit, 0);
  const totalConversions = campaigns.reduce((sum, item) => sum + item.metrics.conversions, 0);

  const portfolioRoas = totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null;

  const actions = [];
  if (blindCampaigns.length) {
    actions.push({
      priority: "CRITICAL",
      action: "CLOSE_MEASUREMENT_LOOP",
      reason: `${blindCampaigns.length} campaign(s) lack enough economic evidence for safe optimization.`,
      organizations: blindCampaigns.map((item) => item.organization_name),
    });
  }
  if (repairCandidates.length) {
    actions.push({
      priority: "HIGH",
      action: "REPAIR_BEFORE_MORE_SPEND",
      reason: `${repairCandidates.length} campaign(s) show weak measured return and should be repaired before scaling.`,
      organizations: repairCandidates.map((item) => item.organization_name),
    });
  }
  if (scaleCandidates.length) {
    actions.push({
      priority: "MEDIUM",
      action: "PREPARE_SCALE_PROPOSAL",
      reason: "Measured winners exist. Prepare a controlled budget-increase proposal; do not move or increase spend without authorization.",
      organizations: scaleCandidates.map((item) => item.organization_name),
    });
  }

  if (!actions.length) {
    actions.push({
      priority: "MEDIUM",
      action: "RUN_LEARNING_CYCLE",
      reason: "The portfolio is still in learning mode. Gather conversion quality, revenue and experiment evidence before scaling.",
      organizations: campaigns.map((item) => item.organization_name),
    });
  }

  return {
    version: "ads-intelligence-v1",
    operating_model: "ONE_ENGINE_SEPARATE_BRAND_EXECUTION",
    objective: "Maximize verified business value from marketing while preserving organization identity, budget ownership and spend authorization boundaries.",
    portfolio: {
      master_budget: masterBudget,
      organization_media_budget: organizationBudget,
      measured_spend: totalSpend,
      attributed_revenue: totalRevenue,
      attributed_gross_profit: totalGrossProfit,
      qualified_outcomes: totalConversions,
      roas: portfolioRoas,
    },
    campaigns,
    ranked_scale_candidates: scaleCandidates.map((item) => ({
      organization_id: item.organization_id,
      organization_name: item.organization_name,
      campaign_id: item.campaign_id,
      roas: item.metrics.roas,
      conversions: item.metrics.conversions,
    })),
    executive_actions: actions,
    governance: {
      can_analyze: true,
      can_recommend: true,
      can_prepare_experiments: true,
      can_prepare_creative: true,
      can_move_budget_without_authorization: false,
      can_increase_spend_without_authorization: false,
      can_activate_paid_provider_without_authorization: false,
    },
    world_class_principles: [
      "Optimize for qualified business outcomes, revenue and gross profit instead of vanity engagement.",
      "Feed CRM and offline outcomes back into ad-platform measurement when integrations are available.",
      "Separate brand execution while sharing intelligence, experimentation and operating discipline.",
      "Treat creative as a measurable system of hypotheses, not a stream of unrelated assets.",
      "Use portfolio-level capital allocation recommendations while preserving organization-level financial authorization.",
      "Prefer evidence-based scale decisions and explicitly represent uncertainty when data is insufficient.",
    ],
  };
}
