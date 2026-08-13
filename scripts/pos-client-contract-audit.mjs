import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APPLICATION_REGISTRY = "lib/operations/commerce/server/POSApplicationRegistry.js";
const SURFACE_REGISTRY =
  "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx";
const ROUTE_ROOT = "app/api/pos";

// An adapter only forces the *client* to send the entity when it rejects a
// missing entity AND has no server-side fallback. Adapters that fall back to the
// authenticated access context resolve it themselves, so a client that omits it
// still works and must not be reported.
const ENTITY_REJECTED_WHEN_MISSING =
  /if\s*\(\s*!\s*(?:entityId|scope\.entityId)\s*\)[\s\S]{0,240}?throw/;
const ENTITY_RESOLVED_FROM_ACCESS =
  /readEntityId\s*\(\s*access|access\??\.(?:access\??\.)?\s*entity_?[Ii]d|access\??\.(?:access\??\.)?\s*legal_?[Ee]ntity_?[Ii]d/;

// The entity must be handed to the request itself. Text windows are unreliable
// here: a guard like `if (!entityId)` or JSX `{!entityId}` sits near the call
// without passing anything. So the fetch call is extracted by paren matching and
// only its arguments are inspected, plus any request-building variable it
// interpolates (for example `${search.toString()}`).
function matchingCloseParen(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function enclosingFetchCall(source, endpointIndex) {
  const fetchIndex = source.lastIndexOf("fetch(", endpointIndex);
  if (fetchIndex === -1) return null;

  const openIndex = source.indexOf("(", fetchIndex);
  const closeIndex = matchingCloseParen(source, openIndex);
  if (closeIndex === -1 || closeIndex < endpointIndex) return null;

  return { start: fetchIndex, text: source.slice(fetchIndex, closeIndex + 1) };
}

function interpolatedRequestBuilders(callText, source, callStart) {
  let extra = "";

  for (const match of callText.matchAll(/\$\{\s*([A-Za-z0-9_$]+)\s*(?:\.[A-Za-z0-9_$]+\(\))?\s*\}/g)) {
    const name = match[1];
    const before = source.slice(0, callStart);
    const declaration = new RegExp(`(?:const|let|var)\\s+${name}\\s*=`, "g");

    let found;
    let declarationIndex = -1;
    while ((found = declaration.exec(before))) declarationIndex = found.index;
    if (declarationIndex === -1) continue;

    // A request builder is usually declared then mutated (search.set(...)) before
    // the fetch, so every statement touching it up to the call counts.
    const builderRegion = source.slice(declarationIndex, callStart);
    const referencing = builderRegion
      .split("\n")
      .filter((line) => new RegExp(`\\b${name}\\b`).test(line))
      .join("\n");

    extra += `\n${referencing}`;
  }

  return extra;
}

function passesEntity(source, endpointIndex) {
  const call = enclosingFetchCall(source, endpointIndex);
  if (!call) return false;

  const inspected =
    call.text + interpolatedRequestBuilders(call.text, source, call.start);

  return /\bentityId\b|\bentity_id\b/.test(inspected);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function walk(relativeDir, predicate, found = []) {
  const absolute = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return found;

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const next = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) walk(next, predicate, found);
    else if (predicate(next)) found.push(next);
  }

  return found;
}

function resolveFrom(baseFile, specifier) {
  const candidates = [];

  if (specifier.startsWith("@/")) candidates.push(specifier.slice(2));
  else if (specifier.startsWith(".")) {
    candidates.push(path.normalize(path.join(path.dirname(baseFile), specifier)));
  } else return null;

  for (const candidate of candidates) {
    for (const suffix of ["", ".js", ".jsx", "/index.js", "/page.jsx", "/page.js"]) {
      const withSuffix = `${candidate}${suffix}`;
      if (fs.existsSync(path.join(ROOT, withSuffix))) return withSuffix;
    }
  }

  return null;
}

function importMap(baseFile, source) {
  const map = {};
  const pattern = /import\s+([A-Za-z0-9_$]+)\s*(?:,\s*\{[^}]*\})?\s*from\s+"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(source))) {
    const resolved = resolveFrom(baseFile, match[2]);
    if (resolved) map[match[1]] = resolved;
  }
  return map;
}

function requiresEntityCache() {
  const cache = new Map();
  return (module) => {
    if (cache.has(module)) return cache.get(module);
    let value = false;
    try {
      const source = read(module);
      value =
        ENTITY_REJECTED_WHEN_MISSING.test(source) &&
        !ENTITY_RESOLVED_FROM_ACCESS.test(source);
    } catch {
      value = false;
    }
    cache.set(module, value);
    return value;
  };
}

const requiresEntity = requiresEntityCache();

// 1. Per-application capability -> adapter module. Kept per application so one
//    application's entity requirement never leaks onto another's surfaces.
const applicationSource = read(APPLICATION_REGISTRY);
const applicationImports = importMap(APPLICATION_REGISTRY, applicationSource);
const applicationCapabilities = {};

