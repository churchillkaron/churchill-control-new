#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function secretPresence() {
  const directNames = [
    "FAL_KEY",
    "FAL_API_KEY",
    "SUNO_API_KEY",
    "ELEVENLABS_API_KEY",
  ];
  const direct = Object.fromEntries(
    directNames.map((name) => [name, Boolean(text(process.env[name]))]),
  );

  let managed = {};
  const raw = text(process.env.AVANTIQO_PROVIDER_CREDENTIALS_JSON);
  if (raw) {
    try {
      const parsed = object(JSON.parse(raw));
      const providers = object(parsed.providers);
      for (const provider of ["fal", "suno", "elevenlabs"]) {
        const bucket = object(providers[provider] || parsed[provider]);
        managed[provider] = Boolean(
          Object.keys(bucket).length ||
          bucket.api_key ||
          bucket.access_token,
        );
      }
    } catch {
      managed = { parse_error: true };
    }
  }

  return {
    direct,
    managed,
    avantiqo_provider_credentials_json_present: Boolean(raw),
  };
}

function walkFiles(root, output = []) {
  if (!fs.existsSync(root)) return output;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "build"].includes(entry.name)) {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, output);
      continue;
    }
    if (/\.(js|mjs|cjs|ts|tsx|json|sql)$/i.test(entry.name)) output.push(full);
  }
  return output;
}

function scanRepository() {
  const roots = [
    path.resolve("lib"),
    path.resolve("scripts"),
    path.resolve("supabase"),
  ];
  const terms = [
    /ai\.music\.generate/i,
    /\bfal\b/i,
    /\bsuno\b/i,
    /music provider/i,
    /music\.generate/i,
  ];
  const matches = [];

  for (const file of roots.flatMap((root) => walkFiles(root))) {
    let source;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!terms.some((term) => term.test(line))) return;
      matches.push({
        file: path.relative(process.cwd(), file),
        line: index + 1,
        excerpt: line.trim().slice(0, 240),
      });
    });
  }

  return matches.slice(0, 300);
}

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missingEnvironment = requiredEnvironment.filter(
  (name) => !text(process.env[name]),
);
if (missingEnvironment.length) {
  console.error(`MUSIC_READINESS_ENVIRONMENT_MISSING=${missingEnvironment.join(",")}`);
  console.error("DATABASE_WRITES_EXECUTED=NO");
  console.error("PROVIDER_CALLS_EXECUTED=NO");
  console.error("WALLET_CHANGED=NO");
  process.exit(2);
}

const organizationId = text(process.env.ORGANIZATION_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");

const [{ supabaseAdmin }, { getProvidersForCapability }, { resolveProviders }] =
  await Promise.all([
    import("@/lib/shared/supabase/admin"),
    import("@/lib/platform/service-runtime/providers/ProviderRegistry.js"),
    import("@/lib/platform/service-runtime/providers/ProviderResolver.js"),
  ]);

const capability = "ai.music.generate";
const registryProviders = getProvidersForCapability(capability).map((provider) => ({
  id: provider.id,
  runtime: provider.runtime,
  runtime_available: provider.runtimeAvailable !== false,
  active: provider.active !== false,
}));

let resolverResult = null;
let resolverError = null;
try {
  resolverResult = await resolveProviders({ capability });
} catch (error) {
  resolverError = error.message;
}

const { data: pricingRows, error: pricingError } = await supabaseAdmin
  .from("provider_pricing")
  .select("id,provider,capability,model,currency,unit,cost_per_unit,markup_percent,active,country,metadata,created_at,updated_at")
  .eq("capability", capability)
  .order("created_at", { ascending: false });

let pricing = pricingRows || [];
let pricingQueryError = pricingError?.message || null;
if (pricingError && /column .* does not exist|42703/i.test(pricingError.message || "")) {
  const fallback = await supabaseAdmin
    .from("provider_pricing")
    .select("*")
    .eq("capability", capability)
    .order("created_at", { ascending: false });
  pricing = fallback.data || [];
  pricingQueryError = fallback.error?.message || null;
}

const { data: organizationServiceRows, error: organizationServiceError } =
  await supabaseAdmin
    .from("organization_services")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("service_id", capability);

const report = {
  contract: "CREATIVE_MUSIC_PROVIDER_READINESS_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  capability,
  read_only: true,
  provider_calls_executed: false,
  database_writes_executed: false,
  wallet_changed: false,
  usage_created: false,
  registry_providers: registryProviders,
  resolver: {
    error: resolverError,
    providers: list(resolverResult?.providers).map((provider) => ({
      id: provider.id,
      runtime: provider.runtime,
      runtime_available: provider.runtimeAvailable !== false,
      active: provider.active !== false,
    })),
    pricing: list(resolverResult?.pricing).map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model || null,
      currency: row.currency || null,
      unit: row.unit || null,
      active: row.active !== false,
    })),
    rejected_pricing: list(resolverResult?.rejected_pricing),
  },
  database: {
    pricing_query_error: pricingQueryError,
    pricing_rows: pricing.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model || null,
      currency: row.currency || null,
      unit: row.unit || null,
      cost_per_unit: row.cost_per_unit ?? null,
      markup_percent: row.markup_percent ?? null,
      active: row.active !== false,
      country: row.country || null,
      metadata: object(row.metadata),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    })),
    organization_service_query_error: organizationServiceError?.message || null,
    organization_service_rows: list(organizationServiceRows).map((row) => ({
      id: row.id,
      service_id: row.service_id,
      enabled: row.enabled ?? row.active ?? true,
      provider_policy: object(row.provider_policy),
      status: row.status || null,
    })),
  },
  credential_presence: secretPresence(),
  repository_matches: scanRepository(),
};

