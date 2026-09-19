import crypto from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fingerprint(parts) {
  return crypto.createHash("sha256").update(parts.map((value) => String(value ?? "")).join("|")).digest("hex");
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
        latest_trade_at: message.t || null,
        latest_trade_id: message.i === undefined || message.i === null ? null : String(message.i),
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
        latest_quote_at: message.t || null,
        latest_quote_fingerprint: fingerprint([
          "alpaca", symbol, message.t, message.bp, message.bs, message.ap, message.as,
          message.bx, message.ax, message.c, message.z,
        ]),
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
  const incomingMs = new Date(normalized.timestamp || 0).getTime();
  const quoteMs = new Date(previous.latest_quote_at || 0).getTime();
  const tradeMs = new Date(previous.latest_trade_at || 0).getTime();

  if (
    normalized.type === "QUOTE" &&
    Number.isFinite(quoteMs) && quoteMs > 0 &&
    Number.isFinite(incomingMs) && incomingMs <= quoteMs
  ) {
    return previous;
  }
  if (
    normalized.type === "TRADE" &&
    Number.isFinite(tradeMs) && tradeMs > 0 &&
    Number.isFinite(incomingMs) && incomingMs <= tradeMs
  ) {
    return previous;
  }

  const capturedMs = new Date(previous.captured_at || 0).getTime();
  const capturedAt = Number.isFinite(incomingMs) && (
    !Number.isFinite(capturedMs) || capturedMs <= 0 || incomingMs > capturedMs
  )
    ? normalized.timestamp
    : previous.captured_at;

  return {
    ...previous,
    symbol: normalized.symbol,
    captured_at: capturedAt,
    ...(normalized.patch || {}),
    raw_payload: {
      ...(previous.raw_payload || {}),
      [normalized.type.toLowerCase()]: normalized.raw,
    },
  };
}
