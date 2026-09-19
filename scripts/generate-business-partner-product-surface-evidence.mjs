import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const OUTPUT = join(ROOT, "lib/operator/generated/BusinessPartnerProductSurfaceEvidence.generated.json");
const SOURCE_EXTENSIONS = /\.(?:js|jsx|mjs|ts|tsx|css|json)$/i;
const MAX_FILES_PER_SURFACE = 32;
const MAX_FILES_PER_ROOT = 8;
const MAX_EXCERPT_CHARS = 1000;
const SURFACES = {
  finance: ["/finance/", "lib/finance/", "finance"],
  people: ["/people/", "lib/people/", "payroll", "attendance", "scheduling"],
  supply_chain: ["/supply-chain/", "lib/inventory/", "production", "purchasing", "recipe"],
  operations: ["/operations/", "lib/restaurant/", "lib/hotel/", "pos", "work-control"],
  commercial: ["/commercial/", "lib/commercial/", "customers", "sales", "marketing"],
  documents: ["/documents/", "lib/documents/", "document"],
  creative: ["/creative/", "lib/creative/", "studio", "image", "video", "music"],
  administration: ["/administration/", "access-policy", "roles-permissions", "integrations"],
  analytics: ["/analytics/", "lib/analytics/", "reporting", "dashboard"],
  platform: ["lib/platform/", "/platform/", "workspace", "registry"],
  business_partner: ["lib/operator/", "business-partner", "operator", "syntheticintelligenceturnruntime"],
};

function clean(value) { return String(value ?? "").trim(); }
function filesystemSourceFiles() {
  const activeRoots = ["app", "components", "lib", "services"];
  const files = [];
  const visit = (absolutePath, relativePath) => {
    let entries = [];
    try { entries = readdirSync(absolutePath); } catch { return; }
    for (const name of entries) {
      const relative = relativePath ? `${relativePath}/${name}` : name;
      if (/(^|\/)(archive|experimental|deprecated|backup|backups|fixtures|__fixtures__)(\/|$)/i.test(relative)) continue;
      const absolute = join(absolutePath, name);
      let stats;
      try { stats = statSync(absolute); } catch { continue; }
      if (stats.isDirectory()) visit(absolute, relative);
      else if (stats.isFile() && SOURCE_EXTENSIONS.test(relative)) files.push(relative);
    }
  };
  for (const root of activeRoots) visit(join(ROOT, root), root);
  return files;
}
function trackedFiles() {
  const activeRoots = ["app/", "components/", "lib/", "services/"];
  let candidates = [];
  try {
    candidates = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n");
  } catch {
    candidates = filesystemSourceFiles();
  }
  return candidates
    .map(clean)
    .filter((path) => SOURCE_EXTENSIONS.test(path))
    .filter((path) => activeRoots.some((root) => path.startsWith(root)))
    .filter((path) => !/(^|\/)(archive|experimental|deprecated|backup|backups|fixtures|__fixtures__)(\/|$)/i.test(path));
}
function scorePath(path, terms) {
  const lower = path.toLowerCase();
  let score = terms.reduce((total, term) => total + (lower.includes(term.toLowerCase()) ? 3 : 0), 0);
  if (path.startsWith("components/") && /overview|workcenter|workspace|page|form|table|dashboard/i.test(path)) score += 5;
  if (path.startsWith("app/") && /page\.(?:js|jsx|ts|tsx)$/i.test(path)) score += 4;
  return score;
}
function excerptFor(path, terms) {
  let source = "";
  try { source = readFileSync(join(ROOT, path), "utf8"); } catch { return ""; }
  const lines = source.split("\n");
  const needles = terms.map((term) => term.replaceAll("/", "").replaceAll("-", " ").toLowerCase());
  const picked = [];
  for (let index = 0; index < lines.length && picked.join("\n").length < MAX_EXCERPT_CHARS; index += 1) {
    const line = lines[index].trim();
    if (!line || line.length > 500) continue;
    const lower = line.toLowerCase();
    if (needles.some((needle) => needle && lower.includes(needle)) || /export |function |class |return |<main|<section|<form|<table|button|input|mobile|preview|workflow|status|report/i.test(line)) {
      picked.push(`${index + 1}: ${line}`);
    }
  }
  return picked.join("\n").slice(0, MAX_EXCERPT_CHARS);
}
function currentHead() {
  try { return clean(execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" })); }
  catch { return null; }
}

const files = trackedFiles();
const surfaces = {};
for (const [surface, terms] of Object.entries(SURFACES)) {
  const ranked = files
    .map((path) => ({ path, score: scorePath(path, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const selected = ["app/", "components/", "lib/", "services/"]
    .flatMap((root) => ranked.filter((entry) => entry.path.startsWith(root)).slice(0, MAX_FILES_PER_ROOT))
    .slice(0, MAX_FILES_PER_SURFACE)
    .map((entry) => ({ path: entry.path, excerpt: excerptFor(entry.path, terms) }))
    .filter((entry) => entry.excerpt);
  surfaces[surface] = selected;
}

const output = {
  contract: "AVANTIQO_BUSINESS_PARTNER_PRODUCT_SURFACE_EVIDENCE_V1",
  evidence_class: "SOURCE_EVIDENCE_ONLY",
  generated_at: new Date().toISOString(),
  repository_head: currentHead(),
  limits: { max_files_per_surface: MAX_FILES_PER_SURFACE, max_excerpt_chars: MAX_EXCERPT_CHARS },
  disclaimer: "Current tracked-source evidence only. It is not browser, test, runtime, deployment, or business-state verification.",
  surfaces,
};
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`BUSINESS_PARTNER_PRODUCT_SURFACE_EVIDENCE=${OUTPUT}`);
