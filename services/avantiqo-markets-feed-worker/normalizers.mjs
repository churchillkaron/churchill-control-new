function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeStockStreamMessage(message) {
  const type = text(message?.T);
  const symbol = text(message?.S).toUpperCase();
  if (!symbol || !["t", "q", "b"].includes(type)) return null;

  if (type === "t") {
    return {
      type: "TRADE",
      symbol,
      timestamp: message.t || new Date().toISOString(),
      patch: {
        latest_trade_price: number(message.p),
        latest_trade_size: number(message.s),
      },
      raw: message,
    };
  }

  if (type === "q") {
    return {
      type: "QUOTE",
      symbol,
      timestamp: message.t || new Date().toISOString(),
      patch: {
        bid_price: number(message.bp),
        bid_size: number(message.bs),
        ask_price: number(message.ap),
        ask_size: number(message.as),
      },
      raw: message,
    };
  }

  return {
    type: "BAR",
    symbol,
    timestamp: message.t || new Date().toISOString(),
    patch: {
      minute_open: number(message.o),
      minute_high: number(message.h),
      minute_low: number(message.l),
      minute_close: number(message.c),
      minute_volume: number(message.v),
    },
    bar: {
      symbol,
      timeframe: "1Min",
      bar_time: message.t,
      open: number(message.o),
      high: number(message.h),
      low: number(message.l),
      close: number(message.c),
      volume: number(message.v),
      trade_count: number(message.n),
      vwap: number(message.vw),
      raw_payload: message,
    },
    raw: message,
  };
}

export function normalizeNewsStreamMessage(message) {
  const type = text(message?.T);
  if (type !== "n") return null;
  const symbols = Array.isArray(message.symbols)
    ? message.symbols.map((value) => text(value).toUpperCase()).filter(Boolean)
    : [];
  if (!message.id || !symbols.length) return null;

  return {
    id: String(message.id),
    headline: text(message.headline),
    summary: text(message.summary),
    author: text(message.author) || null,
    created_at: message.created_at || null,
    updated_at: message.updated_at || null,
    url: text(message.url) || null,
    symbols,
    source: text(message.source) || "alpaca_news",
    raw_payload: message,
  };
}

export function mergeSnapshotState(previous = {}, normalized) {
  if (!normalized) return previous;
  return {
    ...previous,
    symbol: normalized.symbol,
    captured_at: normalized.timestamp,
    ...(normalized.patch || {}),
    raw_payload: {
      ...(previous.raw_payload || {}),
      [normalized.type.toLowerCase()]: normalized.raw,
    },
  };
}
