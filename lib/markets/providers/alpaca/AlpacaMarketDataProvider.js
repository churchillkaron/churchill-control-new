import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";

const DATA_BASE_URL = "https://data.alpaca.markets";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestTimestamp(...values) {
  const timestamps = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());
  return timestamps[0]?.toISOString() || new Date().toISOString();
}

async function credentialFor(organizationId) {
  const credential = await resolveProviderCredential({
    organization_id: organizationId,
    provider: "alpaca",
  });

  if (!credential) throw new Error("ALPACA_MARKET_DATA_CREDENTIAL_REQUIRED");

  const keyId = text(credential.api_key || credential.key_id || credential.key);
  const secret = text(credential.api_secret || credential.secret_key || credential.secret);
  if (!keyId || !secret) throw new Error("ALPACA_MARKET_DATA_CREDENTIAL_INVALID");

  return { keyId, secret };
}

async function requestJson({ organizationId, path, searchParams = {} }) {
  const { keyId, secret } = await credentialFor(organizationId);
  const url = new URL(path, DATA_BASE_URL);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new Error(`ALPACA_MARKET_DATA_ERROR:${response.status}:${requestId || "no-request-id"}:${payload?.message || "request failed"}`);
  }

  return {
    payload,
    requestId: response.headers.get("x-request-id") || null,
    sourceUrl: url.toString(),
  };
}

