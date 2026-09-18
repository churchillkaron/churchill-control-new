import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/markets/providers/alpaca/AlpacaMarketDataProvider.js", import.meta.url),
  "utf8",
);
const ingestion = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketIntelligenceIngestionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918123046_avantiqo_markets_bar_provenance_v1.sql", import.meta.url),
  "utf8",
);

test("historical Alpaca bars default to corporate-action adjusted history", () => {
  assert.match(source, /adjustment = "all"/);
  assert.match(source, /searchParams: \{ timeframe, start, end, limit, feed, adjustment, sort: "asc" \}/);
});

test("historical bar provenance preserves feed timeframe and adjustment mode", () => {
  assert.match(source, /provenance:\s*\{[\s\S]*?provider: "alpaca"[\s\S]*?feed,[\s\S]*?timeframe,[\s\S]*?adjustment,[\s\S]*?\}/);
});

test("historical bar provenance survives persistence", () => {
  assert.match(ingestion, /raw_payload: bar\.raw_payload,[\s\S]*?provenance: bar\.provenance \|\| \{\}/);
  assert.match(migration, /alter table public\.market_bars[\s\S]*?add column if not exists provenance jsonb not null default '\{\}'::jsonb/);
});
