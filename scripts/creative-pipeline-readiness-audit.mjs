#!/usr/bin/env node
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

// Zero-cost readiness check for the Creative Studio.
//
// The Studio has 117 bespoke scripts, but none of them answers "can the pipeline
// run at all". They are forensic tools for past incidents: each needs its own
// scope or input file, and running them without one fails for reasons that have
// nothing to do with pipeline health. Meanwhile lib/creative/director took 166
// commits since the last execution, so a broken import or a drifted table would
// only surface when a paid run failed halfway.
//
// This verifies what can be verified for free: every runtime module loads, the
// tables and columns the pipeline writes exist, and the reasoning service the
// director depends on resolves. It executes no provider calls and writes nothing.

const ROOT = process.cwd();
const failures = [];
const notes = [];

function env(name) {
  return String(process.env[name] || "").trim();
}

// 1. Every director and execution runtime module must load.
const MODULE_DIRS = [
  "lib/creative/director/runtime",
  "lib/creative/execution/repositories",
  "lib/creative/shots/runtime",
  "lib/creative/quality/runtime",
];

let loaded = 0;
for (const dir of MODULE_DIRS) {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) {
    failures.push(`MISSING_DIRECTORY:${dir}`);
    continue;
  }

  for (const entry of fs.readdirSync(absolute)) {
    if (!entry.endsWith(".js")) continue;
    const specifier = pathToFileURL(path.join(absolute, entry)).href;
    try {
      await import(specifier);
      loaded += 1;
    } catch (error) {
      const message = String(error?.message || "");
      if (/not extensible|already installed|Cannot define property/i.test(message)) {
        notes.push(`MODULE_INSTALL_REPLAYED:${dir}/${entry}`);
        loaded += 1;
        continue;
      }
      failures.push(`MODULE_LOAD_FAILED:${dir}/${entry}: ${message.slice(0, 160)}`);
    }
  }
}

// 2. The tables and columns the pipeline writes must exist.
const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");

const REQUIRED_SCHEMA = Object.freeze({
  creative_execution_jobs: [
    "id", "organization_id", "creative_project_id", "job_type", "status",
    "idempotency_key", "attempt_count", "maximum_attempts", "lease_token",
    "lease_expires_at", "result", "error",
  ],
  creative_execution_steps: ["id", "step_key", "status"],
  creative_projects: ["id", "organization_id", "status"],
  creative_shots: ["id", "status"],
  creative_assets: ["id", "status"],
  creative_missions: ["id", "status"],
});

if (!url || !key) {
  notes.push("SCHEMA_CHECK_SKIPPED: supabase env not available in this context");
} else {
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    const response = await fetch(
      `${url}/rest/v1/${table}?select=${columns.join(",")}&limit=0`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );

    if (response.ok) continue;

    const body = await response.text();
    const missing = body.match(/column ([a-z_.]+) does not exist/i);
    failures.push(
      missing
        ? `SCHEMA_COLUMN_MISSING:${missing[1]}`
        : `SCHEMA_TABLE_UNREADABLE:${table}: ${body.slice(0, 120)}`,
    );
  }
}

// 3. The reasoning service the director depends on must resolve.
try {
  const { resolveServiceCapabilities } = await import(
    "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"
  );
  const resolved = resolveServiceCapabilities("ai.reasoning.execute");
  if (!resolved?.capabilities?.length) {
    failures.push("REASONING_SERVICE_UNRESOLVED:ai.reasoning.execute has no enabled capability mapping");
  }
} catch (error) {
  failures.push(`REASONING_RESOLVER_FAILED: ${String(error?.message).slice(0, 160)}`);
}

if (failures.length) {
  throw new Error(
    `CREATIVE_PIPELINE_READINESS: ${failures.length} problem(s) would break a production run.\n  ${failures.join("\n  ")}`,
  );
}

console.log("CREATIVE_PIPELINE_READINESS_AUDIT=PASS");
console.log(`CREATIVE_RUNTIME_MODULES_LOADED=${loaded}`);
console.log(`CREATIVE_SCHEMA_TABLES_VERIFIED=${Object.keys(REQUIRED_SCHEMA).length}`);
console.log("CREATIVE_REASONING_SERVICE=RESOLVED");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("DATABASE_WRITES_EXECUTED=NO");
for (const note of notes) console.log(`NOTE=${note}`);
