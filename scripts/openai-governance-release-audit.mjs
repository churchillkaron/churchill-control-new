#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SCAN_ROOTS = ["app", "lib", "scripts"];
const RAW_ADAPTER =
  "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
const SANITIZED_ADAPTER =
  "lib/platform/service-runtime/providers/openai/OpenAIProviderSanitizedRuntime.js";
const ALLOWED_OPENAI_SDK_FILES = new Set([RAW_ADAPTER]);
const ALLOWED_RAW_ADAPTER_IMPORT_FILES = new Set([SANITIZED_ADAPTER]);
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const VIOLATIONS = [];

const RULES = [
  {
    id: "OPENAI_SDK_IMPORT_OUTSIDE_PLATFORM_ADAPTER",
    test: (source) =>
      /(?:from\s+["']openai["']|require\(\s*["']openai["']\s*\)|import\(\s*["']openai["']\s*\))/m.test(source),
    allow: ALLOWED_OPENAI_SDK_FILES,
  },
  {
    id: "OPENAI_SDK_CLIENT_OUTSIDE_PLATFORM_ADAPTER",
    test: (source) => /\bnew\s+OpenAI\s*\(/m.test(source),
    allow: ALLOWED_OPENAI_SDK_FILES,
  },
  {
    id: "OPENAI_RAW_ADAPTER_IMPORT_OUTSIDE_SANITIZED_RUNTIME",
    test: (source) =>
      /(?:from\s+["']\.\/OpenAIProvider["']|require\(\s*["']\.\/OpenAIProvider["']\s*\)|import\(\s*["']\.\/OpenAIProvider["']\s*\))/m.test(source),
    allow: ALLOWED_RAW_ADAPTER_IMPORT_FILES,
  },
  {
    id: "OPENAI_DIRECT_HTTP_BYPASS",
    test: (source) => /https?:\/\/api\.openai\.com\b/i.test(source),
    allow: new Set(),
  },
];

function walk(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];

  const output = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.posix.join(relativeRoot, entry.name);
    const absolute = path.join(ROOT, relative);
    if (entry.isDirectory()) {
      output.push(...walk(relative));
      continue;
    }
    if (!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name))) continue;
    output.push(relative);
  }
  return output;
}

for (const file of SCAN_ROOTS.flatMap(walk)) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const rule of RULES) {
    if (!rule.test(source)) continue;
    if (rule.allow.has(file)) continue;
    VIOLATIONS.push({ rule: rule.id, file });
  }
}

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    VIOLATIONS.push({
      rule: "OPENAI_GOVERNANCE_REQUIRED_FILE_MISSING",
      file: relativePath,
    });
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

const providerExecutor = read(
  "lib/platform/service-runtime/providers/ProviderExecutor.js",
);
const sanitizedRuntime = read(SANITIZED_ADAPTER);
const managedRegistration = read(
  "lib/platform/service-runtime/providers/openai/ManagedOpenAICredentialRegistration.js",
);
const credentialRuntime = read(
  "lib/platform/service-runtime/credentials/runtime/CredentialRuntime.js",
);
const managedCredentialMigration = read(
  "supabase/migrations/20260810080500_avantiqo_managed_openai_credential.sql",
);

const REQUIRED_CONTRACTS = [
  [
    "ProviderExecutor managed OpenAI registration",
    providerExecutor.includes('./openai/ManagedOpenAICredentialRegistration.js'),
  ],
  [
    "ProviderExecutor governed OpenAI service assertion",
    providerExecutor.includes("OPENAI_AVANTIQO_GOVERNED_SERVICE_EXECUTION_REQUIRED"),
  ],
  [
    "ProviderExecutor managed OpenAI credential assertion",
    providerExecutor.includes("OPENAI_AVANTIQO_MANAGED_CREDENTIAL_REQUIRED"),
  ],
  [
    "ProviderExecutor credential business-input isolation",
    providerExecutor.includes("PROVIDER_CREDENTIAL_BUSINESS_INPUT_ISOLATION_V1"),
  ],
  [
    "OpenAI sanitized runtime governed context assertion",
    sanitizedRuntime.includes("OPENAI_AVANTIQO_GOVERNED_CONTEXT_REQUIRED"),
  ],
  [
    "OpenAI sanitized runtime managed credential assertion",
    sanitizedRuntime.includes("OPENAI_AVANTIQO_MANAGED_CREDENTIAL_REQUIRED"),
  ],
  [
    "OpenAI managed credential purpose",
    managedRegistration.includes("AVANTIQO_MANAGED_AI"),
  ],
  [
    "OpenAI managed API family",
    managedRegistration.includes("OPENAI_API"),
  ],
  [
    "Credential runtime resolves env references server-side",
    credentialRuntime.includes('startsWith("env:")') &&
      credentialRuntime.includes("process.env[environmentName]"),
  ],
  [
    "OpenAI credential descriptor stores environment reference only",
    managedCredentialMigration.includes("env:OPENAI_API_KEY") &&
      managedCredentialMigration.includes("AVANTIQO_MANAGED_AI") &&
      managedCredentialMigration.includes("OPENAI_API"),
  ],
];

for (const [label, passed] of REQUIRED_CONTRACTS) {
  if (!passed) {
    VIOLATIONS.push({
      rule: "OPENAI_GOVERNANCE_CONTRACT_MISSING",
      file: label,
    });
  }
}

if (VIOLATIONS.length) {
  console.error("OPENAI_GOVERNANCE_RELEASE_AUDIT=FAIL");
  for (const violation of VIOLATIONS) {
    console.error(`${violation.rule}: ${violation.file}`);
  }
  process.exitCode = 1;
} else {
  console.log("OPENAI_GOVERNANCE_RELEASE_AUDIT=PASS");
  console.log("OPENAI_EXECUTION_OWNER=AVANTIQO_SERVICE_RUNTIME");
  console.log("OPENAI_SDK_BOUNDARY=PLATFORM_PROVIDER_ADAPTER_ONLY");
  console.log("OPENAI_RAW_ADAPTER_ENTRY=SANITIZED_RUNTIME_ONLY");
  console.log("OPENAI_DIRECT_HTTP_BYPASS=FORBIDDEN");
  console.log("OPENAI_CREDENTIAL_MODEL=AVANTIQO_MANAGED_AI");
  console.log("OPENAI_SECRET_STORAGE=ENV_REFERENCE_ONLY");
  console.log("OPENAI_USAGE_PATH=SERVICE_PROVIDER_PRICING_WALLET_USAGE_BILLING");
}
