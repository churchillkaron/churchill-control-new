const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

function percentile(values, ratio) {
  const sorted = values.map(finite).filter((value) => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function certifyCodeAIFrontierLatency(observations = [], options = {}) {
  const rows = Array.isArray(observations) ? observations : [];
  const warmP50LimitMs = finite(options.warm_p50_limit_ms) ?? 2500;
  const warmP95LimitMs = finite(options.warm_p95_limit_ms) ?? 4000;
  const coldStartLimitMs = finite(options.cold_start_limit_ms) ?? 10000;
  const minimumWarmSamples = Math.max(1, Number(options.minimum_warm_samples) || 10);
  const warmRows = rows.filter((row) => row?.code_runtime_model_already_gpu_resident === true);
  const coldRows = rows.filter((row) => row?.code_runtime_model_already_gpu_resident !== true);
  const warmWall = warmRows.map((row) => finite(row?.wall_ms)).filter((value) => value !== null);
  const coldWall = coldRows.map((row) => finite(row?.wall_ms)).filter((value) => value !== null);
  const cpuFallbackCount = rows.filter((row) => row?.code_cpu_fallback === true).length;
  const warmP50 = percentile(warmWall, 0.5);
  const warmP95 = percentile(warmWall, 0.95);
  const coldStartMax = coldWall.length ? Math.max(...coldWall) : null;
  const checks = {
    minimum_warm_samples: warmWall.length >= minimumWarmSamples,
    warm_p50_within_limit: warmP50 !== null && warmP50 <= warmP50LimitMs,
    warm_p95_within_limit: warmP95 !== null && warmP95 <= warmP95LimitMs,
    cold_start_within_limit: coldStartMax === null || coldStartMax <= coldStartLimitMs,
    cpu_fallback_forbidden: cpuFallbackCount === 0,
  };
  return {
    contract: "AVANTIQO_CODE_FRONTIER_LATENCY_CERTIFICATION_V1",
    passed: Object.values(checks).every(Boolean),
    checks,
    limits: {
      warm_p50_ms: warmP50LimitMs,
      warm_p95_ms: warmP95LimitMs,
      cold_start_ms: coldStartLimitMs,
      minimum_warm_samples: minimumWarmSamples,
    },
    measurements: {
      total_samples: rows.length,
      warm_samples: warmWall.length,
      cold_samples: coldWall.length,
      warm_p50_ms: warmP50,
      warm_p95_ms: warmP95,
      cold_start_max_ms: coldStartMax,
      cpu_fallback_count: cpuFallbackCount,
      gpu_residency_rate: rows.length ? Number((warmRows.length / rows.length).toFixed(4)) : 0,
    },
  };
}
