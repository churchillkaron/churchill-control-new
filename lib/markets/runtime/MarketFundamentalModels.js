function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function daysBetween(start, end) {
  const startMs = new Date(start || 0).getTime();
  const endMs = new Date(end || 0).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function conceptEntries(companyFacts, conceptNames, preferredUnits = ["USD"]) {
  const facts = companyFacts?.facts?.["us-gaap"] || companyFacts?.facts?.["ifrs-full"] || {};
  const names = Array.isArray(conceptNames) ? conceptNames : [conceptNames];

  for (const conceptName of names) {
    const concept = facts?.[conceptName];
    if (!concept?.units) continue;

    for (const unit of preferredUnits) {
      const entries = Array.isArray(concept.units?.[unit]) ? concept.units[unit] : [];
      if (entries.length) {
        return entries.map((entry) => ({
          ...entry,
          concept: conceptName,
          unit,
        }));
      }
    }

    const firstUnit = Object.keys(concept.units || {})[0];
    const entries = firstUnit && Array.isArray(concept.units[firstUnit])
      ? concept.units[firstUnit]
      : [];
    if (entries.length) {
      return entries.map((entry) => ({
        ...entry,
        concept: conceptName,
        unit: firstUnit,
      }));
    }
  }
  return [];
}

function admissible(entry) {
  const form = text(entry?.form).toUpperCase();
  const value = number(entry?.val);
  return ["10-K", "10-Q", "20-F", "6-K"].includes(form)
    && value !== null
    && Boolean(entry?.end);
}

function sortFacts(entries) {
  return [...entries]
    .filter(admissible)
    .sort((left, right) => {
      const endDelta = new Date(right.end).getTime() - new Date(left.end).getTime();
      if (endDelta) return endDelta;
      return new Date(right.filed || 0).getTime() - new Date(left.filed || 0).getTime();
    });
}

function latestFact(companyFacts, concepts, units = ["USD"], periodEnd = null) {
  const entries = sortFacts(conceptEntries(companyFacts, concepts, units));
  if (!periodEnd) return entries[0] || null;
  return entries.find((entry) => entry.end === periodEnd) || null;
}

function latestDurationPair(companyFacts, concepts, units = ["USD"]) {
  const entries = sortFacts(conceptEntries(companyFacts, concepts, units))
    .filter((entry) => entry.start && entry.end);
  const latest = entries[0];
  if (!latest) return { latest: null, previous: null };

  const latestDays = daysBetween(latest.start, latest.end);
  const previous = entries.find((entry) => {
    if (entry.end === latest.end) return false;
    if (text(entry.form).toUpperCase() !== text(latest.form).toUpperCase()) return false;
    const days = daysBetween(entry.start, entry.end);
    if (!latestDays || !days) return true;
    return Math.abs(days - latestDays) <= 14;
  }) || null;

  return { latest, previous };
}

function ratio(numerator, denominator) {
  const a = number(numerator);
  const b = number(denominator);
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function growth(current, previous) {
  const a = number(current);
  const b = number(previous);
  if (a === null || b === null || b === 0) return null;
  return (a - b) / Math.abs(b);
}

function stanceFromScore(score) {
  if (score === null) return "INSUFFICIENT_EVIDENCE";
  if (score > 0.15) return "BULLISH";
  if (score < -0.15) return "BEARISH";
  return "NEUTRAL";
}

export function buildFundamentalSnapshot({
  symbol,
  cik = null,
  companyFacts,
}) {
  const revenuePair = latestDurationPair(companyFacts, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ]);
  const latestRevenue = revenuePair.latest;
  if (!latestRevenue) {
    return {
      symbol,
      cik,
      period_end: null,
      metrics: {},
      ratios: {},
      score: null,
      confidence: 0,
      stance: "INSUFFICIENT_EVIDENCE",
      facts_used: {},
    };
  }

  const periodEnd = latestRevenue.end;
  const revenue = number(latestRevenue.val);
  const previousRevenue = number(revenuePair.previous?.val);
  const netIncomeFact = latestFact(companyFacts, [
    "NetIncomeLoss",
    "ProfitLoss",
  ], ["USD"], periodEnd);
  const operatingIncomeFact = latestFact(companyFacts, [
    "OperatingIncomeLoss",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  ], ["USD"], periodEnd);
  const operatingCashFlowFact = latestFact(companyFacts, [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ], ["USD"], periodEnd);

  const assetsFact = latestFact(companyFacts, ["Assets"], ["USD"], periodEnd);
  const liabilitiesFact = latestFact(companyFacts, ["Liabilities"], ["USD"], periodEnd);
  const currentAssetsFact = latestFact(companyFacts, ["AssetsCurrent"], ["USD"], periodEnd);
  const currentLiabilitiesFact = latestFact(companyFacts, ["LiabilitiesCurrent"], ["USD"], periodEnd);
  const cashFact = latestFact(companyFacts, [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ], ["USD"], periodEnd);

  const revenueGrowth = growth(revenue, previousRevenue);
  const netMargin = ratio(netIncomeFact?.val, revenue);
  const operatingMargin = ratio(operatingIncomeFact?.val, revenue);
  const operatingCashFlowMargin = ratio(operatingCashFlowFact?.val, revenue);
  const liabilitiesToAssets = ratio(liabilitiesFact?.val, assetsFact?.val);
  const currentRatio = ratio(currentAssetsFact?.val, currentLiabilitiesFact?.val);
  const cashToAssets = ratio(cashFact?.val, assetsFact?.val);

  const components = [];
  if (revenueGrowth !== null) components.push({ name: "revenue_growth", weight: 0.24, value: Math.tanh(revenueGrowth * 2.5) });
  if (netMargin !== null) components.push({ name: "net_margin", weight: 0.20, value: Math.tanh(netMargin * 4) });
  if (operatingMargin !== null) components.push({ name: "operating_margin", weight: 0.18, value: Math.tanh(operatingMargin * 4) });
  if (operatingCashFlowMargin !== null) components.push({ name: "operating_cash_flow_margin", weight: 0.18, value: Math.tanh(operatingCashFlowMargin * 3) });
  if (liabilitiesToAssets !== null) components.push({ name: "leverage", weight: 0.10, value: clamp((0.7 - liabilitiesToAssets) / 0.5) });
  if (currentRatio !== null) components.push({ name: "liquidity", weight: 0.06, value: clamp((currentRatio - 1) / 1.5) });
  if (cashToAssets !== null) components.push({ name: "cash_buffer", weight: 0.04, value: clamp((cashToAssets - 0.05) / 0.25) });

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const score = totalWeight > 0
    ? clamp(components.reduce((sum, component) => sum + (component.value * component.weight), 0) / totalWeight)
    : null;
  const coverage = components.length / 7;
  const confidence = score === null
    ? 0
    : clamp(0.35 + (coverage * 0.55), 0, 0.9);

  return {
    symbol,
    cik,
    period_end: periodEnd,
    metrics: {
      revenue,
      previous_revenue: previousRevenue,
      net_income: number(netIncomeFact?.val),
      operating_income: number(operatingIncomeFact?.val),
      operating_cash_flow: number(operatingCashFlowFact?.val),
      assets: number(assetsFact?.val),
      liabilities: number(liabilitiesFact?.val),
      current_assets: number(currentAssetsFact?.val),
      current_liabilities: number(currentLiabilitiesFact?.val),
      cash: number(cashFact?.val),
    },
    ratios: {
      revenue_growth: revenueGrowth,
      net_margin: netMargin,
      operating_margin: operatingMargin,
      operating_cash_flow_margin: operatingCashFlowMargin,
      liabilities_to_assets: liabilitiesToAssets,
      current_ratio: currentRatio,
      cash_to_assets: cashToAssets,
    },
    score,
    confidence,
    stance: stanceFromScore(score),
    facts_used: Object.fromEntries([
      latestRevenue,
      revenuePair.previous,
      netIncomeFact,
      operatingIncomeFact,
      operatingCashFlowFact,
      assetsFact,
      liabilitiesFact,
      currentAssetsFact,
      currentLiabilitiesFact,
      cashFact,
    ].filter(Boolean).map((fact) => [
      fact.concept,
      {
        concept: fact.concept,
        unit: fact.unit,
        end: fact.end,
        start: fact.start || null,
        filed: fact.filed || null,
        form: fact.form || null,
        accn: fact.accn || null,
        val: fact.val,
      },
    ])),
    score_components: components,
  };
}
