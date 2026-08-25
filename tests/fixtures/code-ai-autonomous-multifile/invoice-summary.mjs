import { normalizeMoney } from "./normalize-money.mjs";

export function summarizeInvoice(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
  return {
    total: safeLines.reduce((sum, line) => sum + normalizeMoney(line?.amount), 0),
    valid_line_count: safeLines.length,
  };
}
