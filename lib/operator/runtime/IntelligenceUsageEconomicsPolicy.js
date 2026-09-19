function text(value, limit = 160) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function has(value, key) { return Object.prototype.hasOwnProperty.call(object(value), key); }

const LATENCY_TIMING_FIELDS = Object.freeze([
  "request_queue_ms",
  "time_to_first_token_ms",
  "decode_ms",
  "scheduler_ms",
  "model_forward_ms",
  "model_execute_ms",
]);

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
    cache_hit_generation_ms: 0, cache_miss_generation_ms: 0, cache_generation_delta_ms: 0,
    cache_hit_generation_samples: 0, cache_miss_generation_samples: 0,
    engine_prepare_ms: 0, compute_ms: 0, structured_finalization_ms: 0, compute_samples: 0,
    compute_observed_calls: 0, compute_observation_coverage_ratio: 0,
    fast_compute_observed_calls: 0, deep_compute_observed_calls: 0,
    fast_compute_total_ms: 0, deep_compute_total_ms: 0, fast_compute_ms: 0, deep_compute_ms: 0,
    fast_output_tokens: 0, deep_output_tokens: 0, fast_supplier_cost: 0, deep_supplier_cost: 0,
    fast_compute_ms_per_output_1k_tokens: 0, deep_compute_ms_per_output_1k_tokens: 0,
    fast_supplier_cost_per_compute_second: 0, deep_supplier_cost_per_compute_second: 0,
    latency_timing_observed_calls: 0, latency_timing_observation_coverage_ratio: 0,
    fast_latency_timing_observed_calls: 0, deep_latency_timing_observed_calls: 0,
    fast_latency_timing_observation_coverage_ratio: 0, deep_latency_timing_observation_coverage_ratio: 0,
    request_queue_ms: 0, time_to_first_token_ms: 0, decode_ms: 0,
    scheduler_ms: 0, model_forward_ms: 0, model_execute_ms: 0,
    fast_request_queue_ms: 0, deep_request_queue_ms: 0,
    fast_time_to_first_token_ms: 0, deep_time_to_first_token_ms: 0,
    fast_decode_ms: 0, deep_decode_ms: 0,
    fast_scheduler_ms: 0, deep_scheduler_ms: 0,
    fast_model_forward_ms: 0, deep_model_forward_ms: 0,
    fast_model_execute_ms: 0, deep_model_execute_ms: 0,
    cache_generation_evidence: "INSUFFICIENT",
    pricing_basis_observed_calls: 0, pricing_basis_drift_calls: 0, pricing_basis_drift_ratio: 0,
    pricing_calibration_observed_calls: 0, pricing_production_certified_calls: 0,
    pricing_economics_certified_calls: 0, pricing_recalibration_required_calls: 0,
    pricing_calibration_ready_calls: 0, pricing_calibration_ready_ratio: 0,
    pricing_calibration_state: "INSUFFICIENT_EVIDENCE",
    supplier_cost_per_compute_second: 0, supplier_cost_per_effective_uncached_input_1k_tokens: 0,
    estimated_context_tokens: 0, supplier_cost: 0, customer_price: 0,
    average_context_tokens: 0, fingerprinted_calls: 0, unique_static_contexts: 0,
    repeated_static_context_calls: 0, stable_context_reuse_ratio: 0,
    cacheable_static_chars: 0, volatile_chars: 0, structural_cacheable_ratio: 0,
  };
  const seenStaticFingerprints = new Set();
  const timingTotals = {};
  const timingSamples = {};
  const laneTimingTotals = { fast: {}, deep: {} };
  const laneTimingSamples = { fast: {}, deep: {} };
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
    const enginePrepareMs = number(usage.engine_prepare_ms);
    const generationMs = number(usage.generation_ms);
    const structuredFinalizationMs = number(usage.structured_finalization_ms);
    const computeMs = number(usage.compute_ms) || generationMs + structuredFinalizationMs;
    const pricing = object(Object.keys(object(metadata.settled_pricing)).length ? metadata.settled_pricing : metadata.reservation_pricing);
    const pricingMetadata = object(pricing.pricing_metadata);
    const providerResult = object(metadata.provider_result);
    const result = object(metadata.result);
    const runtimeInfrastructure = text(result.infrastructure_provider || providerResult.infrastructure_provider || object(result.output).infrastructure_provider || object(providerResult.output).infrastructure_provider, 120);
    const pricingInfrastructure = text(pricingMetadata.infrastructure_provider, 120);
    const pricingStatus = text(pricingMetadata.pricing_status, 80).toUpperCase();
    const economicsCertified = pricingMetadata.economics_certified === true;
    const recalibrationRequired = pricingMetadata.recalibration_required === true;
    const calibrationObserved = Boolean(pricingStatus || has(pricingMetadata, "economics_certified") || has(pricingMetadata, "recalibration_required"));
    const infrastructureObserved = Boolean(runtimeInfrastructure && pricingInfrastructure);
    const infrastructureAligned = infrastructureObserved && runtimeInfrastructure.toLowerCase() === pricingInfrastructure.toLowerCase();
    summary.input_tokens += inputTokens;
    summary.output_tokens += outputTokens;
    summary.cached_input_tokens += cachedInputTokens;
    summary.effective_uncached_input_tokens += Math.max(0, inputTokens - cachedInputTokens);
    summary.engine_prepare_ms += enginePrepareMs;
    summary.structured_finalization_ms += structuredFinalizationMs;
    summary.compute_ms += computeMs;
    if (enginePrepareMs > 0 || computeMs > 0 || structuredFinalizationMs > 0) summary.compute_samples += 1;
    if (computeMs > 0) summary.compute_observed_calls += 1;
    let timingObserved = false;
    for (const field of LATENCY_TIMING_FIELDS) {
      if (!has(usage, field)) continue;
      const value = Number(usage[field]);
      if (!Number.isFinite(value) || value < 0) continue;
      timingObserved = true;
      timingTotals[field] = number(timingTotals[field]) + value;
      timingSamples[field] = number(timingSamples[field]) + 1;
      if (lane === "fast" || lane === "deep") {
        laneTimingTotals[lane][field] = number(laneTimingTotals[lane][field]) + value;
        laneTimingSamples[lane][field] = number(laneTimingSamples[lane][field]) + 1;
      }
    }
    if (timingObserved) {
      summary.latency_timing_observed_calls += 1;
      if (lane === "fast") summary.fast_latency_timing_observed_calls += 1;
      if (lane === "deep") summary.deep_latency_timing_observed_calls += 1;
    }
    if (lane === "fast") {
      summary.fast_output_tokens += outputTokens;
      summary.fast_supplier_cost += number(row.supplier_cost);
      if (computeMs > 0) { summary.fast_compute_observed_calls += 1; summary.fast_compute_total_ms += computeMs; }
    }
    if (lane === "deep") {
      summary.deep_output_tokens += outputTokens;
      summary.deep_supplier_cost += number(row.supplier_cost);
      if (computeMs > 0) { summary.deep_compute_observed_calls += 1; summary.deep_compute_total_ms += computeMs; }
    }
    if (calibrationObserved) {
      summary.pricing_calibration_observed_calls += 1;
      if (pricingStatus === "PRODUCTION_CERTIFIED") summary.pricing_production_certified_calls += 1;
      if (economicsCertified) summary.pricing_economics_certified_calls += 1;
      if (recalibrationRequired) summary.pricing_recalibration_required_calls += 1;
      if (pricingStatus === "PRODUCTION_CERTIFIED" && economicsCertified && !recalibrationRequired && infrastructureAligned) summary.pricing_calibration_ready_calls += 1;
    }
    if (infrastructureObserved) {
      summary.pricing_basis_observed_calls += 1;
      if (!infrastructureAligned) summary.pricing_basis_drift_calls += 1;
    }
    if (cacheObserved) summary.cache_observed_calls += 1;
    if (cachedInputTokens > 0) {
      summary.cache_hit_calls += 1;
      if (latencyMs > 0) { summary.cache_hit_latency_ms += latencyMs; summary.cache_hit_latency_samples += 1; }
      if (generationMs > 0) { summary.cache_hit_generation_ms += generationMs; summary.cache_hit_generation_samples += 1; }
    } else if (cacheObserved) {
      if (latencyMs > 0) { summary.cache_miss_latency_ms += latencyMs; summary.cache_miss_latency_samples += 1; }
      if (generationMs > 0) { summary.cache_miss_generation_ms += generationMs; summary.cache_miss_generation_samples += 1; }
    }
    summary.estimated_context_tokens += estimatedIntelligenceContextTokens(metadata);
    const contextFingerprint = object(metadata.intelligence_operator_context_fingerprint);
    summary.cacheable_static_chars += number(contextFingerprint.cacheable_static_chars);
    summary.volatile_chars += number(contextFingerprint.volatile_chars);
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
  summary.unique_static_contexts = seenStaticFingerprints.size;
  const structuralChars = summary.cacheable_static_chars + summary.volatile_chars;
  summary.structural_cacheable_ratio = structuralChars ? Number((summary.cacheable_static_chars / structuralChars).toFixed(4)) : 0;
  summary.stable_context_reuse_ratio = summary.fingerprinted_calls ? Number((summary.repeated_static_context_calls / summary.fingerprinted_calls).toFixed(4)) : 0;
  summary.cache_hit_ratio = summary.cache_observed_calls ? Number((summary.cache_hit_calls / summary.cache_observed_calls).toFixed(4)) : 0;
  summary.cached_input_ratio = summary.input_tokens ? Number((summary.cached_input_tokens / summary.input_tokens).toFixed(4)) : 0;
  summary.cache_hit_latency_ms = summary.cache_hit_latency_samples ? Math.round(summary.cache_hit_latency_ms / summary.cache_hit_latency_samples) : 0;
  summary.cache_miss_latency_ms = summary.cache_miss_latency_samples ? Math.round(summary.cache_miss_latency_ms / summary.cache_miss_latency_samples) : 0;
  summary.cache_latency_delta_ms = summary.cache_hit_latency_samples && summary.cache_miss_latency_samples
    ? summary.cache_hit_latency_ms - summary.cache_miss_latency_ms
    : 0;
  summary.cache_hit_generation_ms = summary.cache_hit_generation_samples ? Math.round(summary.cache_hit_generation_ms / summary.cache_hit_generation_samples) : 0;
  summary.cache_miss_generation_ms = summary.cache_miss_generation_samples ? Math.round(summary.cache_miss_generation_ms / summary.cache_miss_generation_samples) : 0;
  summary.cache_generation_delta_ms = summary.cache_hit_generation_samples && summary.cache_miss_generation_samples
    ? summary.cache_hit_generation_ms - summary.cache_miss_generation_ms
    : 0;
  summary.compute_observation_coverage_ratio = summary.calls ? Number((summary.compute_observed_calls / summary.calls).toFixed(4)) : 0;
  summary.latency_timing_observation_coverage_ratio = summary.calls ? Number((summary.latency_timing_observed_calls / summary.calls).toFixed(4)) : 0;
  summary.fast_latency_timing_observation_coverage_ratio = summary.fast_calls ? Number((summary.fast_latency_timing_observed_calls / summary.fast_calls).toFixed(4)) : 0;
  summary.deep_latency_timing_observation_coverage_ratio = summary.deep_calls ? Number((summary.deep_latency_timing_observed_calls / summary.deep_calls).toFixed(4)) : 0;
  for (const field of LATENCY_TIMING_FIELDS) {
    summary[field] = timingSamples[field] ? Math.round(timingTotals[field] / timingSamples[field]) : 0;
    summary[`fast_${field}`] = laneTimingSamples.fast[field] ? Math.round(laneTimingTotals.fast[field] / laneTimingSamples.fast[field]) : 0;
    summary[`deep_${field}`] = laneTimingSamples.deep[field] ? Math.round(laneTimingTotals.deep[field] / laneTimingSamples.deep[field]) : 0;
  }
  summary.cache_generation_evidence = summary.cache_hit_generation_samples >= 5 && summary.cache_miss_generation_samples >= 5 ? "SUFFICIENT" : "INSUFFICIENT";
  summary.pricing_basis_drift_ratio = summary.pricing_basis_observed_calls ? Number((summary.pricing_basis_drift_calls / summary.pricing_basis_observed_calls).toFixed(4)) : 0;
  summary.pricing_calibration_ready_ratio = summary.pricing_calibration_observed_calls ? Number((summary.pricing_calibration_ready_calls / summary.pricing_calibration_observed_calls).toFixed(4)) : 0;
  if (summary.pricing_basis_drift_calls > 0) summary.pricing_calibration_state = "STALE_RUNTIME_BASIS";
  else if (summary.pricing_calibration_observed_calls === 0 || summary.pricing_basis_observed_calls === 0) summary.pricing_calibration_state = "INSUFFICIENT_EVIDENCE";
  else if (summary.pricing_recalibration_required_calls > 0 || summary.pricing_economics_certified_calls < summary.pricing_calibration_observed_calls || summary.pricing_production_certified_calls < summary.pricing_calibration_observed_calls) summary.pricing_calibration_state = "RECALIBRATION_REQUIRED";
  else if (summary.pricing_calibration_ready_calls === summary.pricing_calibration_observed_calls) summary.pricing_calibration_state = "CERTIFIED_ALIGNED";
  else summary.pricing_calibration_state = "INSUFFICIENT_EVIDENCE";
  summary.fast_compute_ms = summary.fast_compute_observed_calls ? Math.round(summary.fast_compute_total_ms / summary.fast_compute_observed_calls) : 0;
  summary.deep_compute_ms = summary.deep_compute_observed_calls ? Math.round(summary.deep_compute_total_ms / summary.deep_compute_observed_calls) : 0;
  summary.fast_compute_ms_per_output_1k_tokens = summary.fast_output_tokens > 0 ? Number((summary.fast_compute_total_ms / (summary.fast_output_tokens / 1000)).toFixed(3)) : 0;
  summary.deep_compute_ms_per_output_1k_tokens = summary.deep_output_tokens > 0 ? Number((summary.deep_compute_total_ms / (summary.deep_output_tokens / 1000)).toFixed(3)) : 0;
  summary.fast_supplier_cost_per_compute_second = summary.fast_compute_total_ms > 0 ? Number((summary.fast_supplier_cost / (summary.fast_compute_total_ms / 1000)).toFixed(6)) : 0;
  summary.deep_supplier_cost_per_compute_second = summary.deep_compute_total_ms > 0 ? Number((summary.deep_supplier_cost / (summary.deep_compute_total_ms / 1000)).toFixed(6)) : 0;
  summary.supplier_cost_per_compute_second = summary.compute_ms > 0 ? Number((summary.supplier_cost / (summary.compute_ms / 1000)).toFixed(6)) : 0;
  summary.supplier_cost_per_effective_uncached_input_1k_tokens = summary.effective_uncached_input_tokens > 0 ? Number((summary.supplier_cost / (summary.effective_uncached_input_tokens / 1000)).toFixed(6)) : 0;
  if (summary.compute_samples) {
    summary.engine_prepare_ms = Math.round(summary.engine_prepare_ms / summary.compute_samples);
    summary.compute_ms = Math.round(summary.compute_ms / summary.compute_samples);
    summary.structured_finalization_ms = Math.round(summary.structured_finalization_ms / summary.compute_samples);
  }
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
  const cacheObservedCalls = number(current.cache_observed_calls);
  const reuseOpportunity = number(current.stable_context_reuse_ratio);
  const cacheHitRatio = number(current.cache_hit_ratio);
  if (cacheObservedCalls >= 10 && reuseOpportunity >= 0.5 && cacheHitRatio < 0.2) signals.push("CACHE_REUSE_UNDERPERFORMING");
  if (number(current.pricing_basis_observed_calls) >= 3 && number(current.pricing_basis_drift_ratio) >= 0.5) signals.push("PRICING_BASIS_RUNTIME_DRIFT_HIGH");
  else if (number(current.pricing_basis_observed_calls) > 0 && number(current.pricing_basis_drift_ratio) > 0) signals.push("PRICING_BASIS_RUNTIME_DRIFT_REVIEW");
  if (current.pricing_calibration_state === "RECALIBRATION_REQUIRED") signals.push("PRICING_RECALIBRATION_REQUIRED");
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
      unique_static_contexts: Math.round(number(current.unique_static_contexts)),
      structural_cacheable_ratio: Number(number(current.structural_cacheable_ratio).toFixed(4)),
      cache_hit_ratio: Number(number(current.cache_hit_ratio).toFixed(4)),
      cached_input_ratio: Number(number(current.cached_input_ratio).toFixed(4)),
      cache_hit_latency_ms: Math.round(number(current.cache_hit_latency_ms)),
      cache_miss_latency_ms: Math.round(number(current.cache_miss_latency_ms)),
      cache_latency_delta_ms: Math.round(number(current.cache_latency_delta_ms)),
      cache_hit_generation_ms: Math.round(number(current.cache_hit_generation_ms)),
      cache_miss_generation_ms: Math.round(number(current.cache_miss_generation_ms)),
      cache_generation_delta_ms: Math.round(number(current.cache_generation_delta_ms)),
      engine_prepare_ms: Math.round(number(current.engine_prepare_ms)),
      compute_ms: Math.round(number(current.compute_ms)),
      structured_finalization_ms: Math.round(number(current.structured_finalization_ms)),
      compute_observation_coverage_ratio: Number(number(current.compute_observation_coverage_ratio).toFixed(4)),
      fast_compute_ms: Math.round(number(current.fast_compute_ms)),
      deep_compute_ms: Math.round(number(current.deep_compute_ms)),
      fast_compute_ms_per_output_1k_tokens: Number(number(current.fast_compute_ms_per_output_1k_tokens).toFixed(3)),
      deep_compute_ms_per_output_1k_tokens: Number(number(current.deep_compute_ms_per_output_1k_tokens).toFixed(3)),
      fast_supplier_cost_per_compute_second: Number(number(current.fast_supplier_cost_per_compute_second).toFixed(6)),
      deep_supplier_cost_per_compute_second: Number(number(current.deep_supplier_cost_per_compute_second).toFixed(6)),
      latency_timing_observation_coverage_ratio: Number(number(current.latency_timing_observation_coverage_ratio).toFixed(4)),
      fast_latency_timing_observation_coverage_ratio: Number(number(current.fast_latency_timing_observation_coverage_ratio).toFixed(4)),
      deep_latency_timing_observation_coverage_ratio: Number(number(current.deep_latency_timing_observation_coverage_ratio).toFixed(4)),
      request_queue_ms: Math.round(number(current.request_queue_ms)),
      time_to_first_token_ms: Math.round(number(current.time_to_first_token_ms)),
      decode_ms: Math.round(number(current.decode_ms)),
      scheduler_ms: Math.round(number(current.scheduler_ms)),
      model_forward_ms: Math.round(number(current.model_forward_ms)),
      model_execute_ms: Math.round(number(current.model_execute_ms)),
      fast_request_queue_ms: Math.round(number(current.fast_request_queue_ms)),
      deep_request_queue_ms: Math.round(number(current.deep_request_queue_ms)),
      fast_time_to_first_token_ms: Math.round(number(current.fast_time_to_first_token_ms)),
      deep_time_to_first_token_ms: Math.round(number(current.deep_time_to_first_token_ms)),
      fast_decode_ms: Math.round(number(current.fast_decode_ms)),
      deep_decode_ms: Math.round(number(current.deep_decode_ms)),
      fast_scheduler_ms: Math.round(number(current.fast_scheduler_ms)),
      deep_scheduler_ms: Math.round(number(current.deep_scheduler_ms)),
      fast_model_forward_ms: Math.round(number(current.fast_model_forward_ms)),
      deep_model_forward_ms: Math.round(number(current.deep_model_forward_ms)),
      fast_model_execute_ms: Math.round(number(current.fast_model_execute_ms)),
      deep_model_execute_ms: Math.round(number(current.deep_model_execute_ms)),
      cache_generation_evidence: current.cache_generation_evidence || "INSUFFICIENT",
      pricing_basis_drift_ratio: Number(number(current.pricing_basis_drift_ratio).toFixed(4)),
      pricing_calibration_ready_ratio: Number(number(current.pricing_calibration_ready_ratio).toFixed(4)),
      pricing_calibration_state: current.pricing_calibration_state || "INSUFFICIENT_EVIDENCE",
      supplier_cost_per_compute_second: Number(number(current.supplier_cost_per_compute_second).toFixed(6)),
      supplier_cost_per_effective_uncached_input_1k_tokens: Number(number(current.supplier_cost_per_effective_uncached_input_1k_tokens).toFixed(6)),
    },
    governance: {
      commercial_quota_assessed: false,
      authority_changed: false,
      cache_pricing_changed: false,
      unit_economics_certified: current.pricing_calibration_state === "CERTIFIED_ALIGNED",
    },
  };
}
