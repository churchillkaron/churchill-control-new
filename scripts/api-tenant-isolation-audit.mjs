// Every route that takes an organization from its caller must be able to refuse that caller.
//
// Tenant separation in this system is enforced entirely in application code. There is no row level
// security anywhere -- 233 migrations contain no ENABLE ROW LEVEL SECURITY and no CREATE POLICY -- and 183
// routes use the service-role client, which would bypass RLS even if it existed. So a route that reads
// organizationId out of a query string or a body and never checks who is asking will return one
// organization's data to anyone who names it, and nothing downstream will catch that.
//
// This audit exists because I could not answer "which routes are exposed?" by reading the code. I tried
// four times. Grepping for guard names gave 577, then 106, then 76, each wrong because the codebase has fourteen
// different guards and I kept missing one -- including getStaffIdentity, which is the safest pattern in the
// repository. Names are the wrong thing to look for. What matters is whether a route can say no.
//
// The test is behavioural on both halves:
//
//   Does it take the organization from the caller?  searchParams.get("organization..."), body.organization,
//   params.organizationId, an x-organization header. If the organization comes from an authenticated
//   identity instead, the question does not arise and the route is not in scope.
//
//   Can it refuse?  Any 401 or 403, any Unauthorized or Forbidden, or a call to something shaped like a
//   guard. Guard names are discovered from the imports rather than hardcoded, so a new guard added
//   tomorrow counts without anyone updating this file.
//
// A route that is genuinely public has to say so in PUBLIC_ROUTES with a reason. Webhooks verify a provider
// signature and OAuth callbacks carry their own state parameter; both are legitimately unauthenticated and
// both are worse off pretending otherwise.

import fs from "node:fs";
import path from "node:path";

const ROOT = "app/api";

// Routes that are unauthenticated by design. Each needs a reason, and the reason has to be about how the
// caller is verified rather than about convenience.
// Empty on purpose. The webhook and OAuth-callback routes that would belong here already refuse callers
// on their own, so an exemption for them would describe a permission nobody is using. Add an entry only
// when a route genuinely cannot refuse and the reason is about how its caller is verified.
const PUBLIC_ROUTES = new Map();

// How a route reads an organization the caller chose.
const CALLER_SUPPLIED_ORGANIZATION = [
  /searchParams\.get\(\s*["'`]organization/i,
  /body\s*\??\.\s*\??\s*organization/i,
  /params\s*\??\.\s*organizationId/i,
  /headers\.get\(\s*["'`]x-organization/i,
];

// How a route refuses. Status codes and words first, because those are the behaviour; discovered guard
// names second, because a guard is only a proxy for the refusal it performs.
const REFUSAL = [
  /\b401\b/,
  /\b403\b/,
  /Unauthorized/i,
  /Forbidden/i,
  /NOT_PERMITTED/,
  /ACCESS_DENIED/,
];

function routeFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, found);
    else if (entry.name === "route.js") found.push(full);
  }
  return found;
}

// Anything imported whose name looks like it establishes or checks a caller. Derived from the source so
// this keeps working when a new guard appears.
function discoveredGuards(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))\s+from/g)) {
    const identifiers = (match[1] || match[2] || "")
      .split(",")
      .map((part) => part.split(" as ").pop().trim())
      .filter(Boolean);
    for (const identifier of identifiers) {
      if (/^(require|resolve|assert|ensure|get)[A-Z].*(Access|Auth|Authenticated|Context|Identity|Session|Caller|Staff)/
        .test(identifier)) {
        names.add(identifier);
      }
    }
  }
  return names;
}

function routeName(file) {
  return file.slice(ROOT.length + 1, -"/route.js".length);
}

function main() {
  const files = routeFiles(ROOT);
  const scoped = [];
  const exposed = [];
  const publicDeclared = [];
  const guardsSeen = new Map();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const name = routeName(file);

    const guards = discoveredGuards(source);
    for (const guard of guards) {
      guardsSeen.set(guard, (guardsSeen.get(guard) || 0) + 1);
    }

    if (!CALLER_SUPPLIED_ORGANIZATION.some((pattern) => pattern.test(source))) continue;
    scoped.push(name);

    const refuses =
      REFUSAL.some((pattern) => pattern.test(source)) ||
      [...guards].some((guard) => new RegExp(`\\b${guard}\\s*\\(`).test(source));

    if (refuses) continue;
    if (PUBLIC_ROUTES.has(name)) {
      publicDeclared.push(name);
      continue;
    }
    exposed.push(name);
  }

  console.log("============================================================");
  console.log("API TENANT ISOLATION AUDIT");
  console.log("============================================================");
  console.log(`ROUTES_EXAMINED=${files.length}`);
  console.log(`CALLER_SUPPLIED_ORGANIZATION=${scoped.length}`);
  console.log(`DECLARED_PUBLIC=${publicDeclared.length}`);
  console.log(`EXPOSED=${exposed.length}`);

  console.log(`\nGuards in use (${guardsSeen.size} distinct, discovered from imports):`);
  for (const [guard, count] of [...guardsSeen].sort((left, right) => right[1] - left[1])) {
    console.log(`   ${String(count).padStart(4)}  ${guard}`);
  }

  if (publicDeclared.length) {
    console.log("\nUnauthenticated by design:");
    for (const name of publicDeclared.sort()) {
      console.log(`   ${name}`);
      console.log(`        ${PUBLIC_ROUTES.get(name)}`);
    }
  }

  if (exposed.length) {
    console.log(`\nEXPOSED -- these take an organization from the caller and cannot refuse anyone:`);
    for (const name of exposed.sort()) console.log(`   ${name}`);
    console.log(
      "\nAdd the guard the route needs, or add it to PUBLIC_ROUTES with a reason describing how its" +
      "\ncaller is verified. Without row level security these are direct reads and writes against" +
      "\nwhichever organization the caller names.",
    );
    console.log("\nAPI_TENANT_ISOLATION_AUDIT=FAILED");
    process.exitCode = 1;
    return;
  }

  console.log("\nEvery organization-scoped route can refuse its caller.");
  console.log("API_TENANT_ISOLATION_AUDIT=PASSED");
}

main();
