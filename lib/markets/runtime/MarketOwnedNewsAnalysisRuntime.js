import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const SERVICE_ID = "ai.text.generate";
const ANALYSIS_VERSION = "markets-news-owned-v1";
const POLL_MS = 1000;
const MAX_WAIT_MS = 90_000;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findText(value, depth = 0) {
  if (depth > 7 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  for (const key of ["text", "output_text", "content", "message"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key];
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function parseJson(value) {
  const source = text(value, 120000).replace(/^\uFEFF/, "");
  if (!source) return null;
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? source.slice(first, last + 1) : source;
  try {
    const parsed = JSON.parse(candidate);
    return object(parsed);
  } catch {
    return null;
  }
}

async function settle(initial, organizationId) {
  if (!initial?.pending) return initial;
  const deadline = Date.now() + MAX_WAIT_MS;
  let current = initial;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    current = await settlePendingService({
      organization_id: organizationId,
      provider: current.provider,
      provider_job_id: current.provider_job_id || current.output?.provider_job_id,
      usage_id: current.usage?.id,
      pricing: current.pricing || {},
      credential_id: current.credential_id || null,
      started_at: current.started_at || null,
      provider_status_input: { model: current.model || null },
      metadata: {
        module: "MARKETS",
        operation: "MARKETS_NEWS_SEMANTIC_ANALYSIS_POLL",
        authorization_effect: "NONE",
      },
    });
    if (!current?.pending) return current;
  }
  throw new Error("MARKETS_NEWS_ANALYSIS_TIMEOUT");
}

function analysisPrompt(symbol, rows) {
  const evidence = rows.map((row) => ({
    evidence_id: row.id,
    observed_at: row.observed_at,
    headline: text(row.payload?.headline, 500),
    summary: text(row.payload?.summary, 1400),
    source: text(row.source_name, 120),
  }));

  return [
    "You are Avantiqo Markets' News/Event specialist.",
    "Analyze only the supplied evidence. Do not use unstated facts and do not infer certainty.",
    "For every input evidence_id return exactly one event object.",
    "Return strict JSON with this shape:",
    '{"events":[{"evidence_id":"uuid","sentiment":0.0,"materiality":0.0,"analysis_confidence":0.0,"event_type":"OTHER","horizon":"SHORT","rationale":"short evidence-grounded reason"}]}',
    "sentiment must be from -1 to 1 and represents likely directional impact on the named security, not moral tone.",
    "materiality must be from 0 to 1 and represents likely importance to price/fundamentals.",
    "analysis_confidence must be from 0 to 1. Use low confidence when the headline is ambiguous or incomplete.",
    "event_type examples: EARNINGS, GUIDANCE, M_AND_A, PRODUCT, REGULATORY, LEGAL, MANAGEMENT, CAPITAL, MACRO, ANALYST, OPERATIONS, OTHER.",
    "horizon must be INTRADAY, SHORT, MEDIUM, or LONG.",
    "Do not output an event_id that was not supplied.",
    `SECURITY: ${symbol}`,
    `EVIDENCE: ${JSON.stringify(evidence)}`,
  ].join("\n");
}

export async function analyzeMarketNewsEvidence({
  organizationId,
  portfolioId,
  symbol,
  evidenceRows = [],
}) {
  const candidates = list(evidenceRows)
    .filter((row) =>
      row?.evidence_type === "NEWS" &&
      row?.id &&
      row?.analysis_status !== "ANALYZED"
    )
    .slice(0, 20);

  if (!candidates.length) {
    return { analyzed: 0, rows: [] };
  }

  const result = await executeService({
    organization_id: organizationId,
    service_id: SERVICE_ID,
    capability: SERVICE_ID,
    input: {
      prompt: analysisPrompt(symbol, candidates),
      max_output_tokens: 2200,
      response_format: { type: "json_object" },
    },
    category: "MARKETS_NEWS_ANALYSIS",
    provider_policy: {
      owned_only_required: true,
      external_provider_fallback_allowed: false,
    },
    metadata: {
      module: "MARKETS",
      operation: "MARKETS_NEWS_SEMANTIC_ANALYSIS",
      portfolio_id: portfolioId,
      symbol,
      evidence_count: candidates.length,
      authorization_effect: "NONE",
      raw_reasoning_persisted: false,
    },
  });

  const settled = await settle(result, organizationId);
  if (settled?.failed) {
    throw new Error(settled.error || "MARKETS_NEWS_ANALYSIS_FAILED");
  }

  const parsed = parseJson(findText(settled));
  const events = list(parsed?.events);
  if (!events.length) throw new Error("MARKETS_NEWS_ANALYSIS_JSON_REQUIRED");

  const allowedIds = new Set(candidates.map((row) => row.id));
  const sourceById = new Map(candidates.map((row) => [row.id, row]));
  const updates = [];

  for (const event of events) {
    const evidenceId = text(event?.evidence_id, 80);
    if (!allowedIds.has(evidenceId)) continue;

    const sentiment = clamp(event?.sentiment, -1, 1);
    const materiality = clamp(event?.materiality, 0, 1);
    const analysisConfidence = clamp(event?.analysis_confidence, 0, 1);
    if (sentiment === null || materiality === null || analysisConfidence === null) continue;

    const source = sourceById.get(evidenceId);
    const horizon = ["INTRADAY", "SHORT", "MEDIUM", "LONG"].includes(text(event?.horizon, 20).toUpperCase())
      ? text(event.horizon, 20).toUpperCase()
      : "SHORT";
    const eventType = text(event?.event_type, 60).toUpperCase() || "OTHER";
    const admittedMateriality = materiality * analysisConfidence;
    const admittedSentiment = analysisConfidence >= 0.5 ? sentiment : 0;

    const { data, error } = await supabaseAdmin
      .from("market_evidence_events")
      .update({
        sentiment: admittedSentiment,
        materiality: admittedMateriality,
        analysis_status: "ANALYZED",
        analysis_version: ANALYSIS_VERSION,
        analyzed_at: new Date().toISOString(),
        payload: {
          ...object(source?.payload),
          semantic_analysis: {
            sentiment,
            materiality,
            analysis_confidence: analysisConfidence,
            admitted_sentiment: admittedSentiment,
            admitted_materiality: admittedMateriality,
            event_type: eventType,
            horizon,
            rationale: text(event?.rationale, 700),
            analyzer: "avantiqo-intelligence",
            version: ANALYSIS_VERSION,
          },
        },
        provenance: {
          ...object(source?.provenance),
          semantic_analyzer: "avantiqo-intelligence",
          semantic_analysis_version: ANALYSIS_VERSION,
        },
      })
      .eq("id", evidenceId)
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .select("*")
      .single();

    if (error) throw error;
    updates.push(data);
  }

  if (!updates.length) {
    throw new Error("MARKETS_NEWS_ANALYSIS_NO_ADMISSIBLE_EVENTS");
  }

  return {
    analyzed: updates.length,
    rows: updates,
    provider: settled.provider || "avantiqo-intelligence",
    model: settled.model || null,
    version: ANALYSIS_VERSION,
  };
}

export const MarketOwnedNewsAnalysisRuntime = {
  analyze: analyzeMarketNewsEvidence,
};
