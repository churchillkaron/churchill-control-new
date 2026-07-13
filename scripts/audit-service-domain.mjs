#!/usr/bin/env node

/**
 * AVANTIQO SERVICE DOMAIN CONVERGENCE AUDIT
 *
 * Permanent audit for the complete Service Domain.
 *
 * Core enforced flow:
 *
 * UBTE
 *   -> Service Capability
 *   -> Service Runtime
 *   -> Provider Resolver
 *   -> Usage Control
 *   -> Pricing
 *   -> Wallet Reservation / Debit
 *   -> Billing
 *   -> Finance
 *
 * Required identity:
 *
 * - organization_id: always required
 * - party_id: always required for attributable usage
 * - entity_id: required for financial, legal, wallet and billing ownership
 *
 * This is a static architecture audit. It reports probable bypasses and
 * architectural violations for review. It does not modify project files.
 *
 * Run:
 *
 *   node scripts/audit-service-domain.mjs
 *
 * Optional:
 *
 *   node scripts/audit-service-domain.mjs --strict
 *   node scripts/audit-service-domain.mjs --json
 *   node scripts/audit-service-domain.mjs --report
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const ARGS = new Set(process.argv.slice(2));

const STRICT = ARGS.has("--strict");
const JSON_ONLY = ARGS.has("--json");
const WRITE_REPORT = ARGS.has("--report");

const SOURCE_ROOTS = [
  "app",
  "components",
  "lib",
  "src",
];

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "public",
]);

const SERVICE_PATH_MARKERS = [
  "/lib/service/",
  "/lib/services/",
  "/lib/platform/service/",
  "/lib/platform/services/",
  "/lib/domains/service/",
  "/lib/domains/services/",
];

const PROVIDER_LAYER_MARKERS = [
  "/providers/",
  "/provider/",
  "/adapters/",
  "/integrations/",
];

const USAGE_LAYER_MARKERS = [
  "/usage/",
  "/usage-control/",
  "/usageControl/",
  "/metering/",
];

const PRICING_LAYER_MARKERS = [
  "/pricing/",
  "/price/",
  "/rates/",
];

const WALLET_LAYER_MARKERS = [
  "/wallet/",
  "/wallets/",
];

const BILLING_LAYER_MARKERS = [
  "/billing/",
  "/invoicing/",
];

const FINANCE_LAYER_MARKERS = [
  "/lib/finance/",
  "/lib/domains/finance/",
];

const UBTE_LAYER_MARKERS = [
  "/lib/platform/ubte/",
  "/lib/ubte/",
];

const TEST_FILE_MARKERS = [
  "/test/",
  "/tests/",
  "/__tests__/",
  ".test.",
  ".spec.",
];

const GENERATED_FILE_MARKERS = [
  "/generated/",
  "/migrations/",
  "/supabase/migrations/",
];

const PROVIDER_PACKAGES = [
  {
    provider: "OpenAI",
    patterns: [
      /from\s+["']openai["']/g,
      /require\(["']openai["']\)/g,
      /new\s+OpenAI\s*\(/g,
    ],
  },
  {
    provider: "Anthropic",
    patterns: [
      /from\s+["']@anthropic-ai\/sdk["']/g,
      /require\(["']@anthropic-ai\/sdk["']\)/g,
      /new\s+Anthropic\s*\(/g,
    ],
  },
  {
    provider: "Google Generative AI",
    patterns: [
      /from\s+["']@google\/generative-ai["']/g,
      /require\(["']@google\/generative-ai["']\)/g,
      /new\s+GoogleGenerativeAI\s*\(/g,
    ],
  },
  {
    provider: "Google Cloud",
    patterns: [
      /from\s+["']@google-cloud\//g,
      /require\(["']@google-cloud\//g,
    ],
  },
  {
    provider: "Twilio",
    patterns: [
      /from\s+["']twilio["']/g,
      /require\(["']twilio["']\)/g,
      /\btwilio\s*\(/g,
    ],
  },
  {
    provider: "Stripe",
    patterns: [
      /from\s+["']stripe["']/g,
      /require\(["']stripe["']\)/g,
      /new\s+Stripe\s*\(/g,
    ],
  },
  {
    provider: "Resend",
    patterns: [
      /from\s+["']resend["']/g,
      /require\(["']resend["']\)/g,
      /new\s+Resend\s*\(/g,
    ],
  },
  {
    provider: "SendGrid",
    patterns: [
      /from\s+["']@sendgrid\//g,
      /require\(["']@sendgrid\//g,
    ],
  },
  {
    provider: "AWS SDK",
    patterns: [
      /from\s+["']@aws-sdk\//g,
      /require\(["']@aws-sdk\//g,
    ],
  },
  {
    provider: "Meta Graph",
    patterns: [
      /graph\.facebook\.com/gi,
      /facebook\.com\/v\d+/gi,
    ],
  },
  {
    provider: "Google APIs",
    patterns: [
      /googleapis\.com/gi,
      /google\.com\/oauth/gi,
    ],
  },
];

const PROVIDER_ENDPOINTS = [
  {
    provider: "OpenAI",
    pattern: /https?:\/\/api\.openai\.com/gi,
  },
  {
    provider: "Anthropic",
    pattern: /https?:\/\/api\.anthropic\.com/gi,
  },
  {
    provider: "Twilio",
    pattern: /https?:\/\/api\.twilio\.com/gi,
  },
  {
    provider: "Stripe",
    pattern: /https?:\/\/api\.stripe\.com/gi,
  },
  {
    provider: "Meta",
    pattern: /https?:\/\/graph\.facebook\.com/gi,
  },
  {
    provider: "Google",
    pattern: /https?:\/\/[^"'`\s]*googleapis\.com/gi,
  },
];

const findings = [];

function normalizeFile(filePath) {
  return `/${path.relative(ROOT, filePath).split(path.sep).join("/")}`;
}

function containsMarker(file, markers) {
  return markers.some((marker) => file.includes(marker));
}

function isTestFile(file) {
  return containsMarker(file, TEST_FILE_MARKERS);
}

function isGeneratedFile(file) {
  return containsMarker(file, GENERATED_FILE_MARKERS);
}

function isServiceFile(file) {
  return containsMarker(file, SERVICE_PATH_MARKERS);
}

function isProviderLayer(file) {
  return (
    isServiceFile(file) &&
    containsMarker(file, PROVIDER_LAYER_MARKERS)
  );
}

function isUsageLayer(file) {
  return (
    isServiceFile(file) &&
    containsMarker(file, USAGE_LAYER_MARKERS)
  );
}

function isPricingLayer(file) {
  return (
    isServiceFile(file) &&
    containsMarker(file, PRICING_LAYER_MARKERS)
  );
}

function isWalletLayer(file) {
  return (
    isServiceFile(file) &&
    containsMarker(file, WALLET_LAYER_MARKERS)
  );
}

function isBillingLayer(file) {
  return (
    isServiceFile(file) &&
    containsMarker(file, BILLING_LAYER_MARKERS)
  );
}

function isFinanceLayer(file) {
  return containsMarker(file, FINANCE_LAYER_MARKERS);
}

function isUBTELayer(file) {
  return containsMarker(file, UBTE_LAYER_MARKERS);
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function lineText(content, index) {
  const start = content.lastIndexOf("\n", index) + 1;
  const endIndex = content.indexOf("\n", index);
  const end = endIndex === -1 ? content.length : endIndex;

  return content
    .slice(start, end)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function addFinding({
  severity,
  rule,
  file,
  content,
  index = 0,
  message,
  evidence,
}) {
  findings.push({
    severity,
    rule,
    file: file.replace(/^\//, ""),
    line: lineNumber(content, index),
    message,
    evidence:
      evidence ||
      lineText(content, index),
  });
}

function walkDirectory(directory, collected) {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (
      entry.isDirectory() &&
      IGNORED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(absolutePath, collected);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    collected.push(absolutePath);
  }
}

function collectFiles() {
  const files = [];

  for (const root of SOURCE_ROOTS) {
    walkDirectory(path.join(ROOT, root), files);
  }

  return files.sort();
}

function findMatches(content, pattern) {
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes("g")
      ? pattern.flags
      : `${pattern.flags}g`,
  );

  const matches = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    matches.push(match);

    if (match.index === regex.lastIndex) {
      regex.lastIndex += 1;
    }
  }

  return matches;
}

function auditTenantUsage(file, content) {
  const patterns = [
    /\btenant_id\b/g,
    /\btenantId\b/g,
    /\bTenantProvider\b/g,
    /\brequireTenantAccess\b/g,
    /["']tenant["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of findMatches(content, pattern)) {
      addFinding({
        severity: "ERROR",
        rule: "NO_TENANT",
        file,
        content,
        index: match.index,
        message:
          "Legacy tenant context found. Use organization_id and entity_id where required.",
      });
    }
  }
}

function auditDirectProviderUsage(file, content) {
  if (isProviderLayer(file)) {
    return;
  }

  for (const definition of PROVIDER_PACKAGES) {
    for (const pattern of definition.patterns) {
      for (const match of findMatches(content, pattern)) {
        addFinding({
          severity: "ERROR",
          rule: "DIRECT_PROVIDER_BYPASS",
          file,
          content,
          index: match.index,
          message:
            `${definition.provider} is used outside the Service Provider layer.`,
        });
      }
    }
  }

  for (const definition of PROVIDER_ENDPOINTS) {
    for (const match of findMatches(content, definition.pattern)) {
      addFinding({
        severity: "ERROR",
        rule: "DIRECT_PROVIDER_ENDPOINT",
        file,
        content,
        index: match.index,
        message:
          `${definition.provider} endpoint is called outside the Service Provider layer.`,
      });
    }
  }
}

function auditProviderEnvironmentAccess(file, content) {
  if (isProviderLayer(file)) {
    return;
  }

  const credentialPattern =
    /process\.env\.[A-Z0-9_]*(OPENAI|ANTHROPIC|TWILIO|STRIPE|SENDGRID|RESEND|GOOGLE|META|FACEBOOK|WHATSAPP|AWS)[A-Z0-9_]*/g;

  for (const match of findMatches(content, credentialPattern)) {
    addFinding({
      severity: "ERROR",
      rule: "PROVIDER_CREDENTIAL_BYPASS",
      file,
      content,
      index: match.index,
      message:
        "Provider credentials are accessed outside the Service Provider layer.",
    });
  }
}

