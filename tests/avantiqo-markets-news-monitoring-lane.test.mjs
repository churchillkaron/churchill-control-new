import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ingestion = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketIntelligenceIngestionRuntime.js", import.meta.url),
  "utf8",
);
const autonomous = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketAutonomousPaperRuntime.js", import.meta.url),
  "utf8",
);
const commandCenter = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);

test("Markets has a dedicated incremental news refresh lane", () => {
  assert.match(ingestion, /export async function refreshMarketNews\(/);
  assert.match(ingestion, /AlpacaMarketDataProvider\.news\(\{/);
  assert.match(ingestion, /persistNewsEvidence\(\{/);
  assert.match(ingestion, /MarketOwnedNewsAnalysisRuntime\.analyze\(\{/);
  assert.match(ingestion, /refreshNews: refreshMarketNews/);
});

test("autonomous monitoring polls tracked-symbol news on a five-minute cadence", () => {
  assert.match(autonomous, /item\?\.metadata\?\.news_refreshed_at \|\| null/);
  assert.match(
    autonomous,
    /lastResearchAt: item\?\.metadata\?\.news_refreshed_at \|\| null,[\s\S]*?maxAgeMinutes: 5/,
  );
  assert.match(autonomous, /MarketIntelligenceIngestionRuntime\.refreshNews\(\{/);
  assert.match(autonomous, /news_refreshed_at: refreshedNews\.refreshed_at/);
});

test("full research stays on the heavier six-hour cadence", () => {
  assert.match(
    autonomous,
    /lastResearchAt: state\.lastResearchBySymbol\.get\(symbol\),[\s\S]*?maxAgeMinutes: 360/,
  );
});

test("monitoring refresh happens before execution eligibility gates", () => {
  const loopStart = autonomous.indexOf("for (const item of state.watchlist)");
  const loopEnd = autonomous.indexOf("const finalAuthoritative", loopStart);
  const loop = autonomous.slice(loopStart, loopEnd);

  const newsRefreshIndex = loop.indexOf("MarketIntelligenceIngestionRuntime.refreshNews");
  const maxTradesIndex = loop.indexOf("MAX_TRADES_PER_CYCLE_REACHED_MONITORING_ONLY");
  const staleIndex = loop.indexOf("MARKET_DATA_STALE");
  const queuedIndex = loop.indexOf("QUEUED_ORDER_EXISTS");
  const cooldownIndex = loop.indexOf("DECISION_COOLDOWN");

  assert.ok(newsRefreshIndex >= 0);
  assert.ok(newsRefreshIndex < maxTradesIndex);
  assert.ok(newsRefreshIndex < staleIndex);
  assert.ok(newsRefreshIndex < queuedIndex);
  assert.ok(newsRefreshIndex < cooldownIndex);
  assert.doesNotMatch(loop, /if \(ordersCreated >= maxTrades\) break;/);
});

test("manual research refresh updates the same news polling timestamp", () => {
  assert.match(commandCenter, /const watchlistItem = state\.watchlist\.find/);
  assert.match(commandCenter, /news_refreshed_at: refreshed\.refreshed_at/);
});