const blockers = [];
if (!registryProviders.length) blockers.push("NO_REGISTERED_MUSIC_PROVIDER");
if (!list(resolverResult?.providers).length) blockers.push("NO_EXECUTABLE_MUSIC_PROVIDER");
if (!pricing.some((row) => row.active !== false)) blockers.push("NO_ACTIVE_MUSIC_PRICING");
if (!list(organizationServiceRows).length) blockers.push("MUSIC_SERVICE_NOT_ENABLED_FOR_ORGANIZATION");
if (pricingQueryError) blockers.push(`MUSIC_PRICING_QUERY_FAILED:${pricingQueryError}`);
if (organizationServiceError) {
  blockers.push(`MUSIC_ORGANIZATION_SERVICE_QUERY_FAILED:${organizationServiceError.message}`);
}

report.blockers = blockers;
report.ready = blockers.length === 0;

const outputPath = path.resolve(
  text(process.env.MUSIC_READINESS_OUTPUT) ||
    "/tmp/churchill-music-provider-readiness.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE MUSIC PROVIDER READINESS");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`CAPABILITY=${capability}`);
console.log(`REGISTRY_PROVIDER_COUNT=${registryProviders.length}`);
console.log(`EXECUTABLE_PROVIDER_COUNT=${list(resolverResult?.providers).length}`);
console.log(`ACTIVE_PRICING_ROW_COUNT=${pricing.filter((row) => row.active !== false).length}`);
console.log(`ORGANIZATION_SERVICE_ROW_COUNT=${list(organizationServiceRows).length}`);
console.log(`REPOSITORY_MATCH_COUNT=${report.repository_matches.length}`);
console.log(`READINESS=${report.ready ? "PASS" : "FAIL"}`);
console.log(`READINESS_BLOCKER_COUNT=${blockers.length}`);
console.log(`READINESS_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`CREDENTIAL_PRESENCE=${JSON.stringify(report.credential_presence)}`);
console.log("CREDENTIAL_VALUES_EXPOSED=NO");
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("USAGE_CREATED=NO");
console.log("WALLET_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const provider of registryProviders) {
  console.log(
    `REGISTRY_PROVIDER=${provider.id}|runtime=${provider.runtime}|available=${provider.runtime_available}|active=${provider.active}`,
  );
}
for (const row of report.database.pricing_rows) {
  console.log(
    `MUSIC_PRICING_ROW=${row.id}|provider=${row.provider}|model=${row.model || "default"}|currency=${row.currency || "NONE"}|unit=${row.unit || "NONE"}|active=${row.active}`,
  );
}
for (const match of report.repository_matches.slice(0, 80)) {
  console.log(`REPOSITORY_MATCH=${match.file}:${match.line}|${match.excerpt}`);
}

if (!report.ready) process.exitCode = 2;
