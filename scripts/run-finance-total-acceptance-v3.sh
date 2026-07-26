#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_LAUNCHER="$PROJECT_ROOT/scripts/run-finance-total-acceptance.sh"
BASE_ORCHESTRATOR="$PROJECT_ROOT/scripts/finance-total-acceptance.mjs"
TEMP_LAUNCHER="/tmp/avantiqo-finance-total-acceptance-v3-$$.sh"
TEMP_ORCHESTRATOR="/tmp/avantiqo-finance-total-acceptance-v3-$$.mjs"

cleanup() {
  rm -f "$TEMP_LAUNCHER" "$TEMP_ORCHESTRATOR"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT" || exit 1

for required in "$BASE_LAUNCHER" "$BASE_ORCHESTRATOR"; do
  if [ ! -f "$required" ]; then
    echo "Missing required file: $required"
    exit 1
  fi
done

node - "$BASE_ORCHESTRATOR" "$TEMP_ORCHESTRATOR" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

const parserStart = source.indexOf("function financeWorkspaceSection");
const parserEnd = source.indexOf("function parseOperationalEndpoints", parserStart);
if (parserStart < 0 || parserEnd < 0) {
  throw new Error("Unable to locate Finance route parser block");
}

const parser = String.raw`function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character || "");
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/.test(character || "");
}

function skipQuoted(source, index, quote) {
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return source.length;
}

function skipLineComment(source, index) {
  const end = source.indexOf("\n", index + 2);
  return end < 0 ? source.length : end;
}

function skipBlockComment(source, index) {
  const end = source.indexOf("*/", index + 2);
  return end < 0 ? source.length : end + 2;
}

function findMatchingBrace(source, start) {
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    const next = source[cursor + 1];
    if (character === '"' || character === "'" || character === "\`") {
      cursor = skipQuoted(source, cursor, character) - 1;
      continue;
    }
    if (character === "/" && next === "/") {
      cursor = skipLineComment(source, cursor) - 1;
      continue;
    }
    if (character === "/" && next === "*") {
      cursor = skipBlockComment(source, cursor) - 1;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function extractObjectAfter(source, marker, fromIndex = 0) {
  const markerIndex = source.indexOf(marker, fromIndex);
  if (markerIndex < 0) return "";
  const braceStart = source.indexOf("{", markerIndex + marker.length);
  if (braceStart < 0) return "";
  const braceEnd = findMatchingBrace(source, braceStart);
  return braceEnd < 0 ? "" : source.slice(braceStart, braceEnd + 1);
}

function directProperties(objectSource) {
  const names = [];
  const stringValues = new Map();
  let curlyDepth = 0;
  let squareDepth = 0;
  let parenDepth = 0;

  for (let cursor = 0; cursor < objectSource.length; cursor += 1) {
    const character = objectSource[cursor];
    const next = objectSource[cursor + 1];

    if (character === '"' || character === "'" || character === "\`") {
      cursor = skipQuoted(objectSource, cursor, character) - 1;
      continue;
    }
    if (character === "/" && next === "/") {
      cursor = skipLineComment(objectSource, cursor) - 1;
      continue;
    }
    if (character === "/" && next === "*") {
      cursor = skipBlockComment(objectSource, cursor) - 1;
      continue;
    }

    if (character === "{") { curlyDepth += 1; continue; }
    if (character === "}") { curlyDepth -= 1; continue; }
    if (character === "[") { squareDepth += 1; continue; }
    if (character === "]") { squareDepth -= 1; continue; }
    if (character === "(") { parenDepth += 1; continue; }
    if (character === ")") { parenDepth -= 1; continue; }

    if (curlyDepth !== 1 || squareDepth !== 0 || parenDepth !== 0 || !isIdentifierStart(character)) continue;

    let previous = cursor - 1;
    while (previous >= 0 && /\s/.test(objectSource[previous])) previous -= 1;
    if (previous >= 0 && objectSource[previous] !== "{" && objectSource[previous] !== ",") continue;

    let keyEnd = cursor + 1;
    while (keyEnd < objectSource.length && isIdentifierPart(objectSource[keyEnd])) keyEnd += 1;
    const key = objectSource.slice(cursor, keyEnd);
    let valueStart = keyEnd;
    while (valueStart < objectSource.length && /\s/.test(objectSource[valueStart])) valueStart += 1;
    if (objectSource[valueStart] !== ":") continue;

    names.push(key);
    valueStart += 1;
    while (valueStart < objectSource.length && /\s/.test(objectSource[valueStart])) valueStart += 1;
    if (objectSource[valueStart] === '"' || objectSource[valueStart] === "'") {
      const quote = objectSource[valueStart];
      const valueEnd = skipQuoted(objectSource, valueStart, quote);
      stringValues.set(key, objectSource.slice(valueStart + 1, valueEnd - 1));
      cursor = valueEnd - 1;
    } else {
      cursor = keyEnd - 1;
    }
  }

  return { names, stringValues };
}

function collectObjectProperties(section) {
  const objects = [];
  const stack = [];
  for (let cursor = 0; cursor < section.length; cursor += 1) {
    const character = section[cursor];
    const next = section[cursor + 1];
    if (character === '"' || character === "'" || character === "\`") {
      cursor = skipQuoted(section, cursor, character) - 1;
      continue;
    }
    if (character === "/" && next === "/") {
      cursor = skipLineComment(section, cursor) - 1;
      continue;
    }
    if (character === "/" && next === "*") {
      cursor = skipBlockComment(section, cursor) - 1;
      continue;
    }
    if (character === "{") stack.push(cursor);
    if (character === "}") {
      const start = stack.pop();
      if (start !== undefined) objects.push(directProperties(section.slice(start, cursor + 1)));
    }
  }
  return objects;
}

function parsePrimaryActionIds(policy) {
  const frozen = extractObjectAfter(policy, "FINANCE_PRIMARY_ACTION_POLICY = Object.freeze(");
  return [...new Set(directProperties(frozen).names)];
}

function parseFinanceRoutes(registry, policyIds) {
  const workspacesIndex = registry.indexOf("workspaces: {");
  const section = extractObjectAfter(registry, "finance: {", workspacesIndex);
  const routes = [];
  for (const object of collectObjectProperties(section)) {
    const id = object.stringValues.get("id");
    const route = object.stringValues.get("route");
    if (!id || !route || !policyIds.has(id) || !route.startsWith("/finance")) continue;
    routes.push({ id, route });
  }
  return [...new Map(routes.map((row) => [row.id, row])).values()];
}

`;

source = source.slice(0, parserStart) + parser + source.slice(parserEnd);
source = source.replace(
  "  const routes = parseFinanceRoutes(registry);\n  const endpoints = parseOperationalEndpoints(policy);",
  "  const policyIds = parsePrimaryActionIds(policy);\n  const routes = parseFinanceRoutes(registry, new Set(policyIds));\n  const endpoints = parseOperationalEndpoints(policy);\n  const missingRouteIds = policyIds.filter((id) => !routes.some((route) => route.id === id));"
);
source = source.replace(
  /  add\("registry", "Finance routes discovered",[\s\S]*?\n  add\("registry", "Primary action policies", \(policy\.match\(\/mode:\\s\*\["'\]\/g\) \|\| \[\]\)\.length >= 67, \{[\s\S]*?\n  \}\);/,
  `  add("registry", "Finance routes discovered", routes.length === 67 && missingRouteIds.length === 0, {
    actual: routes.length,
    expected: 67,
    missingRouteIds,
  });
  add("registry", "Primary action policies", policyIds.length === 67, {
    actual: policyIds.length,
    expected: 67,
  });`
);
source = source.replace(
  'supabase.rpc("finance_run_total_acceptance_probe_v2"',
  'supabase.rpc("finance_run_total_acceptance_probe_v3"'
);

for (const expected of [
  "function parsePrimaryActionIds",
  "routes.length === 67",
  'finance_run_total_acceptance_probe_v3',
]) {
  if (!source.includes(expected)) throw new Error(`Orchestrator v3 patch missing: ${expected}`);
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

node --check "$TEMP_ORCHESTRATOR" || exit 1

node - "$BASE_LAUNCHER" "$TEMP_LAUNCHER" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

source = source
  .replaceAll(
    "20260726103000_finance_total_acceptance_probe_v2.sql",
    "20260726110000_finance_total_acceptance_probe_v3.sql"
  )
  .replaceAll("20260726103000", "20260726110000")
  .replaceAll("Acceptance probe v2", "Acceptance probe v3")
  .replaceAll("acceptance probe v2", "acceptance probe v3")
  .replaceAll("Acceptance migration v2", "Acceptance migration v3")
  .replaceAll("acceptance migration v2", "acceptance migration v3")
  .replace(
    "node scripts/finance-total-acceptance.mjs",
    'node "$TEMP_ORCHESTRATOR"'
  );

for (const expected of [
  "20260726110000_finance_total_acceptance_probe_v3.sql",
  "20260726110000",
  "Acceptance probe v3",
  "acceptance migration v3",
  'node "$TEMP_ORCHESTRATOR"',
]) {
  if (!source.includes(expected)) throw new Error(`Launcher v3 patch missing: ${expected}`);
}

for (const obsolete of [
  "20260726103000_finance_total_acceptance_probe_v2.sql",
  "Dry run did not show the expected acceptance migration v2",
  "Acceptance probe v2 is already deployed",
]) {
  if (source.includes(obsolete)) throw new Error(`Launcher v3 still contains obsolete gate: ${obsolete}`);
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

bash -n "$TEMP_LAUNCHER" || exit 1
export TEMP_ORCHESTRATOR
bash "$TEMP_LAUNCHER"
