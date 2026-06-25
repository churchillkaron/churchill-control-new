import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const TARGETS = [
  "app/api",
  "app/(system)",
  "lib",
  "components",
];

const IGNORE = [
  "node_modules",
  ".next",
  ".git",
  "audits",
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

const files = TARGETS.flatMap(t => walk(path.join(ROOT, t)));

const contents = {};
for (const file of files) {
  contents[file] = fs.readFileSync(path.join(ROOT, file), "utf8");
}

function baseName(file) {
  return path.basename(file).replace(/\.(js|jsx|ts|tsx)$/, "");
}

const byBaseName = {};
for (const file of files) {
  const base = baseName(file);
  if (!byBaseName[base]) byBaseName[base] = [];
  byBaseName[base].push(file);
}

const duplicateNames = Object.entries(byBaseName)
  .filter(([_, list]) => list.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const imports = [];

for (const [file, text] of Object.entries(contents)) {
  const matches = [
    ...text.matchAll(/from\s+["']([^"']+)["']/g),
    ...text.matchAll(/import\(["']([^"']+)["']\)/g),
    ...text.matchAll(/require\(["']([^"']+)["']\)/g),
  ];

  for (const match of matches) {
    imports.push({
      file,
      target: match[1],
    });
  }
}

function normalizeImport(fromFile, target) {
  if (target.startsWith("@/")) {
    return target.replace("@/", "");
  }

  if (target.startsWith(".")) {
    const dir = path.dirname(fromFile);
    return path.normalize(path.join(dir, target));
  }

  return null;
}

const referenced = new Set();

for (const item of imports) {
  const normalized = normalizeImport(item.file, item.target);
  if (!normalized) continue;

  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
    referenced.add(normalized + ext);
    referenced.add(path.join(normalized, "index" + ext));
  }
}

const deadCandidates = files
  .filter(file => file.startsWith("lib/"))
  .filter(file => !referenced.has(file))
  .sort();

const operationalKeywords = [
  "pos",
  "table",
  "session",
  "order",
  "payment",
  "kitchen",
  "inventory",
  "production",
  "procurement",
  "finance",
  "payroll",
  "marketing",
  "customer",
  "tenant",
  "organization",
];

const operationalFiles = files
  .filter(file =>
    operationalKeywords.some(k =>
      file.toLowerCase().includes(k)
    )
  )
  .sort();

const riskyDuplicates = duplicateNames
  .filter(([name]) =>
    [
      "run",
      "create",
      "post",
      "process",
      "close",
      "reconcile",
      "calculate",
      "generate",
      "route",
      "index",
    ].some(k => name.toLowerCase().includes(k))
  );

const routeFiles = files
  .filter(file => file.startsWith("app/api/"))
  .filter(file => file.endsWith("route.js") || file.endsWith("route.ts"))
  .sort();

const pages = files
  .filter(file => file.startsWith("app/(system)"))
  .filter(file => file.endsWith("page.jsx") || file.endsWith("page.js"))
  .sort();

const report = {
  totals: {
    files: files.length,
    apiRoutes: routeFiles.length,
    systemPages: pages.length,
    imports: imports.length,
    duplicateNameGroups: duplicateNames.length,
    riskyDuplicateGroups: riskyDuplicates.length,
    deadLibCandidates: deadCandidates.length,
  },
  duplicateNames,
  riskyDuplicates,
  deadCandidates,
  operationalFiles,
  apiRoutes: routeFiles,
  pages,
};

fs.writeFileSync(
  path.join(ROOT, "audits/full-system-audit.json"),
  JSON.stringify(report, null, 2)
);

fs.writeFileSync(
  path.join(ROOT, "audits/full-system-audit-summary.txt"),
  [
    "FULL SYSTEM AUDIT",
    "=================",
    "",
    `Files: ${report.totals.files}`,
    `API routes: ${report.totals.apiRoutes}`,
    `System pages: ${report.totals.systemPages}`,
    `Imports: ${report.totals.imports}`,
    `Duplicate name groups: ${report.totals.duplicateNameGroups}`,
    `Risky duplicate groups: ${report.totals.riskyDuplicateGroups}`,
    `Dead lib candidates: ${report.totals.deadLibCandidates}`,
    "",
    "RISKY DUPLICATES",
    "----------------",
    ...riskyDuplicates.slice(0, 80).map(([name, list]) =>
      `${name}\n${list.map(f => "  - " + f).join("\n")}`
    ),
    "",
    "DEAD LIB CANDIDATES",
    "-------------------",
    ...deadCandidates.slice(0, 150),
  ].join("\n")
);

console.log("Audit complete");
console.log(report.totals);
console.log("");
console.log("Open:");
console.log("audits/full-system-audit-summary.txt");
console.log("audits/full-system-audit.json");
