import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const FINANCE_PATHS = [
  "lib/finance",
  "app/api/finance",
  "app/(system)/workspace/[organizationId]/finance",
];

const IGNORE = [
  ".bak",
  ".legacy",
  ".backup",
  ".before",
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(ROOT, full);

    if (IGNORE.some(x => rel.includes(x))) continue;

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

const allFiles = FINANCE_PATHS.flatMap(p =>
  walk(path.join(ROOT, p))
).sort();

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function base(file) {
  return path.basename(file).replace(/\.(js|jsx|ts|tsx)$/, "");
}

const byName = {};
for (const file of allFiles) {
  const name = base(file);
  byName[name] ||= [];
  byName[name].push(file);
}

const duplicateNames = Object.entries(byName)
  .filter(([_, files]) => files.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const classifications = [];

for (const file of allFiles) {
  const text = read(file);

  let type = "REVIEW";

  if (file.includes("/core/")) type = "POSSIBLE_ENGINE";
  if (file.includes("/route.")) type = "API";
  if (file.includes("/page.")) type = "UI";
  if (file.includes("/runtime/")) type = "RUNTIME";
  if (file.includes("/reports/") || file.includes("/reporting/")) type = "REPORTING";
  if (file.includes("/workflow/")) type = "WORKFLOW";
  if (file.includes("/automation/")) type = "AUTOMATION";
  if (file.includes("/analytics/")) type = "ANALYTICS";

  const hasDBWrite =
    text.includes(".insert(") ||
    text.includes(".update(") ||
    text.includes(".delete(") ||
    text.includes(".upsert(");

  classifications.push({
    file,
    type,
    lines: text.split("\n").length,
    exports: [
      ...text.matchAll(/export\s+(async\s+)?function\s+([A-Za-z0-9_]+)/g),
    ].map(m => m[2]),
    defaultExport: text.includes("export default"),
    usesSupabaseAdmin: text.includes("supabaseAdmin"),
    usesOrganizationId: text.includes("organizationId") || text.includes("organization_id"),
    usesTenantId: text.includes("tenantId") || text.includes("tenant_id"),
    hasDBWrite,
  });
}

const suspicious = classifications.filter(x =>
  x.file.includes("/core/") &&
  x.usesTenantId &&
  !x.usesOrganizationId
);

const likelyWrappers = classifications.filter(x =>
  x.lines <= 35 &&
  x.type === "REVIEW"
);

const report = {
  totals: {
    financeFiles: allFiles.length,
    duplicateNameGroups: duplicateNames.length,
    suspiciousTenantOnlyCoreFiles: suspicious.length,
    likelyWrappers: likelyWrappers.length,
  },
  duplicateNames,
  suspiciousTenantOnlyCoreFiles: suspicious,
  likelyWrappers,
  classifications,
};

fs.writeFileSync(
  "audits/finance-domain-audit.json",
  JSON.stringify(report, null, 2)
);

fs.writeFileSync(
  "audits/finance-domain-audit-summary.txt",
  [
    "FINANCE DOMAIN AUDIT",
    "====================",
    "",
    `Finance files: ${report.totals.financeFiles}`,
    `Duplicate name groups: ${report.totals.duplicateNameGroups}`,
    `Suspicious tenant-only core files: ${report.totals.suspiciousTenantOnlyCoreFiles}`,
    `Likely wrappers: ${report.totals.likelyWrappers}`,
    "",
    "DUPLICATE NAMES",
    "---------------",
    ...duplicateNames.map(([name, files]) =>
      `${name}\n${files.map(f => "  - " + f).join("\n")}`
    ),
    "",
    "LIKELY WRAPPERS",
    "---------------",
    ...likelyWrappers.map(x => `${x.file} (${x.lines} lines)`),
    "",
    "TENANT-ONLY CORE WARNINGS",
    "-------------------------",
    ...suspicious.map(x => x.file),
  ].join("\n")
);

console.log("Finance audit complete");
console.log(report.totals);
