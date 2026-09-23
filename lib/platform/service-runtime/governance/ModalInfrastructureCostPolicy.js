export const MODAL_H100_INFRASTRUCTURE = "MODAL_H100_ASYNC_V1";
export const MODAL_H100_GPU = "H100";
export const DEFAULT_MODAL_H100_USD_PER_SECOND = 0.001097;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function modalH100RateUsdPerSecond(env = process.env) {
  const configured = finite(
    env.AVANTIQO_MODAL_H100_USD_PER_SECOND ?? env.MODAL_H100_USD_PER_SECOND,
    null,
  );
  return configured !== null && configured > 0
    ? configured
    : DEFAULT_MODAL_H100_USD_PER_SECOND;
}

export function modalH100SupplierCostUsd({
  elapsedSeconds,
  rateUsdPerSecond = modalH100RateUsdPerSecond(),
} = {}) {
  const elapsed = finite(elapsedSeconds, null);
  const rate = finite(rateUsdPerSecond, null);
  if (elapsed === null || elapsed < 0 || rate === null || rate <= 0) return null;
  return Number((elapsed * rate).toFixed(9));
}
