#!/usr/bin/env node

import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = required.filter((name) => !text(process.env[name]));
if (missing.length) {
  console.error(`COST_ESTIMATE_ENVIRONMENT_MISSING=${missing.join(",")}`);
  console.error("PROVIDER_CALLS_EXECUTED=NO");
  console.error("USAGE_CREATED=NO");
  console.error("WALLET_RESERVED=NO");
  console.error("WALLET_CHARGED=NO");
  console.error("GRAPH_CREATED=NO");
  console.error("TASKS_CREATED=NO");
  process.exit(2);
}

console.log("COST_ESTIMATE_ENVIRONMENT_LOADED=YES");
console.log("COST_ESTIMATE_EXECUTION_MODE=READ_ONLY");
console.log("PROVIDER_CALLS_AUTHORIZED=NO");
console.log("USAGE_CREATION_AUTHORIZED=NO");
console.log("WALLET_MUTATION_AUTHORIZED=NO");
console.log("GRAPH_MATERIALIZATION_AUTHORIZED=NO");
console.log("TASK_MATERIALIZATION_AUTHORIZED=NO");

await import("./estimate-creative-production-cost-read-only.mjs");