function auditDirectWalletMutation(file, content) {
  const mutationPatterns = [
    /\.from\(["'](?:service_)?wallets?["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\.from\(["']wallet_ledger["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\.from\(["']wallet_transactions["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\b(?:debitWallet|walletDebit|chargeWallet|deductWalletBalance)\s*\(/g,
    /\bwallet\.(?:debit|charge|deduct)\s*\(/g,
  ];

  const permitted =
    isUsageLayer(file) ||
    isWalletLayer(file);

  if (permitted) {
    return;
  }

  for (const pattern of mutationPatterns) {
    for (const match of findMatches(content, pattern)) {
      addFinding({
        severity: "ERROR",
        rule: "DIRECT_WALLET_MUTATION",
        file,
        content,
        index: match.index,
        message:
          "Wallet mutation bypasses Usage control. Only Usage/Wallet orchestration may reserve, debit, refund or finalize wallet funds.",
      });
    }
  }
}

function auditDirectUsageMutation(file, content) {
  if (isUsageLayer(file)) {
    return;
  }

  const patterns = [
    /\.from\(["']service_usage["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\.from\(["']usage_records["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\.from\(["']provider_usage["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
  ];

  for (const pattern of patterns) {
    for (const match of findMatches(content, pattern)) {
      addFinding({
        severity: "ERROR",
        rule: "DIRECT_USAGE_MUTATION",
        file,
        content,
        index: match.index,
        message:
          "Usage records are mutated outside the Service Usage layer.",
      });
    }
  }
}

function auditDirectBillingMutation(file, content) {
  if (
    isBillingLayer(file) ||
    isFinanceLayer(file)
  ) {
    return;
  }

  const patterns = [
    /\.from\(["']service_billing["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\.from\(["']billing_events["']\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/gs,
    /\b(?:createBillingEvent|generateServiceBill|billUsage)\s*\(/g,
  ];

  for (const pattern of patterns) {
    for (const match of findMatches(content, pattern)) {
      addFinding({
        severity: "ERROR",
        rule: "DIRECT_BILLING_MUTATION",
        file,
        content,
        index: match.index,
        message:
          "Billing is created outside the Service Billing or Finance boundary.",
      });
    }
  }
}

function auditDirectFinancePosting(file, content) {
  if (
    isFinanceLayer(file) ||
    isBillingLayer(file)
  ) {
    return;
  }

  const patterns = [
    /\b(?:postJournal|createJournal|buildJournalFromEvent)\s*\(/g,
    /\.from\(["']journal_entries["']\)\s*\.\s*(?:insert|update|upsert)\s*\(/gs,
    /\.from\(["']general_ledger["']\)\s*\.\s*(?:insert|update|upsert)\s*\(/gs,
  ];

  for (const pattern of patterns) {
    for (const match of findMatches(content, pattern)) {
      addFinding({
        severity: "ERROR",
        rule: "DIRECT_FINANCE_POSTING",
        file,
        content,
        index: match.index,
        message:
          "Service/provider code must emit billing or finance events instead of posting directly to Finance.",
      });
    }
  }
}

function auditHardcodedPricing(file, content) {
  const serviceOrProviderFile =
    isServiceFile(file) ||
    isProviderLayer(file);

  if (
    !serviceOrProviderFile ||
    isPricingLayer(file) ||
    isTestFile(file)
  ) {
    return;
  }

  const patterns = [
    /\bprice\s*:\s*\d+(?:\.\d+)?/g,
    /\bcost\s*:\s*\d+(?:\.\d+)?/g,
    /\brate\s*:\s*\d+(?:\.\d+)?/g,
    /\bunit_price\s*:\s*\d+(?:\.\d+)?/g,
    /\bprice_per_[a-z_]+\s*:\s*\d+(?:\.\d+)?/gi,
    /\b(?:token|message|image|minute|request)Cost\s*=\s*\d+(?:\.\d+)?/g,
  ];

  for (const pattern of patterns) {
    for (const match of findMatches(content, pattern)) {
      addFinding({
        severity: "WARNING",
        rule: "HARDCODED_SERVICE_PRICING",
        file,
        content,
        index: match.index,
        message:
          "Possible hardcoded service price outside the Pricing layer.",
      });
    }
  }
}

function auditProviderExecutionContract(file, content) {
  if (!isProviderLayer(file)) {
    return;
  }

  const executionIndicators = [
    /\bexecute\s*\(/,
    /\binvoke\s*\(/,
    /\brequest\s*\(/,
    /\bcompletion/,
    /\bgenerateContent/,
    /\bmessages\.create/,
    /\bchat\.completions/,
    /\bfetch\s*\(/,
  ];

  const executesProvider = executionIndicators.some(
    (pattern) => pattern.test(content),
  );

  if (!executesProvider) {
    return;
  }

  const requiredIdentity = [
    {
      field: "organization_id",
      alternatives: [
        /\borganization_id\b/,
        /\borganizationId\b/,
      ],
    },
    {
      field: "party_id",
      alternatives: [
        /\bparty_id\b/,
        /\bpartyId\b/,
      ],
    },
  ];

  for (const requirement of requiredIdentity) {
    const found = requirement.alternatives.some(
      (pattern) => pattern.test(content),
    );

    if (!found) {
      addFinding({
        severity: "ERROR",
        rule: "PROVIDER_IDENTITY_CONTEXT",
        file,
        content,
        index: 0,
        message:
          `Provider execution file does not reference required ${requirement.field}.`,
        evidence: path.basename(file),
      });
    }
  }

  const usageIndicators = [
    /\busage_id\b/,
    /\busageId\b/,
    /\bcreateUsage\b/,
    /\breserveUsage\b/,
    /\bfinalizeUsage\b/,
    /\bUsageEngine\b/,
    /\bUsageControl\b/,
    /\bexecuteWithUsage\b/,
  ];

  const hasUsageControl = usageIndicators.some(
    (pattern) => pattern.test(content),
  );

  if (!hasUsageControl) {
    addFinding({
      severity: "ERROR",
      rule: "PROVIDER_WITHOUT_USAGE_CONTROL",
      file,
      content,
      index: 0,
      message:
        "Provider execution has no visible Usage control contract.",
      evidence: path.basename(file),
    });
  }
}

function auditWalletIdentityContract(file, content) {
  if (!isWalletLayer(file)) {
    return;
  }

  const mutationIndicators = [
    /\bdebit\b/,
    /\breserve\b/,
    /\brefund\b/,
    /\bcredit\b/,
    /\bfinalize\b/,
    /\.insert\s*\(/,
    /\.update\s*\(/,
    /\.upsert\s*\(/,
  ];

  const mutatesWallet = mutationIndicators.some(
    (pattern) => pattern.test(content),
  );

  if (!mutatesWallet) {
    return;
  }

  const fields = [
    {
      name: "organization_id",
      patterns: [
        /\borganization_id\b/,
        /\borganizationId\b/,
      ],
    },
    {
      name: "party_id",
      patterns: [
        /\bparty_id\b/,
        /\bpartyId\b/,
      ],
    },
    {
      name: "entity_id",
      patterns: [
        /\bentity_id\b/,
        /\bentityId\b/,
      ],
    },
    {
      name: "usage_id",
      patterns: [
        /\busage_id\b/,
        /\busageId\b/,
      ],
    },
  ];

  for (const field of fields) {
    if (!field.patterns.some((pattern) => pattern.test(content))) {
      addFinding({
        severity: "ERROR",
        rule: "WALLET_IDENTITY_CONTEXT",
        file,
        content,
        index: 0,
        message:
          `Wallet mutation file does not reference required ${field.name}.`,
        evidence: path.basename(file),
      });
    }
  }
}

function auditBillingIdentityContract(file, content) {
  if (!isBillingLayer(file)) {
    return;
  }

  const billingIndicators = [
    /\bbill\b/i,
    /\binvoice\b/i,
    /\bcharge\b/i,
    /\bcreateBillingEvent\b/,
    /\.insert\s*\(/,
    /\.upsert\s*\(/,
  ];

  if (
    !billingIndicators.some(
      (pattern) => pattern.test(content),
    )
  ) {
    return;
  }

  const required = [
    {
      name: "organization_id",
      patterns: [
        /\borganization_id\b/,
        /\borganizationId\b/,
      ],
    },
    {
      name: "party_id",
      patterns: [
        /\bparty_id\b/,
        /\bpartyId\b/,
      ],
    },
    {
      name: "entity_id",
      patterns: [
        /\bentity_id\b/,
        /\bentityId\b/,
      ],
    },
    {
      name: "usage_id",
      patterns: [
        /\busage_id\b/,
        /\busageId\b/,
      ],
    },
    {
      name: "provider_id",
      patterns: [
        /\bprovider_id\b/,
        /\bproviderId\b/,
      ],
    },
    {
      name: "service_id",
      patterns: [
        /\bservice_id\b/,
        /\bserviceId\b/,
      ],
    },
  ];

  for (const field of required) {
    if (!field.patterns.some((pattern) => pattern.test(content))) {
      addFinding({
        severity: "ERROR",
        rule: "BILLING_IDENTITY_CONTEXT",
        file,
        content,
        index: 0,
        message:
          `Billing file does not reference required ${field.name}.`,
        evidence: path.basename(file),
      });
    }
  }
}

function auditServiceApiContext(file, content) {
  const isApiRoute =
    file.includes("/app/api/") &&
    /\/route\.(?:js|jsx|ts|tsx)$/.test(file);

  if (!isApiRoute) {
    return;
  }

  const serviceIndicators = [
    /\bprovider\b/i,
    /\bwallet\b/i,
    /\busage\b/i,
    /\bservice_id\b/,
    /\bserviceId\b/,
    /\bOpenAI\b/,
    /\bAnthropic\b/,
    /\bTwilio\b/,
    /\bStripe\b/,
    /graph\.facebook\.com/i,
  ];

  if (
    !serviceIndicators.some(
      (pattern) => pattern.test(content),
    )
  ) {
    return;
  }

  const hasBusinessContext =
    /\bBusinessContext\b/.test(content) ||
    /\bresolveBusinessContext\b/.test(content) ||
    /\bbuildBusinessContext\b/.test(content) ||
    /\brequireBusinessContext\b/.test(content);

  if (!hasBusinessContext) {
    addFinding({
      severity: "ERROR",
      rule: "SERVICE_API_WITHOUT_BUSINESS_CONTEXT",
      file,
      content,
      index: 0,
      message:
        "Service-related API route does not visibly resolve BusinessContext.",
      evidence: path.basename(file),
    });
  }

  const requiredFields = [
    {
      name: "organization_id",
      patterns: [
        /\borganization_id\b/,
        /\borganizationId\b/,
      ],
    },
    {
      name: "party_id",
      patterns: [
        /\bparty_id\b/,
        /\bpartyId\b/,
      ],
    },
  ];

  for (const field of requiredFields) {
    if (!field.patterns.some((pattern) => pattern.test(content))) {
      addFinding({
        severity: "ERROR",
        rule: "SERVICE_API_IDENTITY_CONTEXT",
        file,
        content,
        index: 0,
        message:
          `Service-related API route does not reference ${field.name}.`,
        evidence: path.basename(file),
      });
    }
  }
}

function auditDirectSupabaseProviderExecution(file, content) {
  if (
    isProviderLayer(file) ||
    isUsageLayer(file) ||
    isWalletLayer(file) ||
    isBillingLayer(file)
  ) {
    return;
  }

  const serviceTablePattern =
    /\.from\(["'](service_providers|service_usage|provider_usage|service_wallets|wallet_ledger|wallet_transactions|service_billing|billing_events|service_pricing)["']\)/g;

  for (const match of findMatches(content, serviceTablePattern)) {
    addFinding({
      severity: "WARNING",
      rule: "SERVICE_TABLE_ACCESS_OUTSIDE_DOMAIN",
      file,
      content,
      index: match.index,
      message:
        `Service table "${match[1]}" is accessed outside its Service Domain layer.`,
    });
  }
}

function auditUBTEBypass(file, content) {
  if (
    isProviderLayer(file) ||
    isUsageLayer(file) ||
    isWalletLayer(file) ||
    isBillingLayer(file) ||
    isUBTELayer(file)
  ) {
    return;
  }

  const serviceExecutionIndicators = [
    /\bProviderResolver\b/,
    /\bProviderExecutor\b/,
    /\bexecuteProvider\b/,
    /\bexecuteService\b/,
    /\bresolveProvider\b/,
  ];

  const executesService = serviceExecutionIndicators.some(
    (pattern) => pattern.test(content),
  );

  if (!executesService) {
    return;
  }

  const ubteIndicators = [
    /\bUBTE\b/,
    /\bExecutionEngine\b/,
    /\bexecuteCapability\b/,
    /\bexecuteThroughUBTE\b/,
    /\bcapabilityExecutor\b/,
  ];

  const hasUBTE = ubteIndicators.some(
    (pattern) => pattern.test(content),
  );

  if (!hasUBTE) {
    addFinding({
      severity: "WARNING",
      rule: "POSSIBLE_UBTE_BYPASS",
      file,
      content,
      index: 0,
      message:
        "Service execution reference found without a visible UBTE/capability execution boundary.",
      evidence: path.basename(file),
    });
  }
}

function auditFile(absolutePath) {
  const file = normalizeFile(absolutePath);

  if (
    isTestFile(file) ||
    isGeneratedFile(file)
  ) {
    return;
  }

  let content;

  try {
    content = fs.readFileSync(absolutePath, "utf8");
  } catch {
    return;
  }

  auditTenantUsage(file, content);
  auditDirectProviderUsage(file, content);
  auditProviderEnvironmentAccess(file, content);
  auditDirectWalletMutation(file, content);
  auditDirectUsageMutation(file, content);
  auditDirectBillingMutation(file, content);
  auditDirectFinancePosting(file, content);
  auditHardcodedPricing(file, content);
  auditProviderExecutionContract(file, content);
  auditWalletIdentityContract(file, content);
  auditBillingIdentityContract(file, content);
  auditServiceApiContext(file, content);
  auditDirectSupabaseProviderExecution(file, content);
  auditUBTEBypass(file, content);
}

function countBySeverity() {
  return findings.reduce(
    (result, finding) => {
      result[finding.severity] += 1;
      return result;
    },
    {
      ERROR: 0,
      WARNING: 0,
      INFO: 0,
    },
  );
}

function countByRule() {
  const result = {};

  for (const finding of findings) {
    result[finding.rule] =
      (result[finding.rule] || 0) + 1;
  }

  return Object.entries(result)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }

      return a[0].localeCompare(b[0]);
    });
}

function buildReport(files) {
  const severity = countBySeverity();
  const rules = countByRule();

  return {
    audit: "Avantiqo Service Domain Convergence Audit",
    generated_at: new Date().toISOString(),
    root: ROOT,
    strict: STRICT,
    files_scanned: files.length,
    summary: severity,
    rules: Object.fromEntries(rules),
    findings,
  };
}

function printHumanReport(report) {
  const line = "=".repeat(88);

  console.log(line);
  console.log("AVANTIQO SERVICE DOMAIN CONVERGENCE AUDIT");
  console.log(line);
  console.log();
  console.log(`Files scanned : ${report.files_scanned}`);
  console.log(`Errors        : ${report.summary.ERROR}`);
  console.log(`Warnings      : ${report.summary.WARNING}`);
  console.log(`Strict mode   : ${report.strict ? "YES" : "NO"}`);
  console.log();

  console.log("ENFORCED EXECUTION FLOW");
  console.log("-".repeat(88));
  console.log(
    "UBTE -> SERVICE -> PROVIDER -> USAGE -> PRICING -> WALLET -> BILLING -> FINANCE",
  );
  console.log();

  console.log("ENFORCED IDENTITY");
  console.log("-".repeat(88));
  console.log("organization_id : always");
  console.log("party_id        : attributable usage");
  console.log("entity_id       : wallet, billing, finance and legal ownership");
  console.log();

  if (report.rules && Object.keys(report.rules).length) {
    console.log("FINDINGS BY RULE");
    console.log("-".repeat(88));

    for (const [rule, count] of Object.entries(report.rules)) {
      console.log(
        `${String(count).padStart(5, " ")}  ${rule}`,
      );
    }

    console.log();
  }

  if (!report.findings.length) {
    console.log("RESULT");
    console.log("-".repeat(88));
    console.log("PASS — no Service Domain convergence violations detected.");
    console.log();
    return;
  }

  console.log("DETAILED FINDINGS");
  console.log("-".repeat(88));

  const sorted = [...report.findings].sort((a, b) => {
    const severityOrder = {
      ERROR: 0,
      WARNING: 1,
      INFO: 2,
    };

    if (
      severityOrder[a.severity] !==
      severityOrder[b.severity]
    ) {
      return (
        severityOrder[a.severity] -
        severityOrder[b.severity]
      );
    }

    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }

    return a.line - b.line;
  });

  for (const finding of sorted) {
    console.log();
    console.log(
      `[${finding.severity}] ${finding.rule}`,
    );
    console.log(
      `  ${finding.file}:${finding.line}`,
    );
    console.log(
      `  ${finding.message}`,
    );

    if (finding.evidence) {
      console.log(
        `  > ${finding.evidence}`,
      );
    }
  }

  console.log();
  console.log(line);

  if (report.summary.ERROR > 0) {
    console.log(
      "FAILED — Service Domain architecture violations must be converged.",
    );
  } else if (
    STRICT &&
    report.summary.WARNING > 0
  ) {
    console.log(
      "FAILED — strict mode treats warnings as failures.",
    );
  } else {
    console.log(
      "PASSED WITH WARNINGS — review warnings before declaring convergence complete.",
    );
  }

  console.log(line);
}

function buildMarkdownReport(report) {
  const rows = report.findings
    .map((finding) => {
      const evidence = String(finding.evidence || "")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");

      return [
        finding.severity,
        finding.rule,
        `${finding.file}:${finding.line}`,
        finding.message.replace(/\|/g, "\\|"),
        evidence,
      ].join(" | ");
    })
    .map((row) => `| ${row} |`)
    .join("\n");

  return `# Avantiqo Service Domain Convergence Audit

Generated: ${report.generated_at}

## Required flow

\`\`\`
UBTE
  -> Service Capability
  -> Service Runtime
  -> Provider Resolver
  -> Usage Control
  -> Pricing
  -> Wallet
  -> Billing
  -> Finance
\`\`\`

## Required identity

- \`organization_id\`: always
- \`party_id\`: attributable usage
- \`entity_id\`: wallet, billing, finance and legal ownership

## Summary

- Files scanned: ${report.files_scanned}
- Errors: ${report.summary.ERROR}
- Warnings: ${report.summary.WARNING}
- Strict mode: ${report.strict ? "yes" : "no"}

## Findings

| Severity | Rule | Location | Message | Evidence |
|---|---|---|---|---|
${rows || "| PASS | NONE | - | No convergence violations detected. | - |"}
`;
}

const files = collectFiles();

for (const file of files) {
  auditFile(file);
}

const report = buildReport(files);

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

if (WRITE_REPORT) {
  const reportDirectory = path.join(
    ROOT,
    "audit-reports",
  );

  fs.mkdirSync(reportDirectory, {
    recursive: true,
  });

  const jsonPath = path.join(
    reportDirectory,
    "service-domain-audit.json",
  );

  const markdownPath = path.join(
    reportDirectory,
    "service-domain-audit.md",
  );

  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  fs.writeFileSync(
    markdownPath,
    buildMarkdownReport(report),
    "utf8",
  );

  if (!JSON_ONLY) {
    console.log();
    console.log(
      `JSON report     : ${path.relative(ROOT, jsonPath)}`,
    );
    console.log(
      `Markdown report : ${path.relative(ROOT, markdownPath)}`,
    );
  }
}

const hasErrors =
  report.summary.ERROR > 0;

const hasStrictWarnings =
  STRICT &&
  report.summary.WARNING > 0;

process.exitCode =
  hasErrors || hasStrictWarnings
    ? 1
    : 0;
