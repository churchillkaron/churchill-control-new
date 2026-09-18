function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value) {
  return String(value ?? "").trim();
}

function positive(value) {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function splitRatioFromPayload(payload = {}) {
  const direct = positive(
    payload.split_ratio
    ?? payload.ratio,
  );
  if (direct !== null && direct !== 1) {
    return { ratio: direct, source: "direct_ratio" };
  }

  const newRate = positive(
    payload.new_rate
    ?? payload.new_shares
    ?? payload.numerator,
  );
  const oldRate = positive(
    payload.old_rate
    ?? payload.old_shares
    ?? payload.denominator,
  );
  if (newRate !== null && oldRate !== null) {
    const ratio = newRate / oldRate;
    if (ratio > 0 && ratio !== 1) {
      return { ratio, source: "new_rate_over_old_rate" };
    }
  }

  return { ratio: null, source: null };
}

function cashRateFromPayload(payload = {}) {
  const candidates = [
    ["rate", payload.rate],
    ["cash_rate", payload.cash_rate],
    ["per_share_amount", payload.per_share_amount],
    ["amount_per_share", payload.amount_per_share],
  ];
  for (const [source, value] of candidates) {
    const parsed = positive(value);
    if (parsed !== null) return { rate: parsed, source };
  }
  return { rate: null, source: null };
}

export function normalizeCorporateActionAdjustment(action = {}) {
  const type = clean(action.action_type).toLowerCase();
  const payload = action.raw_payload && typeof action.raw_payload === "object"
    ? action.raw_payload
    : {};

  if (["forward_split", "reverse_split", "unit_split"].includes(type)) {
    const split = splitRatioFromPayload(payload);
    return {
      supported: true,
      adjustment_type: "SPLIT",
      action_type: type,
      effective_date: dateOnly(
        action.event_date
        || action.ex_date
        || payload.ex_date
        || payload.effective_date
        || action.process_date,
      ),
      entitlement_date: null,
      split_ratio: split.ratio,
      split_ratio_source: split.source,
      cash_rate: null,
      cash_rate_source: null,
      unresolved_reason: split.ratio === null
        ? "SPLIT_RATIO_NOT_PROVEN"
        : null,
    };
  }

  if (type === "cash_dividend") {
    const cash = cashRateFromPayload(payload);
    const exDate = dateOnly(action.ex_date || payload.ex_date);
    const payableDate = dateOnly(
      action.payable_date
      || payload.payable_date
      || action.event_date
      || action.process_date,
    );
    const reasons = [];
    if (cash.rate === null) reasons.push("CASH_RATE_NOT_PROVEN");
    if (!exDate) reasons.push("EX_DATE_NOT_PROVEN");
    if (!payableDate) reasons.push("PAYABLE_DATE_NOT_PROVEN");

    return {
      supported: true,
      adjustment_type: "CASH_DIVIDEND",
      action_type: type,
      effective_date: payableDate,
      entitlement_date: exDate,
      split_ratio: null,
      split_ratio_source: null,
      cash_rate: cash.rate,
      cash_rate_source: cash.source,
      unresolved_reason: reasons.length ? reasons.join(";") : null,
    };
  }

  return {
    supported: false,
    adjustment_type: "UNSUPPORTED",
    action_type: type || "unknown",
    effective_date: dateOnly(action.event_date || action.process_date),
    entitlement_date: null,
    split_ratio: null,
    split_ratio_source: null,
    cash_rate: null,
    cash_rate_source: null,
    unresolved_reason: "ACCOUNTING_ADJUSTMENT_TYPE_UNSUPPORTED",
  };
}

export function paperQuantityFromFills({
  fills = [],
  symbol,
  beforeTime,
}) {
  const ticker = clean(symbol).toUpperCase();
  const cutoff = new Date(beforeTime || 0).getTime();
  if (!ticker || !Number.isFinite(cutoff)) return null;

  let quantity = 0;
  const rows = (Array.isArray(fills) ? fills : [])
    .filter((row) => clean(row.symbol).toUpperCase() === ticker)
    .filter((row) => {
      const time = new Date(row.filled_at || 0).getTime();
      return Number.isFinite(time) && time < cutoff;
    })
    .sort((left, right) => new Date(left.filled_at) - new Date(right.filled_at));

  for (const row of rows) {
    const amount = positive(row.quantity);
    if (amount === null) continue;
    const side = clean(row.side).toUpperCase();
    if (side === "BUY") quantity += amount;
    if (side === "SELL") quantity -= amount;
  }

  return Math.max(0, quantity);
}

export function corporateActionIsDue({
  normalized,
  now = new Date(),
}) {
  const effective = dateOnly(normalized?.effective_date);
  const today = dateOnly(now);
  if (!effective || !today) return false;
  return effective <= today;
}

export function sameOrLaterFillExists({
  fills = [],
  symbol,
  eventDate,
}) {
  const ticker = clean(symbol).toUpperCase();
  const day = dateOnly(eventDate);
  if (!ticker || !day) return false;
  const start = new Date(day + "T00:00:00.000Z").getTime();

  return (Array.isArray(fills) ? fills : []).some((row) => {
    if (clean(row.symbol).toUpperCase() !== ticker) return false;
    const filled = new Date(row.filled_at || 0).getTime();
    return Number.isFinite(filled) && filled >= start;
  });
}
