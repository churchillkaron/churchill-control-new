import { AlpacaMarketDataProvider } from "@/lib/markets/providers/alpaca/AlpacaMarketDataProvider";
import { SecEdgarProvider } from "@/lib/markets/providers/sec/SecEdgarProvider";
import { buildFundamentalSnapshot } from "@/lib/markets/runtime/MarketFundamentalModels";
import { MarketOwnedNewsAnalysisRuntime } from "@/lib/markets/runtime/MarketOwnedNewsAnalysisRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function sectorFromSic(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const sic = Number(digits);
  if (!Number.isFinite(sic)) return null;
  if (sic >= 100 && sic <= 999) return "Agriculture, Forestry & Fishing";
  if (sic >= 1000 && sic <= 1499) return "Mining";
  if (sic >= 1500 && sic <= 1799) return "Construction";
  if (sic >= 2000 && sic <= 3999) return "Manufacturing";
  if (sic >= 4000 && sic <= 4999) return "Transportation, Communications & Utilities";
  if (sic >= 5000 && sic <= 5199) return "Wholesale Trade";
  if (sic >= 5200 && sic <= 5999) return "Retail Trade";
  if (sic >= 6000 && sic <= 6799) return "Finance, Insurance & Real Estate";
  if (sic >= 7000 && sic <= 8999) return "Services";
  if (sic >= 9100 && sic <= 9729) return "Public Administration";
  return "Other";
}

