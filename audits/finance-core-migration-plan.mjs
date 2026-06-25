import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const moves = [
  ["lib/finance/core/createBudget.js", "lib/finance/budgeting/createBudget.js"],
  ["lib/finance/core/createIntercompanyTransaction.js", "lib/finance/intercompany/createIntercompanyTransaction.js"],
  ["lib/finance/core/runBankReconciliation.js", "lib/finance/reconciliation/runBankReconciliation.js"],
  ["lib/finance/core/runConsolidation.js", "lib/finance/consolidation/runConsolidation.js"],
  ["lib/finance/core/runYearEndClose.js", "lib/finance/year-end/runYearEndClose.js"],
  ["lib/finance/core/getEnterpriseHealth.js", "lib/finance/executive/getEnterpriseHealth.js"],
  ["lib/finance/core/createCostCenter.js", "lib/finance/cost-centers/createCostCenter.js"],
];

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full);

    if (
      rel.includes("node_modules") ||
      rel.includes(".next") ||
      rel.includes(".git") ||
      rel.includes("audits/")
    ) continue;

    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full, files);
    } else if (
      full.endsWith(".js") ||
      full.endsWith(".jsx") ||
      full.endsWith(".ts") ||
      full.endsWith(".tsx")
    ) {
      files.push(rel);
    }
  }

  return files;
}

const sourceFiles = walk(path.join(ROOT, "app"))
  .concat(walk(path.join(ROOT, "lib")))
  .concat(walk(path.join(ROOT, "components")));

const report = [];

for (const [from, to] of moves) {
  const fromNoExt = from.replace(/\.(js|jsx|ts|tsx)$/, "");
  const toNoExt = to.replace(/\.(js|jsx|ts|tsx)$/, "");

  const fromAlias = "@/" + fromNoExt;
  const toAlias = "@/" + toNoExt;

  const references = [];

  for (const file of sourceFiles) {
    if (!exists(file)) continue;

    const text = fs.readFileSync(path.join(ROOT, file), "utf8");

    if (
      text.includes(fromAlias) ||
      text.includes(fromNoExt)
    ) {
      references.push(file);
    }
  }

  report.push({
    from,
    to,
    fromExists: exists(from),
    toExists: exists(to),
    fromAlias,
    toAlias,
    references,
  });
}

fs.writeFileSync(
  "audits/finance-core-migration-plan.json",
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));
