import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  buildOperatorBusinessThesis,
  normalizeOperatorBusinessThesis,
} from "@/lib/operator/contracts/OperatorBusinessThesis";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Conservative extraction only.
    }
  }
  return null;
}

function findText(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return "";
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
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function boundedAttention(attention) {
  const source = object(attention);
  return {
    status: text(source.status) || null,
    summary: text(source.summary).slice(0, 1200) || null,
    items: list(source.items).slice(0, 6).map((item) => ({
      title: text(item?.title).slice(0, 180) || null,
      why_now: text(item?.why_now).slice(0, 700) || null,
      evidence_refs: list(item?.evidence_refs).slice(0, 6),
      recommended_next_step:
        text(item?.recommended_next_step).slice(0, 600) || null,
      recommended_action: object(item?.recommended_action),
    })),
    evidence: {
      status: text(source?.evidence?.status) || null,
      total_steps: Number(source?.evidence?.total_steps || 0),
      completed_steps: Number(source?.evidence?.completed_steps || 0),
      failed_steps: Number(source?.evidence?.failed_steps || 0),
      steps: list(source?.evidence?.steps).slice(0, 6).map((step) => ({
        id: text(step?.id).slice(0, 100) || null,
        capability_key:
          text(step?.capability_key || step?.capability?.key).slice(0, 240) || null,
        status: text(step?.status).slice(0, 80) || null,
        result: step?.result ?? null,
        error: text(step?.error).slice(0, 400) || null,
      })),
    },
    generated_at: text(source.generated_at) || null,
  };
}

function normalizeSynthesis(parsed, attention) {
  const allowedEvidence = new Set(
    list(attention?.evidence?.steps)
      .filter((step) => text(step?.status) === "completed")
      .map((step) => text(step?.id))
      .filter(Boolean),
  );

  const signals = list(parsed?.signals)
    .slice(0, 8)
    .map((signal) => ({
      title: text(signal?.title).slice(0, 180),
      kind: text(signal?.kind).toLowerCase(),
      severity: text(signal?.severity).toLowerCase(),
      confidence: Number.isFinite(Number(signal?.confidence))
        ? Math.max(0, Math.min(1, Number(signal.confidence)))
        : null,
      why_now: text(signal?.why_now).slice(0, 700) || null,
      evidence_refs: list(signal?.evidence_refs)
        .map(text)
        .filter((ref) => allowedEvidence.has(ref))
        .slice(0, 6),
      recommended_next_step:
        text(signal?.recommended_next_step).slice(0, 600) || null,
      recommended_action_key:
        text(signal?.recommended_action_key).slice(0, 240) || null,
    }))
    .filter((signal) => signal.title && signal.why_now && signal.evidence_refs.length);

  const outlook = list(parsed?.outlook)
    .slice(0, 4)
    .map((item) => ({
      prediction: text(item?.prediction).slice(0, 700),
      horizon: text(item?.horizon).toLowerCase(),
      confidence: Number.isFinite(Number(item?.confidence))
        ? Math.max(0, Math.min(1, Number(item.confidence)))
        : null,
      evidence_refs: list(item?.evidence_refs)
        .map(text)
        .filter((ref) => allowedEvidence.has(ref))
        .slice(0, 6),
    }))
    .filter((item) => item.prediction && item.evidence_refs.length);

  return {
    summary: text(parsed?.summary).slice(0, 1200) || text(attention?.summary).slice(0, 1200),
    confidence: Number.isFinite(Number(parsed?.confidence))
      ? Math.max(0, Math.min(1, Number(parsed.confidence)))
      : null,
    signals,
    outlook,
    recommended_next_move:
      text(parsed?.recommended_next_move).slice(0, 800) ||
      text(signals[0]?.recommended_next_step).slice(0, 800) ||
      null,
    recommendation_reason:
      text(parsed?.recommendation_reason).slice(0, 1200) ||
      text(signals[0]?.why_now).slice(0, 1200) ||
      null,
  };
}

function unchangedThesis(previous, preview, generatedAt) {
  return normalizeOperatorBusinessThesis({
    ...previous,
    generated_at: text(generatedAt) || previous?.generated_at || null,
    change: preview?.change || null,
    interruption: preview?.interruption || null,
  });
}

export async function synthesizeOperatorBusinessThesis({
  context,
  attention,
  previousThesis = null,
} = {}) {
  const bounded = boundedAttention(attention);
  const previous = normalizeOperatorBusinessThesis(previousThesis);
  const preview = buildOperatorBusinessThesis({
    attention: bounded,
    previousThesis: previous,
  });

  if (previous && preview?.change?.evidence_changed === false) {
    return unchangedThesis(previous, preview, bounded.generated_at);
  }

  const completed = list(bounded?.evidence?.steps).filter(
    (step) => text(step?.status) === "completed",
  );

  if (!completed.length) return preview;

  const instructions = `
You are Avantiqo Synthetic Intelligence maintaining an evidence-grounded business thesis.
Your job is not merely to summarize. Decide what the live evidence means for an owner or executive, while staying strictly inside the supplied evidence.

Rules:
- Current claims must be grounded in live_evidence only. Prior thesis is context for comparison, never proof that something remains true.
- Never invent numbers, thresholds, trends, causes, deadlines, benchmarks, identities or business facts.
- Every signal and outlook item must cite one or more completed live evidence step ids.
- Use signal kind only from: risk, opportunity, decision, execution, anomaly, watch.
- Use severity only from: clear, watch, important, urgent.
- urgent means a credible condition in the supplied evidence that merits interrupting the owner now, not merely something interesting.
- important means it should be prominently surfaced soon but does not justify an interruption.
- Predictions must be conditional, evidence-based and use horizon only from: immediate, near_term, this_period, longer_term.
- A prediction is not a fact. Keep confidence calibrated and omit predictions that are not supportable from evidence.
- Prefer fewer high-value signals to filler.
- The recommended next move should be the strongest evidence-backed management move. It is advice only and never authorizes execution.
- Do not execute, stage, approve, publish, message, pay or mutate business state.

Return exactly one JSON object:
{
  "summary": "current executive thesis",
  "confidence": 0.0,
  "signals": [
    {
      "title": "short signal",
      "kind": "risk|opportunity|decision|execution|anomaly|watch",
      "severity": "clear|watch|important|urgent",
      "confidence": 0.0,
      "why_now": "why this matters now",
      "evidence_refs": ["attention_1"],
      "recommended_next_step": "optional next move",
      "recommended_action_key": null
    }
  ],
  "outlook": [
    {
      "prediction": "conditional forward-looking statement",
      "horizon": "immediate|near_term|this_period|longer_term",
      "confidence": 0.0,
      "evidence_refs": ["attention_1"]
    }
  ],
  "recommended_next_move": "strongest management move or null",
  "recommendation_reason": "evidence-grounded reason or null"
}
`.trim();

  let enriched = bounded;
  try {
    const autonomousCognition =
      context?.metadata?.autonomous_cognition === true ||
      text(attention?.synthesis?.mode) === "deterministic_evidence_only";
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: context?.organizationId,
      party_id: text(context?.partyId || context?.metadata?.partyId) || null,
      entity_id: context?.entityId || null,
      service_id: "ai.text.generate",
      input: {
        input: JSON.stringify({
          live_evidence: bounded,
          previous_business_thesis: previous,
        }),
        instructions_text: instructions,
        max_output_tokens: 900,
        text: { verbosity: "low" },
        response_format: { type: "json_object" },
      },
      metadata: {
        module: "OPERATOR",
        operation: "SYNTHESIZE_BUSINESS_THESIS",
        channel: "synthetic_business_partner",
        latency_class: autonomousCognition ? "background" : "interactive",
        read_only: true,
        evidence_step_count: completed.length,
        autonomous_cognition: autonomousCognition,
        autonomous_watch_version:
          autonomousCognition
            ? text(context?.metadata?.autonomous_watch_version) || "2"
            : null,
        source:
          text(context?.metadata?.source) ||
          (autonomousCognition ? "AVANTIQO_SYNTHETIC_INTELLIGENCE_WATCH" : null),
      },
      category: "AI",
    });
    const parsed = parseJson(findText(execution));
    const synthesis = normalizeSynthesis(parsed, bounded);
    enriched = {
      ...bounded,
      summary: synthesis.summary,
      confidence: synthesis.confidence,
      items: synthesis.signals,
      outlook: synthesis.outlook,
      recommended_next_move: synthesis.recommended_next_move,
      recommendation_reason: synthesis.recommendation_reason,
    };
  } catch (error) {
    console.error("OPERATOR_BUSINESS_THESIS_SYNTHESIS_FAILED", {
      organizationId: context?.organizationId || null,
      error: error?.message || error,
    });
  }

  return buildOperatorBusinessThesis({
    attention: enriched,
    previousThesis: previous,
  });
}

export default synthesizeOperatorBusinessThesis;
