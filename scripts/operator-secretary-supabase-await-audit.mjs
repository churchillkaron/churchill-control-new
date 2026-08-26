import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SECRETARY_DIR = path.join(ROOT, "lib", "operator", "secretary");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:js|mjs|cjs)$/.test(entry.name) ? [absolute] : [];
  });
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function unresolvedResultHelpers(source) {
  const findings = [];
  const helperPattern = /async\s+function\s+([A-Za-z_$][\w$]*)\s*\(\s*result\s*\)\s*\{([\s\S]*?)\n\}/g;
  for (const match of source.matchAll(helperPattern)) {
    const body = match[2];
    const readsResponse = /\bresult\.(?:error|data|count|status|statusText)\b/.test(body);
    if (!readsResponse) continue;
    const awaitsResponse = /\bawait\s+result\b/.test(body);
    if (awaitsResponse) continue;
    findings.push({ helper: match[1], offset: match.index || 0 });
  }
  return findings;
}

if (!fs.existsSync(SECRETARY_DIR)) {
  console.error("OPERATOR_SECRETARY_SUPABASE_AWAIT_AUDIT=FAIL");
  console.error("SECRETARY_SUPABASE_AWAIT_AUDIT_REASON=SECRETARY_DIRECTORY_NOT_FOUND");
  process.exit(1);
}

const findings = [];
for (const file of sourceFiles(SECRETARY_DIR)) {
  const source = fs.readFileSync(file, "utf8");
  for (const finding of unresolvedResultHelpers(source)) {
    findings.push({ file: relative(file), ...finding });
  }
}

if (findings.length) {
  console.error("OPERATOR_SECRETARY_SUPABASE_AWAIT_AUDIT=FAIL");
  console.error(`SECRETARY_SUPABASE_UNAWAITED_HELPER_COUNT=${findings.length}`);
  for (const finding of findings) {
    console.error(`SECRETARY_SUPABASE_UNAWAITED_HELPER=${finding.file}:${finding.helper}`);
  }
  console.error("SECRETARY_SUPABASE_RESPONSE_READS_REQUIRE_AWAIT=true");
  process.exit(1);
}

console.log("OPERATOR_SECRETARY_SUPABASE_AWAIT_AUDIT=PASS");
console.log("SECRETARY_SUPABASE_UNAWAITED_HELPER_COUNT=0");
console.log("SECRETARY_SUPABASE_RESPONSE_READS_REQUIRE_AWAIT=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