async function ensureInstrument({
  organizationId,
  symbol,
  exchange = null,
  assetType = "EQUITY",
  currency = "USD",
  cik = null,
  name = null,
  sector = null,
  industry = null,
  metadata = {},
}) {
  const ticker = upper(symbol);
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("market_instruments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("symbol", ticker)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const patch = {
      exchange: exchange || existing.exchange,
      asset_type: upper(assetType || existing.asset_type),
      currency: upper(currency || existing.currency),
      cik: cik || existing.cik,
      name: name || existing.name,
      sector: sector || existing.sector,
      industry: industry || existing.industry,
      metadata: { ...(existing.metadata || {}), ...(metadata || {}) },
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("market_instruments")
      .update(patch)
      .eq("id", existing.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("market_instruments")
    .insert({
      organization_id: organizationId,
      symbol: ticker,
      exchange,
      asset_type: upper(assetType),
      currency: upper(currency),
      cik,
      name,
      sector,
      industry,
      metadata,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function persistSnapshot({ organizationId, portfolioId, instrument, snapshot }) {
  const { data, error } = await supabaseAdmin.from("market_snapshots").insert({
    organization_id: organizationId,
    portfolio_id: portfolioId,
    instrument_id: instrument.id,
    symbol: instrument.symbol,
    provider: snapshot.provider,
    feed: snapshot.feed,
    captured_at: snapshot.captured_at,
    latest_trade_price: snapshot.latest_trade_price,
    latest_trade_size: snapshot.latest_trade_size,
    bid_price: snapshot.bid_price,
    bid_size: snapshot.bid_size,
    ask_price: snapshot.ask_price,
    ask_size: snapshot.ask_size,
    minute_open: snapshot.minute_open,
    minute_high: snapshot.minute_high,
    minute_low: snapshot.minute_low,
    minute_close: snapshot.minute_close,
    minute_volume: snapshot.minute_volume,
    day_open: snapshot.day_open,
    day_high: snapshot.day_high,
    day_low: snapshot.day_low,
    day_close: snapshot.day_close,
    day_volume: snapshot.day_volume,
    previous_close: snapshot.previous_close,
    raw_payload: snapshot.raw_payload,
    provenance: snapshot.provenance,
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function persistBars({ organizationId, portfolioId, instrument, bars }) {
  if (!bars.length) return [];
  const rows = bars.map((bar) => ({
    organization_id: organizationId,
    portfolio_id: portfolioId,
    instrument_id: instrument.id,
    symbol: instrument.symbol,
    provider: bar.provider,
    timeframe: bar.timeframe,
    bar_time: bar.bar_time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    trade_count: bar.trade_count,
    vwap: bar.vwap,
    feed: bar.feed,
    raw_payload: bar.raw_payload,
  }));
  const { data, error } = await supabaseAdmin
    .from("market_bars")
    .upsert(rows, { onConflict: "organization_id,symbol,provider,timeframe,bar_time" })
    .select("*");
  if (error) throw error;
  return data || [];
}

async function persistNewsEvidence({ organizationId, portfolioId, symbol, news }) {
  if (!news.length) return [];
  const now = Date.now();
  const rows = news.map((article) => {
    const observedAt = article.updated_at || article.created_at || new Date().toISOString();
    const observedMs = new Date(observedAt).getTime();
    return {
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol,
      evidence_type: "NEWS",
      source_name: article.source || "alpaca_news",
      provider_event_id: article.id === undefined || article.id === null ? null : String(article.id),
      source_uri: article.url,
      observed_at: observedAt,
      freshness_seconds: Number.isFinite(observedMs) ? Math.max(0, Math.floor((now - observedMs) / 1000)) : null,
      materiality: null,
      sentiment: null,
      payload: {
        provider_id: article.id,
        headline: article.headline,
        summary: article.summary,
        author: article.author,
        symbols: article.symbols,
      },
      provenance: article.provenance,
    };
  });

  const { data, error } = await supabaseAdmin
    .from("market_evidence_events")
    .upsert(rows, { onConflict: "organization_id,portfolio_id,source_name,provider_event_id" })
    .select("*");
  if (error) throw error;
  return data || [];
}

async function persistFilings({ organizationId, portfolioId, instrument, filings }) {
  if (!filings.length) return [];
  const rows = filings.map((filing) => ({
    organization_id: organizationId,
    portfolio_id: portfolioId,
    instrument_id: instrument.id,
    symbol: instrument.symbol,
    cik: filing.cik,
    provider: "sec_edgar",
    accession_number: filing.accession_number,
    form_type: filing.form_type,
    filed_at: filing.filed_at || null,
    accepted_at: filing.accepted_at || null,
    report_date: filing.report_date || null,
    primary_document: filing.primary_document || null,
    filing_url: filing.filing_url || null,
    description: filing.description || null,
    payload: filing.raw_payload || {},
    provenance: filing.provenance || {},
  }));

  const { data, error } = await supabaseAdmin
    .from("market_filings")
    .upsert(rows, { onConflict: "organization_id,accession_number" })
    .select("*");
  if (error) throw error;
  return data || [];
}

async function persistFundamentalSnapshot({
  organizationId,
  portfolioId,
  instrument,
  snapshot,
  provenance = {},
}) {
  if (!snapshot?.period_end) return null;

  const { data, error } = await supabaseAdmin
    .from("market_fundamental_snapshots")
    .upsert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      instrument_id: instrument.id,
      symbol: instrument.symbol,
      cik: instrument.cik || null,
      provider: "sec_edgar",
      period_end: snapshot.period_end,
      metrics: snapshot.metrics || {},
      ratios: snapshot.ratios || {},
      score: snapshot.score,
      confidence: snapshot.confidence || 0,
      stance: snapshot.stance || "INSUFFICIENT_EVIDENCE",
      facts_used: snapshot.facts_used || {},
      provenance: {
        ...provenance,
        score_components: snapshot.score_components || [],
        generated_at: new Date().toISOString(),
      },
      generated_at: new Date().toISOString(),
    }, {
      onConflict: "organization_id,portfolio_id,symbol,provider,period_end",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function refreshMarketSymbol({
  organizationId,
  portfolioId,
  symbol,
  exchange = null,
  cik = null,
  name = null,
  feed = "iex",
  barsStart = null,
  barsEnd = null,
  barsTimeframe = "1Day",
  barsLimit = 250,
  newsLimit = 20,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!portfolioId) throw new Error("portfolioId required");

  let resolvedCik = cik;
  let resolvedName = name;
  if (!resolvedCik) {
    const secMatch = await SecEdgarProvider.lookupTicker({ symbol }).catch(() => null);
    if (secMatch) {
      resolvedCik = secMatch.cik;
      resolvedName = resolvedName || secMatch.name;
    }
  }

  let instrument = await ensureInstrument({
    organizationId,
    symbol,
    exchange,
    cik: resolvedCik,
    name: resolvedName,
  });

  const [snapshot, bars, news] = await Promise.all([
    AlpacaMarketDataProvider.snapshot({ organizationId, symbol: instrument.symbol, feed }),
    AlpacaMarketDataProvider.bars({
      organizationId,
      symbol: instrument.symbol,
      timeframe: barsTimeframe,
      start: barsStart,
      end: barsEnd,
      limit: barsLimit,
      feed,
    }),
    AlpacaMarketDataProvider.news({
      organizationId,
      symbols: [instrument.symbol],
      limit: newsLimit,
    }),
  ]);

  const snapshotRow = await persistSnapshot({
    organizationId,
    portfolioId,
    instrument,
    snapshot,
  });
  const barRows = await persistBars({
    organizationId,
    portfolioId,
    instrument,
    bars,
  });
  const evidenceRows = await persistNewsEvidence({
    organizationId,
    portfolioId,
    symbol: instrument.symbol,
    news,
  });

  let analyzedEvidenceRows = evidenceRows;
  let newsAnalysis = { analyzed: 0, status: "SKIPPED" };
  try {
    const analyzed = await MarketOwnedNewsAnalysisRuntime.analyze({
      organizationId,
      portfolioId,
      symbol: instrument.symbol,
      evidenceRows,
    });
    newsAnalysis = { ...analyzed, status: "ANALYZED" };
    if (analyzed.rows?.length) {
      const updated = new Map(analyzed.rows.map((row) => [row.id, row]));
      analyzedEvidenceRows = evidenceRows.map((row) => updated.get(row.id) || row);
    }
  } catch (analysisError) {
    newsAnalysis = {
      analyzed: 0,
      status: "UNAVAILABLE",
      error: text(analysisError?.message || analysisError).slice(0, 700),
    };
  }

  let filingRows = [];
  let fundamentalRows = [];
  let secCompany = null;
  if (instrument.cik) {
    const [sec, companyFacts] = await Promise.all([
      SecEdgarProvider.submissions({
        cik: instrument.cik,
        forms: ["10-K", "10-Q", "8-K", "20-F", "6-K"],
        limit: 40,
      }),
      SecEdgarProvider.companyFacts({ cik: instrument.cik }),
    ]);
    secCompany = sec.company;
    filingRows = await persistFilings({
      organizationId,
      portfolioId,
      instrument,
      filings: sec.filings,
    });

    const fundamental = buildFundamentalSnapshot({
      symbol: instrument.symbol,
      cik: instrument.cik,
      companyFacts,
    });
    const fundamentalRow = await persistFundamentalSnapshot({
      organizationId,
      portfolioId,
      instrument,
      snapshot: fundamental,
      provenance: companyFacts.provenance || {},
    });
    if (fundamentalRow) fundamentalRows = [fundamentalRow];

    if (sec.company) {
      instrument = await ensureInstrument({
        organizationId,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        assetType: instrument.asset_type,
        currency: instrument.currency,
        cik: instrument.cik,
        name: instrument.name || sec.company.name || null,
        sector: sectorFromSic(sec.company?.sic),
        industry: sec.company?.sic_description || null,
        metadata: { sec_company: sec.company },
      });
    }
  }

  return {
    instrument,
    snapshot: snapshotRow,
    bars: barRows,
    evidence: analyzedEvidenceRows,
    filings: filingRows,
    fundamentals: fundamentalRows,
    news_analysis: newsAnalysis,
    sec_company: secCompany,
    refreshed_at: new Date().toISOString(),
  };
}

export const MarketIntelligenceIngestionRuntime = {
  refreshSymbol: refreshMarketSymbol,
};
