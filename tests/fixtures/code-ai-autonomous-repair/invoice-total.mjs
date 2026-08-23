// Intentionally broken certification fixture.
//
// This file is never executed by the normal repository test/build pipeline. It
// exists only so the live Avantiqo Code AI autonomy certification can prove that
// the agent observes a real failure, repairs source inside an isolated Sandbox,
// verifies the repair, and produces an evidence-backed diff without mutating
// GitHub main.
export function sumInvoiceLines(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((sum, line) => sum + (line?.total || 0), 0);
}
