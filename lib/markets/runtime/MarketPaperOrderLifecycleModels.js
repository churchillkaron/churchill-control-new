function time(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function effectivePaperOrderExpiry({
  timeInForce = "DAY",
  marketNextClose = null,
  decisionExpiresAt = null,
}) {
  const tif = String(timeInForce || "DAY").toUpperCase();
  const decisionExpiry = time(decisionExpiresAt);
  const sessionClose = time(marketNextClose);

  if (tif === "DAY") {
    const candidates = [sessionClose, decisionExpiry].filter((value) => value !== null);
    return candidates.length ? new Date(Math.min(...candidates)).toISOString() : null;
  }

  return decisionExpiry !== null ? new Date(decisionExpiry).toISOString() : null;
}

export function evaluatePaperOrderLifecycle({
  order,
  decision,
  now = new Date(),
}) {
  const nowMs = new Date(now).getTime();
  const orderExpiry = time(order?.expires_at);
  const decisionExpiry = time(decision?.expires_at);

  if (decisionExpiry !== null && decisionExpiry <= nowMs) {
    return {
      active: false,
      status: "EXPIRED",
      reason: "GOVERNED_DECISION_EXPIRED",
      effective_expiry: new Date(decisionExpiry).toISOString(),
    };
  }

  if (orderExpiry !== null && orderExpiry <= nowMs) {
    return {
      active: false,
      status: "EXPIRED",
      reason: "ORDER_TIF_EXPIRED",
      effective_expiry: new Date(orderExpiry).toISOString(),
    };
  }

  return {
    active: true,
    status: order?.status || "QUEUED",
    reason: null,
    effective_expiry: orderExpiry !== null
      ? new Date(orderExpiry).toISOString()
      : decisionExpiry !== null
        ? new Date(decisionExpiry).toISOString()
        : null,
  };
}
