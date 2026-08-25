export function normalizeMoney(value) {
  return Number.isFinite(value) ? value : 0;
}