export async function getStockSnapshot({ organizationId, symbol, feed = "iex" }) {
  const ticker = text(symbol).toUpperCase();
  if (!ticker) throw new Error("symbol required");

  const result = await requestJson({
    organizationId,
    path: `/v2/stocks/${encodeURIComponent(ticker)}/snapshot`,
    searchParams: { feed },
  });
  const snapshot = result.payload || {};
  const latestTrade = snapshot.latestTrade || {};
  const latestQuote = snapshot.latestQuote || {};
  const minuteBar = snapshot.minuteBar || {};
  const dailyBar = snapshot.dailyBar || {};
  const previousDailyBar = snapshot.prevDailyBar || {};

  return {
    symbol: ticker,
    provider: "alpaca",
    feed,
    captured_at: latestTimestamp(latestTrade.t, latestQuote.t, minuteBar.t, dailyBar.t),
    latest_trade_price: number(latestTrade.p),
    latest_trade_size: number(latestTrade.s),
    bid_price: number(latestQuote.bp),
    bid_size: number(latestQuote.bs),
    ask_price: number(latestQuote.ap),
    ask_size: number(latestQuote.as),
    minute_open: number(minuteBar.o),
    minute_high: number(minuteBar.h),
    minute_low: number(minuteBar.l),
    minute_close: number(minuteBar.c),
    minute_volume: number(minuteBar.v),
    day_open: number(dailyBar.o),
    day_high: number(dailyBar.h),
    day_low: number(dailyBar.l),
    day_close: number(dailyBar.c),
    day_volume: number(dailyBar.v),
    previous_close: number(previousDailyBar.c),
    raw_payload: snapshot,
    provenance: {
      provider: "alpaca",
      request_id: result.requestId,
      source_url: result.sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  };
}

export async function getStockBars({
  organizationId,
  symbol,
  timeframe = "1Day",
  start,
  end,
  limit = 250,
  feed = "iex",
  adjustment = "all",
}) {
  const ticker = text(symbol).toUpperCase();
  if (!ticker) throw new Error("symbol required");

  const result = await requestJson({
    organizationId,
    path: `/v2/stocks/${encodeURIComponent(ticker)}/bars`,
    searchParams: { timeframe, start, end, limit, feed, adjustment, sort: "asc" },
  });

  const rows = Array.isArray(result.payload?.bars) ? result.payload.bars : [];
  return rows.map((bar) => ({
    symbol: ticker,
    provider: "alpaca",
    timeframe,
    bar_time: bar.t,
    open: number(bar.o),
    high: number(bar.h),
    low: number(bar.l),
    close: number(bar.c),
    volume: number(bar.v),
    trade_count: number(bar.n),
    vwap: number(bar.vw),
    feed,
    raw_payload: bar,
    provenance: {
      provider: "alpaca",
      request_id: result.requestId,
      source_url: result.sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  }));
}

export async function getMarketNews({
  organizationId,
  symbols = [],
  start,
  end,
  limit = 20,
}) {
  const symbolList = (Array.isArray(symbols) ? symbols : [symbols])
    .map((value) => text(value).toUpperCase())
    .filter(Boolean);

  const result = await requestJson({
    organizationId,
    path: "/v1beta1/news",
    searchParams: {
      symbols: symbolList.join(","),
      start,
      end,
      limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
      sort: "desc",
      include_content: false,
    },
  });

  const news = Array.isArray(result.payload?.news) ? result.payload.news : [];
  return news.map((article) => ({
    id: article.id,
    headline: article.headline || "",
    summary: article.summary || "",
    author: article.author || null,
    created_at: article.created_at || null,
    updated_at: article.updated_at || null,
    url: article.url || null,
    symbols: Array.isArray(article.symbols) ? article.symbols : [],
    source: article.source || "alpaca_news",
    raw_payload: article,
    provenance: {
      provider: "alpaca",
      request_id: result.requestId,
      source_url: result.sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  }));
}

export async function getCorporateActions({
  organizationId,
  symbols = [],
  start,
  end,
  types = [],
  region = "us",
  dataQuality = "complete",
  limit = 500,
}) {
  const symbolList = (Array.isArray(symbols) ? symbols : [symbols])
    .map((value) => text(value).toUpperCase())
    .filter(Boolean);
  const typeList = (Array.isArray(types) ? types : [types])
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);

  const result = await requestJson({
    organizationId,
    path: "/v1/corporate-actions",
    searchParams: {
      symbols: symbolList.join(","),
      types: typeList.join(","),
      start,
      end,
      region,
      data_quality: dataQuality,
      limit: Math.min(Math.max(Number(limit) || 500, 1), 1000),
      sort: "asc",
    },
  });

  const typeByCollection = {
    reverse_splits: "reverse_split",
    forward_splits: "forward_split",
    unit_splits: "unit_split",
    cash_dividends: "cash_dividend",
    stock_dividends: "stock_dividend",
    spin_offs: "spin_off",
    cash_mergers: "cash_merger",
    stock_mergers: "stock_merger",
    stock_and_cash_mergers: "stock_and_cash_merger",
    redemptions: "redemption",
    name_changes: "name_change",
    worthless_removals: "worthless_removal",
    rights_distributions: "rights_distribution",
    partial_calls: "partial_call",
    reorganizations: "reorganization",
    capital_gains_distributions: "capital_gains_distribution",
  };

  const root = result.payload?.corporate_actions || result.payload || {};
  const rows = [];
  for (const [collection, value] of Object.entries(root)) {
    if (!Array.isArray(value)) continue;
    const actionType = typeByCollection[collection] || text(collection).toLowerCase();
    for (const action of value) {
      rows.push({
        provider_action_id: text(action?.id || action?.corporate_action_id || action?.ca_id),
        action_type: text(action?.type || action?.action_type || actionType).toLowerCase(),
        symbol: text(
          action?.symbol
          || action?.initiating_symbol
          || action?.old_symbol
          || symbolList[0],
        ).toUpperCase(),
        process_date: action?.process_date || null,
        event_date: action?.ex_date
          || action?.effective_date
          || action?.execution_date
          || action?.payable_date
          || action?.process_date
          || null,
        ex_date: action?.ex_date || null,
        record_date: action?.record_date || null,
        payable_date: action?.payable_date || null,
        declaration_date: action?.declaration_date || null,
        currency: action?.currency || null,
        data_quality: dataQuality,
        raw_payload: action,
        provenance: {
          provider: "alpaca",
          request_id: result.requestId,
          source_url: result.sourceUrl,
          fetched_at: new Date().toISOString(),
          coverage_guaranteed: false,
        },
      });
    }
  }

  return rows.filter((row) => row.provider_action_id && row.symbol);
}

export const AlpacaMarketDataProvider = {
  snapshot: getStockSnapshot,
  bars: getStockBars,
  news: getMarketNews,
  corporateActions: getCorporateActions,
};
