function text(value, limit = 160) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

export function estimatedIntelligenceContextTokens(metadata = {}) {
  const context = object(metadata.intelligence_context_budget);
  const descriptors = object(metadata.intelligence_tool_descriptor_budget);
  const explicit = number(context.estimated_input_tokens);
  if (explicit > 0) return explicit;
  return Math.ceil((number(context.message_chars) + number(descriptors.descriptor_chars)) / 4);
}
export function summarizeIntelligenceUsage(rows = []) {
  const summary = { calls: 0, fast_calls: 0, deep_calls: 0, input_tokens: 0, output_tokens: 0, estimated_context_tokens: 0, supplier_cost: 0, customer_price: 0, average_context_tokens: 0 };
  for (const row of list(rows)) {
    const metadata = object(row.metadata);
    if (text(metadata.module).toUpperCase() !== "INTELLIGENCE" && text(row.module).toUpperCase() !== "INTELLIGENCE") continue;
    summary.calls += 1;
    const lane = text(metadata.intelligence_execution_lane).toLowerCase();
    if (lane === "fast") summary.fast_calls += 1;
    if (lane === "deep") summary.deep_calls += 1;
    const resultUsage = object(object(metadata.result).usage);
    summary.input_tokens += number(metadata.input_tokens ?? resultUsage.input_tokens);
    summary.output_tokens += number(metadata.output_tokens ?? resultUsage.output_tokens);
    summary.estimated_context_tokens += estimatedIntelligenceContextTokens(metadata);
    summary.supplier_cost += number(row.supplier_cost);
    summary.customer_price += number(row.customer_price);
  }
  summary.average_context_tokens = summary.calls ? Math.round(summary.estimated_context_tokens / summary.calls) : 0;
  return summary;
}
export function assessIntelligenceOperatingHealth(current = {}, previous = {}, memory = {}) {
  const perCall = (value, calls) => calls ? number(value) / calls : 0;
  const currentCostPerCall = perCall(current.supplier_cost, current.calls);
  const previousCostPerCall = perCall(previous.supplier_cost, previous.calls);
  const currentDeepShare = current.calls ? number(current.deep_calls) / current.calls : 0;
  const previousDeepShare = previous.calls ? number(previous.deep_calls) / previous.calls : 0;
  const contextGrowth = previous.average_context_tokens ? (number(current.average_context_tokens) - number(previous.average_context_tokens)) / previous.average_context_tokens : 0;
  const costGrowth = previousCostPerCall ? (currentCostPerCall - previousCostPerCall) / previousCostPerCall : 0;
  const operatorActive = number(memory?.memory?.operator_active_total);
  const cold = number(memory?.memory?.temperature?.COLD);
  const coldRatio = operatorActive ? cold / operatorActive : 0;
  const signals = [];
  if (contextGrowth > 0.25) signals.push("CONTEXT_GROWTH_HIGH");
  else if (contextGrowth > 0.1) signals.push("CONTEXT_GROWTH_REVIEW");
  if (costGrowth > 0.25) signals.push("COST_PER_CALL_GROWTH_HIGH");
  else if (costGrowth > 0.1) signals.push("COST_PER_CALL_GROWTH_REVIEW");
  if (currentDeepShare - previousDeepShare > 0.1) signals.push("DEEP_SHARE_RISING");
  if (coldRatio > 0.6) signals.push("COLD_MEMORY_HIGH");
  else if (coldRatio > 0.35) signals.push("COLD_MEMORY_REVIEW");
  return {
    contract: "AVANTIQO_INTELLIGENCE_OPERATING_HEALTH_V1",
    status: signals.some((signal) => signal.endsWith("_HIGH")) ? "REVIEW" : "HEALTHY",
    signals,
    metrics: {
      context_growth_ratio: Number(contextGrowth.toFixed(4)),
      supplier_cost_per_call: Number(currentCostPerCall.toFixed(6)),
      supplier_cost_per_call_growth_ratio: Number(costGrowth.toFixed(4)),
      deep_share: Number(currentDeepShare.toFixed(4)),
      deep_share_delta: Number((currentDeepShare - previousDeepShare).toFixed(4)),
      cold_memory_ratio: Number(coldRatio.toFixed(4)),
    },
    governance: { commercial_quota_assessed: false, authority_changed: false },
  };
}
