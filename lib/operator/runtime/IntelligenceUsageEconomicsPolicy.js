function text(value, limit = 160) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function has(value, key) { return Object.prototype.hasOwnProperty.call(object(value), key); }

export function estimatedIntelligenceContextTokens(metadata = {}) {
  const context = object(metadata.intelligence_context_budget);
  const descriptors = object(metadata.intelligence_tool_descriptor_budget);
  const explicit = number(context.estimated_input_tokens);
  if (explicit > 0) return explicit;
  return Math.ceil((number(context.message_chars) + number(descriptors.descriptor_chars)) / 4);
}

export function summarizeIntelligenceUsage(rows = []) {
  const summary = {
    calls: 0, fast_calls: 0, deep_calls: 0,
    input_tokens: 0, output_tokens: 0,
    cached_input_tokens: 0, effective_uncached_input_tokens: 0,
    cache_observed_calls: 0, cache_hit_calls: 0,
    cache_hit_ratio: 0, cached_input_ratio: 0,
    cache_hit_latency_ms: 0, cache_miss_latency_ms: 0, cache_latency_delta_ms: 0,
    cache_hit_latency_samples: 0, cache_miss_latency_samples: 0,
    estimated_context_tokens: 0, supplier_cost: 0, customer_price: 0,
    average_context_tokens: 0, fingerprinted_calls: 0,
    repeated_static_context_calls: 0, stable_context_reuse_ratio: 0,
  };
  const seenStaticFingerprints = new Set();
  for (const row of list(rows)) {
    const metadata = object(row.metadata);
    if (text(metadata.module).toUpperCase() !== "INTELLIGENCE" && text(row.module).toUpperCase() !== "INTELLIGENCE") continue;
    summary.calls += 1;
    const lane = text(metadata.intelligence_execution_lane).toLowerCase();
    if (lane === "fast") summary.fast_calls += 1;
    if (lane === "deep") summary.deep_calls += 1;
    const providerUsage = object(metadata.provider_usage);
    const resultUsage = object(object(metadata.result).usage);
    const usage = Object.keys(providerUsage).length ? providerUsage : resultUsage;
    const inputTokens = number(metadata.input_tokens ?? usage.input_tokens);
    const outputTokens = number(metadata.output_tokens ?? usage.output_tokens);
    const cachedInputTokens = Math.min(inputTokens, number(metadata.cached_input_tokens ?? usage.cached_input_tokens));
    const cacheObserved = has(metadata, "cached_input_tokens") || has(providerUsage, "cached_input_tokens") || has(resultUsage, "cached_input_tokens");
    const latencyMs = number(row.latency_ms ?? metadata.latency_ms);
    summary.input_tokens += inputTokens;
    summary.output_tokens += outputTokens;
    summary.cached_input_tokens += cachedInputTokens;
    summary.effective_uncached_input_tokens += Math.max(0, inputTokens - cachedInputTokens);
    if (cacheObserved) summary.cache_observed_calls += 1;
    if (cachedInputTokens > 0) {
      summary.cache_hit_calls += 1;
      if (latencyMs > 0) { summary.cache_hit_latency_ms += latencyMs; summary.cache_hit_latency_samples += 1; }
    } else if (cacheObserved && latencyMs > 0) {
      summary.cache_miss_latency_ms += latencyMs;
      summary.cache_miss_latency_samples += 1;
    }
    summary.estimated_context_tokens += estimatedIntelligenceContextTokens(metadata);
    const fingerprint = text(object(metadata.intelligence_operator_context_fingerprint).static_context_fingerprint, 128);
    if (fingerprint) {
      summary.fingerprinted_calls += 1;
      if (seenStaticFingerprints.has(fingerprint)) summary.repeated_static_context_calls += 1;
      else seenStaticFingerprints.add(fingerprint);
    }
    summary.supplier_cost += number(row.supplier_cost);
    summary.customer_price += number(row.customer_price);
  }
  summary.average_context_tokens = summary.calls ? Math.round(summary.estimated_context_tokens / summary.calls) : 0;
  summary.stable_context_reuse_ratio = summary.fingerprinted_calls ? Number((summary.repeated_static_context_calls / summary.fingerprinted_calls).toFixed(4)) : 0;
  summary.cache_hit_ratio = summary.cache_observed_calls ? Number((summary.cache_hit_calls / summary.cache_observed_calls).toFixed(4)) : 0;
  summary.cached_input_ratio = summary.input_tokens ? Number((summary.cached_input_tokens / summary.input_tokens).toFixed(4)) : 0;
  summary.cache_hit_latency_ms = summary.cache_hit_latency_samples ? Math.round(summary.cache_hit_latency_ms / summary.cache_hit_latency_samples) : 0;
  summary.cache_miss_latency_ms = summary.cache_miss_latency_samples ? Math.round(summary.cache_miss_latency_ms / summary.cache_miss_latency_samples) : 0;
  summary.cache_latency_delta_ms = summary.cache_hit_latency_samples && summary.cache_miss_latency_samples
    ? summary.cache_hit_latency_ms - summary.cache_miss_latency_ms
    : 0;
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
      stable_context_reuse_ratio: Number(number(current.stable_context_reuse_ratio).toFixed(4)),
      cache_hit_ratio: Number(number(current.cache_hit_ratio).toFixed(4)),
      cached_input_ratio: Number(number(current.cached_input_ratio).toFixed(4)),
      cache_hit_latency_ms: Math.round(number(current.cache_hit_latency_ms)),
      cache_miss_latency_ms: Math.round(number(current.cache_miss_latency_ms)),
      cache_latency_delta_ms: Math.round(number(current.cache_latency_delta_ms)),
    },
    governance: { commercial_quota_assessed: false, authority_changed: false, cache_pricing_changed: false },
  };
}
