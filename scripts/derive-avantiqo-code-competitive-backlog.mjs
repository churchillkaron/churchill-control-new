import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_COMPETITIVE_IMPROVEMENT_BACKLOG_V1";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const REPORT_CONTRACT = "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1";
const reportPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_REPORT || "/tmp/avantiqo-code-competitive-benchmark.json");
const suitePath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_SUITE || "benchmarks/avantiqo-code-frontier-engineering-suite.json");
const outputPath = resolve(process.env.AVANTIQO_CODE_COMPETITIVE_BACKLOG || "/tmp/avantiqo-code-competitive-backlog.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const suite = JSON.parse(await readFile(suitePath, "utf8"));
if (report.contract !== REPORT_CONTRACT) throw new Error("AVANTIQO_CODE_COMPETITIVE_REPORT_CONTRACT_INVALID");
if (suite.contract !== SUITE_CONTRACT) throw new Error("AVANTIQO_CODE_COMPETITIVE_SUITE_CONTRACT_INVALID");
const cases = new Map(suite.cases.map((item) => [item.case_id, item]));
const losses = new Map();
for (const comparison of report.comparisons || []) {
  const reference = `${comparison?.reference?.provider || "unknown"}/${comparison?.reference?.model || "unknown"}`;
  for (const result of comparison.cases || []) {
    if (result.outcome !== "LOSS") continue;
    const spec = cases.get(result.case_id);
    if (!spec) continue;
    const current = losses.get(result.case_id) || { case_id: result.case_id, category: spec.category, title: spec.title, required_evidence: spec.required_evidence, losses: 0, references: [] };
    current.losses += 1;
    current.references.push(reference);
    losses.set(result.case_id, current);
  }
}
const backlog = [...losses.values()].sort((a, b) => b.losses - a.losses || a.case_id.localeCompare(b.case_id));
const payload = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  source_report_contract: REPORT_CONTRACT,
  source_suite_contract: SUITE_CONTRACT,
  authorization_effect: "NONE",
  automatic_commit_allowed: false,
  production_deploy_allowed: false,
  items: backlog,
  next_focus: backlog[0] || null,
};
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ contract: CONTRACT, output_path: outputPath, backlog_items: backlog.length, next_focus: backlog[0]?.case_id || null }, null, 2));