for (const block of applicationSource.matchAll(
  /id:\s*"([a-z0-9_-]+)",[\s\S]*?adapter:\s*Object\.freeze\(\{([\s\S]*?)\}\),/g,
)) {
  const [, applicationId, adapterBody] = block;
  const capabilities = {};

  for (const spread of adapterBody.matchAll(/\.\.\.([A-Za-z0-9_$]+)/g)) {
    const module = applicationImports[spread[1]];
    if (!module) continue;
    const baseSource = read(module);
    const exported = new Set();
    for (const m of baseSource.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9_$]*)\s*,\s*$/gm)) {
      exported.add(m[1]);
    }
    for (const m of baseSource.matchAll(/async\s+function\s+([a-zA-Z0-9_$]+)/g)) {
      exported.add(m[1]);
    }
    for (const capability of exported) capabilities[capability] = module;
  }

  for (const named of adapterBody.matchAll(/([a-zA-Z][a-zA-Z0-9_$]*):\s*([A-Za-z0-9_$]+)\s*,/g)) {
    const module = applicationImports[named[2]];
    if (module) capabilities[named[1]] = module;
  }

  applicationCapabilities[applicationId] = capabilities;
}

if (!Object.keys(applicationCapabilities).length) {
  throw new Error("POS_CONTRACT: no POS applications were parsed from the registry");
}

// 2. Endpoint -> adapter capabilities, following server-side delegation.
const endpointCapabilities = {};

for (const routeFile of walk(ROUTE_ROOT, (file) => file.endsWith("route.js"))) {
  const endpoint = `/api/${path.dirname(routeFile).replace(/^app\/api\//, "")}`;
  const routeSource = read(routeFile);
  const sources = [routeSource];

  for (const module of Object.values(importMap(routeFile, routeSource))) {
    if (module.startsWith("lib/operations/commerce/server/")) {
      try {
        sources.push(read(module));
      } catch {
        /* ignore */
      }
    }
  }

  const capabilities = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/adapter\??\.([a-zA-Z][a-zA-Z0-9_$]*)/g)) {
      capabilities.add(match[1]);
    }
  }

  endpointCapabilities[endpoint] = capabilities;
}

// 3. Surface module -> applications it serves, per the surface registry.
const surfaceSource = read(SURFACE_REGISTRY);
const surfaceImports = importMap(SURFACE_REGISTRY, surfaceSource);
const surfaceApplications = new Map();

function localComponentModules(identifier) {
  const declaration = surfaceSource.match(
    new RegExp(`function\\s+${identifier}\\s*\\([\\s\\S]*?\\n\\}`),
  );
  if (!declaration) return [];

  const modules = [];
  for (const jsx of declaration[0].matchAll(/<([A-Z][A-Za-z0-9_$]*)/g)) {
    const module = surfaceImports[jsx[1]];
    if (module) modules.push(module);
  }
  return modules;
}

function registerSurface(applicationId, identifier) {
  const direct = surfaceImports[identifier];
  const modules = direct ? [direct] : localComponentModules(identifier);

  for (const module of modules) {
    if (!surfaceApplications.has(module)) surfaceApplications.set(module, new Set());
    surfaceApplications.get(module).add(applicationId);
  }
}

for (const block of surfaceSource.matchAll(
  /([a-z0-9_-]+):\s*\n?\s*Object\.freeze\(\{([\s\S]*?)\}\)/g,
)) {
  const [, applicationId, body] = block;
  if (!applicationCapabilities[applicationId]) continue;

  for (const entry of body.matchAll(/[a-zA-Z]+:\s*\n?\s*([A-Z][A-Za-z0-9_$]*)\s*,/g)) {
    registerSurface(applicationId, entry[1]);
  }
}

if (!surfaceApplications.size) {
  throw new Error("POS_CONTRACT: no POS surfaces were mapped to applications");
}

// 4. Each surface must satisfy the entity requirement of every application it serves.
const violations = [];
let checkedCalls = 0;

for (const [surfaceModule, applications] of surfaceApplications) {
  let source;
  try {
    source = read(surfaceModule);
  } catch {
    continue;
  }

  for (const [endpoint, capabilities] of Object.entries(endpointCapabilities)) {
    const requiringApplications = [...applications].filter((applicationId) =>
      [...capabilities].some((capability) => {
        const module = applicationCapabilities[applicationId]?.[capability];
        return module ? requiresEntity(module) : false;
      }),
    );

    if (!requiringApplications.length) continue;

    let index = source.indexOf(endpoint);
    while (index !== -1) {
      const nextChar = source[index + endpoint.length];
      if (!nextChar || !/[a-z0-9-]/i.test(nextChar)) {
        checkedCalls += 1;
        if (!passesEntity(source, index)) {
          violations.push({
            surfaceModule,
            endpoint,
            applications: requiringApplications.join(", "),
          });
          break;
        }
      }
      index = source.indexOf(endpoint, index + 1);
    }
  }
}

if (violations.length) {
  const detail = violations
    .map(
      ({ surfaceModule, endpoint, applications }) =>
        `  ${surfaceModule}\n    calls ${endpoint} without an entity, but serves: ${applications}`,
    )
    .join("\n");

  throw new Error(
    `POS_CONTRACT: ${violations.length} POS surface call(s) omit the entity their adapter requires.\n${detail}\n` +
      "Those adapters resolve scope from the entity and reject the request without it, so the surface fails at runtime.",
  );
}

console.log("POS_CLIENT_CONTRACT_AUDIT=PASS");
console.log(`POS_APPLICATIONS=${Object.keys(applicationCapabilities).join(",")}`);
console.log(`POS_ENDPOINTS_INSPECTED=${Object.keys(endpointCapabilities).length}`);
console.log(`POS_SURFACES_MAPPED=${surfaceApplications.size}`);
console.log(`POS_ENTITY_SCOPED_CALLS_CHECKED=${checkedCalls}`);
console.log("POS_CLIENT_ENTITY_SCOPE=SATISFIED");
