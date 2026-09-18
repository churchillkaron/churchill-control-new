import crypto from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import {
  mergeSnapshotState,
  normalizeNewsStreamMessage,
  normalizeStockStreamMessage,
} from "./normalizers.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FEED = String(process.env.ALPACA_MARKET_DATA_FEED || "iex").trim().toLowerCase();
const FLUSH_MS = Math.max(1000, Number(process.env.MARKETS_STREAM_FLUSH_MS || 5000));
const RECONCILE_MS = Math.max(10000, Number(process.env.MARKETS_STREAM_RECONCILE_MS || 60000));
const MAX_BACKOFF_MS = Math.max(5000, Number(process.env.MARKETS_STREAM_MAX_BACKOFF_MS || 60000));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function credentialsStore() {
  const raw = process.env.AVANTIQO_PROVIDER_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    return object(JSON.parse(raw));
  } catch {
    throw new Error("AVANTIQO_PROVIDER_CREDENTIALS_JSON_INVALID");
  }
}

function fromProviderBucket(bucket) {
  const provider = object(bucket?.alpaca);
  if (!provider) return null;
  return object(provider.default) || provider;
}

function normalizeCredential(raw) {
  const credential = object(raw);
  if (!credential) return null;
  const keyId = text(credential.api_key || credential.key_id || credential.key);
  const secret = text(credential.api_secret || credential.secret_key || credential.secret);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

function resolveCredential(organizationId) {
  const direct = normalizeCredential({
    api_key: process.env.ALPACA_MARKET_DATA_KEY_ID || process.env.APCA_API_KEY_ID,
    api_secret: process.env.ALPACA_MARKET_DATA_SECRET || process.env.APCA_API_SECRET_KEY,
  });
  if (direct) return direct;

  const store = credentialsStore();
  if (!store) return null;

  const organizationBuckets = [
    object(store.organizations?.[organizationId]),
    object(store[organizationId]),
  ].filter(Boolean);

  for (const bucket of organizationBuckets) {
    const credential = normalizeCredential(fromProviderBucket(bucket));
    if (credential) return credential;
  }

  const globalBuckets = [object(store.providers), store].filter(Boolean);
  for (const bucket of globalBuckets) {
    const credential = normalizeCredential(fromProviderBucket(bucket));
    if (credential) return credential;
  }
  return null;
}

function credentialFingerprint(credential) {
  return crypto
    .createHash("sha256")
    .update(`${credential.keyId}:${credential.secret}:${FEED}`)
    .digest("hex")
    .slice(0, 24);
}

async function upsertFeedStatus(rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("market_feed_status")
    .upsert(rows, { onConflict: "portfolio_id,provider,feed" });
  if (error) throw error;
}

async function loadDesiredGroups() {
  const { data: portfolios, error: portfolioError } = await supabase
    .from("market_portfolios")
    .select("id,organization_id,status")
    .eq("status", "ACTIVE");
  if (portfolioError) throw portfolioError;

  const portfolioRows = portfolios || [];
  if (!portfolioRows.length) return { groups: new Map(), missing: [] };

  const portfolioIds = portfolioRows.map((row) => row.id);
  const { data: watchlist, error: watchlistError } = await supabase
    .from("market_watchlist")
    .select("portfolio_id,symbol,status")
    .in("portfolio_id", portfolioIds)
    .eq("status", "ACTIVE");
  if (watchlistError) throw watchlistError;

  const byPortfolio = new Map();
  for (const row of watchlist || []) {
    const symbol = text(row.symbol).toUpperCase();
    if (!symbol) continue;
    const set = byPortfolio.get(row.portfolio_id) || new Set();
    set.add(symbol);
    byPortfolio.set(row.portfolio_id, set);
  }

  const groups = new Map();
  const missing = [];
  for (const portfolio of portfolioRows) {
    const symbols = byPortfolio.get(portfolio.id) || new Set();
    if (!symbols.size) continue;

    const credential = resolveCredential(portfolio.organization_id);
    if (!credential) {
      missing.push({ ...portfolio, symbols: [...symbols] });
      continue;
    }

    const fingerprint = credentialFingerprint(credential);
    const group = groups.get(fingerprint) || {
      fingerprint,
      credential,
      symbols: new Set(),
      portfolios: new Map(),
    };
    for (const symbol of symbols) group.symbols.add(symbol);
    group.portfolios.set(portfolio.id, {
      portfolioId: portfolio.id,
      organizationId: portfolio.organization_id,
      symbols,
    });
    groups.set(fingerprint, group);
  }

  return { groups, missing };
}

function symbolTargets(group, symbol) {
  const ticker = text(symbol).toUpperCase();
  const targets = [];
  for (const portfolio of group.portfolios.values()) {
    if (portfolio.symbols.has(ticker)) targets.push(portfolio);
  }
  return targets;
}

function parseMessages(raw) {
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

class FeedSession {
  constructor(group) {
    this.group = group;
    this.stockSocket = null;
    this.newsSocket = null;
    this.stockReady = false;
    this.newsReady = false;
    this.stopped = false;
    this.latest = new Map();
    this.dirty = new Set();
    this.pendingBars = new Map();
    this.pendingNews = new Map();
    this.lastMessageAt = null;
    this.stockReconnects = 0;
    this.newsReconnects = 0;
    this.flushing = false;
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => this.reportError(error));
    }, FLUSH_MS);
  }

  updateGroup(group) {
    const previousGroup = this.group;
    const previous = new Set(previousGroup.symbols);
    const next = new Set(group.symbols);
    const added = [...next].filter((symbol) => !previous.has(symbol));
    const removed = [...previous].filter((symbol) => !next.has(symbol));
    const removedPortfolios = [...previousGroup.portfolios.values()]
      .filter((portfolio) => !group.portfolios.has(portfolio.portfolioId));

    this.group = group;
    if (added.length) this.sendSubscriptions("subscribe", added);
    if (removed.length) this.sendSubscriptions("unsubscribe", removed);

    if (removedPortfolios.length) {
      const now = new Date().toISOString();
      upsertFeedStatus(removedPortfolios.map((portfolio) => ({
        organization_id: portfolio.organizationId,
        portfolio_id: portfolio.portfolioId,
        provider: "alpaca",
        feed: FEED,
        connection_state: "DISCONNECTED",
        subscribed_symbols: [],
        reconnect_count: 0,
        last_error: null,
        updated_at: now,
      }))).catch((error) => this.reportError(error));
    }

    this.writeStatus("CONNECTED").catch((error) => this.reportError(error));
  }

  start() {
    this.openStocks();
    this.openNews();
    this.writeStatus("CONNECTING").catch((error) => this.reportError(error));
  }

  stop() {
    this.stopped = true;
    clearInterval(this.flushTimer);
    try { this.stockSocket?.close(); } catch {}
    try { this.newsSocket?.close(); } catch {}
    this.writeStatus("DISCONNECTED").catch(() => {});
  }

  stockUrl() {
    return `wss://stream.data.alpaca.markets/v2/${FEED}`;
  }

  newsUrl() {
    return "wss://stream.data.alpaca.markets/v1beta1/news";
  }

  authMessage() {
    return JSON.stringify({
      action: "auth",
      key: this.group.credential.keyId,
      secret: this.group.credential.secret,
    });
  }

  subscriptionMessage(action, symbols, kind) {
    if (kind === "stocks") {
      return JSON.stringify({
        action,
        trades: symbols,
        quotes: symbols,
        bars: symbols,
      });
    }
    return JSON.stringify({ action, news: symbols });
  }

  sendSubscriptions(action, symbols) {
    if (!symbols.length) return;
    if (this.stockReady && this.stockSocket?.readyState === WebSocket.OPEN) {
      this.stockSocket.send(this.subscriptionMessage(action, symbols, "stocks"));
    }
    if (this.newsReady && this.newsSocket?.readyState === WebSocket.OPEN) {
      this.newsSocket.send(this.subscriptionMessage(action, symbols, "news"));
    }
  }

  openStocks() {
    if (this.stopped) return;
    this.stockReady = false;
    const socket = new WebSocket(this.stockUrl());
    this.stockSocket = socket;

    socket.on("open", () => socket.send(this.authMessage()));
    socket.on("message", (raw) => {
      for (const message of parseMessages(raw)) {
        if (message?.T === "success" && message?.msg === "authenticated") {
          this.stockReady = true;
          this.stockReconnects = 0;
          const symbols = [...this.group.symbols];
          if (symbols.length) socket.send(this.subscriptionMessage("subscribe", symbols, "stocks"));
          this.writeStatus(this.newsReady ? "CONNECTED" : "CONNECTING").catch((error) => this.reportError(error));
          continue;
        }
        if (message?.T === "error") {
          this.reportError(new Error(`ALPACA_STOCK_STREAM:${message.code || "unknown"}:${message.msg || "error"}`));
          continue;
        }

        const normalized = normalizeStockStreamMessage(message);
        if (!normalized) continue;
        this.lastMessageAt = new Date().toISOString();
        const current = this.latest.get(normalized.symbol) || {};
        this.latest.set(normalized.symbol, mergeSnapshotState(current, normalized));
        this.dirty.add(normalized.symbol);
        if (normalized.bar?.bar_time) {
          this.pendingBars.set(
            `${normalized.symbol}:${normalized.bar.bar_time}`,
            normalized.bar,
          );
        }
      }
    });
    socket.on("close", () => {
      this.stockReady = false;
      if (!this.stopped) this.scheduleReconnect("stocks");
    });
    socket.on("error", (error) => this.reportError(error));
  }

  openNews() {
    if (this.stopped) return;
    this.newsReady = false;
    const socket = new WebSocket(this.newsUrl());
    this.newsSocket = socket;

    socket.on("open", () => socket.send(this.authMessage()));
    socket.on("message", (raw) => {
      for (const message of parseMessages(raw)) {
        if (message?.T === "success" && message?.msg === "authenticated") {
          this.newsReady = true;
          this.newsReconnects = 0;
          const symbols = [...this.group.symbols];
          if (symbols.length) socket.send(this.subscriptionMessage("subscribe", symbols, "news"));
          this.writeStatus(this.stockReady ? "CONNECTED" : "CONNECTING").catch((error) => this.reportError(error));
          continue;
        }
        if (message?.T === "error") {
          this.reportError(new Error(`ALPACA_NEWS_STREAM:${message.code || "unknown"}:${message.msg || "error"}`));
          continue;
        }

        const article = normalizeNewsStreamMessage(message);
        if (!article) continue;
        this.lastMessageAt = new Date().toISOString();
        this.pendingNews.set(article.id, article);
      }
    });
    socket.on("close", () => {
      this.newsReady = false;
      if (!this.stopped) this.scheduleReconnect("news");
    });
    socket.on("error", (error) => this.reportError(error));
  }

  scheduleReconnect(kind) {
    const count = kind === "stocks"
      ? ++this.stockReconnects
      : ++this.newsReconnects;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * (2 ** Math.min(count, 6)));
    this.writeStatus("DEGRADED", `${kind} stream reconnect in ${delay}ms`).catch(() => {});
    setTimeout(() => {
      if (this.stopped) return;
      if (kind === "stocks") this.openStocks();
      else this.openNews();
    }, delay);
  }

  reportError(error) {
    const message = text(error?.message || error || "stream error").slice(0, 500);
    console.error("[markets-feed]", this.group.fingerprint, message);
    this.writeStatus("ERROR", message).catch(() => {});
  }

  async writeStatus(connectionState, lastError = null, lastFlushAt = null) {
    const now = new Date().toISOString();
    const rows = [...this.group.portfolios.values()].map((portfolio) => ({
      organization_id: portfolio.organizationId,
      portfolio_id: portfolio.portfolioId,
      provider: "alpaca",
      feed: FEED,
      connection_state: connectionState,
      subscribed_symbols: [...portfolio.symbols].sort(),
      last_connected_at: connectionState === "CONNECTED" ? now : undefined,
      last_message_at: this.lastMessageAt,
      last_flush_at: lastFlushAt,
      reconnect_count: this.stockReconnects + this.newsReconnects,
      last_error: lastError,
      metadata: {
        stock_stream_ready: this.stockReady,
        news_stream_ready: this.newsReady,
      },
      updated_at: now,
    }));
    await upsertFeedStatus(rows);
  }

  async flush() {
    if (this.flushing) return;
    if (!this.dirty.size && !this.pendingBars.size && !this.pendingNews.size) return;
    this.flushing = true;

    const dirtySymbols = [...this.dirty];
    const pendingBars = [...this.pendingBars.values()];
    const pendingNews = [...this.pendingNews.values()];
    const flushedAt = new Date().toISOString();

    try {
      const snapshotRows = [];
      for (const symbol of dirtySymbols) {
        const snapshot = this.latest.get(symbol);
        if (!snapshot) continue;
        for (const target of symbolTargets(this.group, symbol)) {
          snapshotRows.push({
            organization_id: target.organizationId,
            portfolio_id: target.portfolioId,
            symbol,
            provider: "alpaca",
            feed: FEED,
            captured_at: snapshot.captured_at || flushedAt,
            latest_trade_price: snapshot.latest_trade_price ?? null,
            latest_trade_size: snapshot.latest_trade_size ?? null,
            bid_price: snapshot.bid_price ?? null,
            bid_size: snapshot.bid_size ?? null,
            ask_price: snapshot.ask_price ?? null,
            ask_size: snapshot.ask_size ?? null,
            minute_open: snapshot.minute_open ?? null,
            minute_high: snapshot.minute_high ?? null,
            minute_low: snapshot.minute_low ?? null,
            minute_close: snapshot.minute_close ?? null,
            minute_volume: snapshot.minute_volume ?? null,
            raw_payload: snapshot.raw_payload || {},
            provenance: {
              provider: "alpaca",
              transport: "websocket",
              feed: FEED,
              worker_flush_at: flushedAt,
            },
            updated_at: flushedAt,
          });
        }
      }

      if (snapshotRows.length) {
        const { error } = await supabase
          .from("market_live_snapshots")
          .upsert(snapshotRows, {
            onConflict: "portfolio_id,symbol,provider,feed",
          });
        if (error) throw error;
      }

      const barRows = [];
      for (const bar of pendingBars) {
        for (const target of symbolTargets(this.group, bar.symbol)) {
          barRows.push({
            organization_id: target.organizationId,
            portfolio_id: target.portfolioId,
            symbol: bar.symbol,
            provider: "alpaca",
            timeframe: bar.timeframe,
            bar_time: bar.bar_time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            trade_count: bar.trade_count,
            vwap: bar.vwap,
            feed: FEED,
            raw_payload: bar.raw_payload || {},
          });
        }
      }

      if (barRows.length) {
        const { error } = await supabase
          .from("market_bars")
          .upsert(barRows, {
            onConflict: "organization_id,symbol,provider,timeframe,bar_time",
          });
        if (error) throw error;
      }

      const newsRows = [];
      for (const article of pendingNews) {
        for (const portfolio of this.group.portfolios.values()) {
          const matchedSymbols = article.symbols.filter((symbol) => portfolio.symbols.has(symbol));
          if (!matchedSymbols.length) continue;
          const observedAt = article.updated_at || article.created_at || flushedAt;
          const observedMs = new Date(observedAt).getTime();
          newsRows.push({
            organization_id: portfolio.organizationId,
            portfolio_id: portfolio.portfolioId,
            symbol: matchedSymbols[0],
            evidence_type: "NEWS",
            source_name: article.source || "alpaca_news",
            provider_event_id: article.id,
            source_uri: article.url,
            observed_at: observedAt,
            freshness_seconds: Number.isFinite(observedMs)
              ? Math.max(0, Math.floor((Date.now() - observedMs) / 1000))
              : null,
            materiality: null,
            sentiment: null,
            payload: {
              headline: article.headline,
              summary: article.summary,
              author: article.author,
              symbols: article.symbols,
            },
            provenance: {
              provider: "alpaca",
              transport: "websocket",
              feed: "news",
              worker_flush_at: flushedAt,
            },
          });
        }
      }

      if (newsRows.length) {
        const { error } = await supabase
          .from("market_evidence_events")
          .upsert(newsRows, {
            onConflict: "organization_id,portfolio_id,source_name,provider_event_id",
          });
        if (error) throw error;
      }

      for (const symbol of dirtySymbols) this.dirty.delete(symbol);
      for (const bar of pendingBars) {
        this.pendingBars.delete(`${bar.symbol}:${bar.bar_time}`);
      }
      for (const article of pendingNews) this.pendingNews.delete(article.id);
      await this.writeStatus(
        this.stockReady && this.newsReady ? "CONNECTED" : "DEGRADED",
        null,
        flushedAt,
      );
    } finally {
      this.flushing = false;
    }
  }
}

