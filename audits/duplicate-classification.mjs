import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const auditPath = path.join(ROOT, "audits/full-system-audit.json");

if (!fs.existsSync(auditPath)) {
  throw new Error("Missing audits/full-system-audit.json");
}

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function importCount(targetFile) {
  const allFiles = [
    ...audit.apiRoutes,
    ...audit.pages,
    ...audit.operationalFiles,
  ];

  const name = targetFile
    .replace(/\.(js|jsx|ts|tsx)$/, "")
    .replace(/^lib\//, "@/lib/");

  let count = 0;

  for (const file of allFiles) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    const text = read(file);

    if (
      text.includes(name) ||
      text.includes(targetFile.replace(/\.(js|jsx|ts|tsx)$/, ""))
    ) {
      count++;
    }
  }

  return count;
}

const priorityGroups = [
  "createAuditLog",
  "closeAccountingPeriod",
  "runBankReconciliation",
  "runConsolidation",
  "runYearEndClose",
  "createPurchaseOrder",
  "createPurchaseRequest",
  "runThreeWayMatch",
  "createBudget",
  "calculateRecipeCost",
  "createIntercompanyTransaction",
  "generateBalanceSheet",
  "processPayrollPayout",
  "closePayrollPeriod",
];

const duplicateMap = Object.fromEntries(audit.duplicateNames || []);

const result = {};

for (const groupName of priorityGroups) {
  const files = duplicateMap[groupName] || [];

  result[groupName] = files.map(file => {
    const text = read(file);

    return {
      file,
      lines: text.split("\n").length,
      importedByApprox: importCount(file),
      exports: [
        ...text.matchAll(/export\s+(async\s+)?function\s+([A-Za-z0-9_]+)/g),
      ].map(m => m[2]),
      importsSupabaseAdmin: text.includes("supabaseAdmin"),
      importsSharedAudit: text.includes("shared/audit"),
      importsFinanceCore: text.includes("finance/core"),
      importsProcurementCore: text.includes("procurement/core"),
      hasDirectDBWrites:
        text.includes(".insert(") ||
        text.includes(".update(") ||
        text.includes(".delete("),
      hasTODO:
        text.includes("TODO") ||
        text.includes("FIXME"),
    };
  });
}

fs.writeFileSync(
  path.join(ROOT, "audits/duplicate-classification.json"),
  JSON.stringify(result, null, 2)
);

const summary = [];

summary.push("DUPLICATE CLASSIFICATION");
summary.push("========================");
summary.push("");

for (const [name, files] of Object.entries(result)) {
  summary.push(name);
  summary.push("-".repeat(name.length));

  for (const item of files) {
    summary.push(`- ${item.file}`);
    summary.push(`  lines: ${item.lines}`);
    summary.push(`  importedByApprox: ${item.importedByApprox}`);
    summary.push(`  exports: ${item.exports.join(", ") || "-"}`);
    summary.push(`  directDBWrites: ${item.hasDirectDBWrites}`);
    summary.push(`  supabaseAdmin: ${item.importsSupabaseAdmin}`);
  }

  summary.push("");
}

fs.writeFileSync(
  path.join(ROOT, "audits/duplicate-classification-summary.txt"),
  summary.join("\n")
);

console.log("Duplicate classification complete");
console.log("Open audits/duplicate-classification-summary.txt");
