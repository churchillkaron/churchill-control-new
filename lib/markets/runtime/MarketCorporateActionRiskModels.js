const MATERIAL_TYPES = new Set([
  "reverse_split",
  "forward_split",
  "unit_split",
  "stock_dividend",
  "spin_off",
  "cash_merger",
  "stock_merger",
  "stock_and_cash_merger",
  "redemption",
  "worthless_removal",
  "rights_distribution",
  "partial_call",
  "reorganization",
]);

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function utcDay(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function evaluateCorporateActionRisk({
  policy = {},
  corporateActions = [],
  side,
  now = new Date(),
}) {
  const normalizedSide = String(side || "").trim().toUpperCase();
  if (normalizedSide === "SELL") {
    return {
      approved: true,
      reasons: [],
      metrics: {
        side: normalizedSide,
        known_material_events: 0,
        coverage_guaranteed: false,
        de_risking_allowed: true,
      },
    };
  }

  if (normalizedSide !== "BUY" || policy.block_corporate_action_buys === false) {
    return {
      approved: true,
      reasons: [],
      metrics: {
        side: normalizedSide,
        known_material_events: 0,
        coverage_guaranteed: false,
        corporate_action_gate_enabled: policy.block_corporate_action_buys !== false,
      },
    };
  }

  const beforeDays = Math.max(0, number(policy.corporate_action_blackout_days_before, 3));
  const afterDays = Math.max(0, number(policy.corporate_action_blackout_days_after, 1));
  const today = utcDay(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const material = (Array.isArray(corporateActions) ? corporateActions : [])
    .filter((row) => MATERIAL_TYPES.has(String(row?.action_type || "").toLowerCase()))
    .map((row) => {
      const eventDay = utcDay(row?.event_date || row?.ex_date || row?.process_date);
      return {
        row,
        eventDay,
        days_until_event: today !== null && eventDay !== null
          ? (eventDay - today) / dayMs
          : null,
      };
    })
    .filter(({ eventDay }) => eventDay !== null);

  const activeBlackouts = material.filter(({ days_until_event: daysUntil }) => (
    daysUntil !== null &&
    daysUntil <= beforeDays &&
    daysUntil >= -afterDays
  ));

  const reasons = activeBlackouts.map(({ row, days_until_event: daysUntil }) => (
    "Known " +
    String(row.action_type || "corporate action").replaceAll("_", " ") +
    " event is inside the configured blackout window (" +
    daysUntil +
    " days from event date)."
  ));

  return {
    approved: activeBlackouts.length === 0,
    reasons,
    metrics: {
      side: normalizedSide,
      known_material_events: material.length,
      active_blackout_events: activeBlackouts.length,
      blackout_days_before: beforeDays,
      blackout_days_after: afterDays,
      coverage_guaranteed: false,
      active_events: activeBlackouts.map(({ row, days_until_event: daysUntil }) => ({
        provider_action_id: row.provider_action_id || null,
        action_type: row.action_type || null,
        event_date: row.event_date || row.ex_date || row.process_date || null,
        days_until_event: daysUntil,
      })),
    },
  };
}

export const MarketCorporateActionRiskModels = {
  evaluate: evaluateCorporateActionRisk,
  materialTypes: MATERIAL_TYPES,
};