const sessions = new Map();
let reconciling = false;
let stopping = false;

async function reconcile() {
  if (reconciling || stopping) return;
  reconciling = true;
  try {
    const desired = await loadDesiredGroups();

    if (desired.missing.length) {
      const now = new Date().toISOString();
      await upsertFeedStatus(desired.missing.map((portfolio) => ({
        organization_id: portfolio.organization_id,
        portfolio_id: portfolio.id,
        provider: "alpaca",
        feed: FEED,
        connection_state: "ERROR",
        subscribed_symbols: portfolio.symbols,
        reconnect_count: 0,
        last_error: "ALPACA_MARKET_DATA_CREDENTIAL_REQUIRED",
        metadata: { credential_missing: true },
        updated_at: now,
      })));
    }

    for (const [fingerprint, group] of desired.groups.entries()) {
      const existing = sessions.get(fingerprint);
      if (existing) {
        existing.updateGroup(group);
      } else {
        const session = new FeedSession(group);
        sessions.set(fingerprint, session);
        session.start();
      }
    }

    for (const [fingerprint, session] of sessions.entries()) {
      if (desired.groups.has(fingerprint)) continue;
      session.stop();
      sessions.delete(fingerprint);
    }
  } finally {
    reconciling = false;
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log("[markets-feed] shutdown", signal);
  const closing = [];
  for (const session of sessions.values()) {
    closing.push(session.flush().catch(() => {}));
    session.stop();
  }
  await Promise.allSettled(closing);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[markets-feed] starting", {
  feed: FEED,
  flush_ms: FLUSH_MS,
  reconcile_ms: RECONCILE_MS,
});

await reconcile();
setInterval(() => {
  reconcile().catch((error) => {
    console.error("[markets-feed] reconcile failed", text(error?.message || error));
  });
}, RECONCILE_MS);
