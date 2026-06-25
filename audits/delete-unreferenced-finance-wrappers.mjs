import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const candidates = [
  "lib/finance/closeAccountingPeriod.js",
  "lib/finance/createARInvoice.js",
  "lib/finance/createAccountingPeriod.js",
  "lib/finance/createApprovalRequest.js",
  "lib/finance/createBankAccount.js",
  "lib/finance/createCurrencyRate.js",
  "lib/finance/createCustomer.js",
  "lib/finance/createTaxRate.js",
  "lib/finance/createVendor.js",
  "lib/finance/runConsolidation.js",
  "lib/finance/runDepreciation.js",
  "lib/finance/runForecasting.js",
  "lib/finance/runFraudDetection.js",
  "lib/finance/runMonthEndClose.js",
  "lib/finance/runPeriodClose.js",
  "lib/finance/runRetainedEarnings.js",
  "lib/finance/runRiskAnalysis.js",
  "lib/finance/index.js",
  "lib/finance/accounts-payable/index.js",
  "lib/finance/general-ledger/index.js",
  "lib/finance/year-end/index.js"
];

const sourceRoots = [
  "app",
  "lib",
  "components"
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
    ) {
      continue;
    }

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

const allFiles = sourceRoots.flatMap(root =>
  walk(path.join(ROOT, root))
);

function references(candidate) {
  const withoutExt = candidate.replace(/\.(js|jsx|ts|tsx)$/, "");
  const alias = "@/" + withoutExt;
  const relativeNeedle = withoutExt;

  const refs = [];

  for (const file of allFiles) {
    if (file === candidate) continue;

    const text = fs.readFileSync(path.join(ROOT, file), "utf8");

    if (
      text.includes(alias) ||
      text.includes(relativeNeedle)
    ) {
      refs.push(file);
    }
  }

  return refs;
}

const deleted = [];
const blocked = [];

for (const candidate of candidates) {
  const full = path.join(ROOT, candidate);

  if (!fs.existsSync(full)) {
    continue;
  }

  const refs = references(candidate);

  if (refs.length === 0) {
    fs.rmSync(full);
    deleted.push(candidate);
  } else {
    blocked.push({
      file: candidate,
      refs
    });
  }
}

fs.writeFileSync(
  "audits/deleted-finance-wrappers.json",
  JSON.stringify({ deleted, blocked }, null, 2)
);

console.log("Deleted:");
console.log(deleted.join("\n") || "none");

console.log("");
console.log("Blocked:");
for (const item of blocked) {
  console.log(item.file);
  for (const ref of item.refs.slice(0, 10)) {
    console.log("  - " + ref);
  }
}
