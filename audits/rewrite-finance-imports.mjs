import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const rewrites = [
  [
    "@/lib/finance/core/createBudget",
    "@/lib/finance/budgeting/createBudget",
  ],
  [
    "@/lib/finance/core/createIntercompanyTransaction",
    "@/lib/finance/intercompany/createIntercompanyTransaction",
  ],
  [
    "@/lib/finance/core/runBankReconciliation",
    "@/lib/finance/reconciliation/runBankReconciliation",
  ],
  [
    "@/lib/finance/core/runConsolidation",
    "@/lib/finance/consolidation/runConsolidation",
  ],
  [
    "@/lib/finance/core/runYearEndClose",
    "@/lib/finance/year-end/runYearEndClose",
  ],
  [
    "@/lib/finance/core/getEnterpriseHealth",
    "@/lib/finance/executive/getEnterpriseHealth",
  ],
  [
    "@/lib/finance/core/createCostCenter",
    "@/lib/finance/cost-centers/createCostCenter",
  ],
];

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
      files.push(full);
    }
  }

  return files;
}

const files = [
  ...walk(path.join(ROOT, "app")),
  ...walk(path.join(ROOT, "lib")),
  ...walk(path.join(ROOT, "components")),
];

let changed = 0;

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  const original = text;

  for (const [from, to] of rewrites) {
    text = text.split(from).join(to);
  }

  if (text !== original) {
    fs.writeFileSync(file, text);
    changed++;
    console.log("UPDATED", path.relative(ROOT, file));
  }
}

console.log("");
console.log("FILES UPDATED:", changed);
