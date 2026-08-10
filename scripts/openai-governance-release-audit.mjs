#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SCAN_ROOTS = ["app", "lib", "scripts"];
const ALLOWED_OPENAI_SDK_FILES = new Set([
  "lib/platform/service-runtime/providers/openai/OpenAIProvider.js",
]);
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

const providerExecutor = fs.readFileSync(
  path.join(ROOT, "lib/platform/service-runtime/providers/ProviderExecutor.js"),
  "utf8",
);
const sanitizedRuntime = fs.readFileSync(
  path.join(ROOT, "lib/platform/service-runtime/providers/openai/OpenAIProviderSanitizedRuntime.js"),
  "utf8",
);
const managedRegistration = fs.readFileSync(
  path.join(ROOT, "lib/platform/service-runtime/providers/openai/ManagedOpenAICredentialRegistration.js"),
  "utf8",
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
];

for (const [label, passed] of REQUIRED_CONTRACTS) {
  if (!passed) {
    VIOLATIONS.push({ rule: "OPENAI_GOVERNANCE_CONTRACT_MISSING", file: label });
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
  console.log("OPENAI_DIRECT_HTTP_BYPASS=FORBIDDEN");
  console.log("OPENAI_CREDENTIAL_MODEL=AVANTIQO_MANAGED_AI");
  console.log("OPENAI_USAGE_PATH=SERVICE_PROVIDER_PRICING_WALLET_USAGE_BILLING");
}
