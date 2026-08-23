#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const CONTRACT = "CREATIVE_DYNAMIC_ARCHITECTURE_AUDIT_V2";
const ROOTS = ["lib/creative", "components/creative", "app/api/creative"];
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const OUTPUT = path.resolve(
  process.env.CREATIVE_DYNAMIC_ARCHITECTURE_AUDIT_OUTPUT ||
    "/tmp/creative-dynamic-architecture-audit.json",
);
const STRICT = process.env.CREATIVE_DYNAMIC_ARCHITECTURE_STRICT !== "false";

const ORGANIZATION_TERMS = ["churchill"];
const BUSINESS_TERMS = [
  "restaurant",
  "hospitality",
  "food and beverage",
  "food & beverage",
  "cocktail",
  "waiter",
  "waitress",
  "waitstaff",
  "chef",
  "hotel",
  "pest control",
  "construction",
  "retail",
  "manufacturing",
  "warehouse",
  "clinic",
  "hospital",
  "real estate",
  "salon",
  "spa",
  "school",
  "education",
  "law firm",
  "accounting firm",
];

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(value) {
  const escaped = escapeRegex(value).replace(/\\ /g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

function gitValue(args, fallback = null) {
  try {
    return text(execFileSync("git", args, { encoding: "utf8" })) || fallback;
  } catch {
    return fallback;
  }
}

function addFinding(findings, finding) {
  findings.push({
    severity: finding.severity || "REVIEW",
    ownership: finding.ownership || "UNCLASSIFIED",
    rule: finding.rule,
    term: finding.term || null,
    file: finding.file,
    line: finding.line,
    source: finding.source,
    reason: finding.reason,
  });
}

function isTestFixture(relative) {
  return /^app\/api\/creative\/tests\//.test(relative);
}

function isComment(line) {
  return /^\s*(?:\/\/|\/\*|\*|#)/.test(line);
}

function antiHardcodingText(value) {
  return /(?:do\s+not|don't|never|must\s+not|may\s+not|forbid(?:den)?|without)\s+[\s\S]{0,120}(?:hardcod|canned|template|preset|industry|sector|vertical|default)/i.test(value) ||
    /(?:industry|sector|vertical|category)\s+[\s\S]{0,120}(?:may\s+inform|must\s+not|may\s+not|never|not\s+select|not\s+route|not\s+control)/i.test(value);
}

function windowFor(lines, index, radius = 3) {
  return lines
    .slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1))
    .join("\n");
}

function taxonomyDataProjection(line) {
  const taxonomy = "(?:industry|sector|businessVertical|business_vertical|organizationType|organization_type)";
  return new RegExp(
    `\\.select\\s*\\(\\s*["'\\x60][^"'\\x60\\n]*\\b${taxonomy}\\b[^"'\\x60\\n]*["'\\x60]\\s*\\)`,
    "i",
  ).test(line);
}

function taxonomyControlsBehavior(line, context) {
  if (antiHardcodingText(context)) return false;
  // Reading taxonomy columns from a data source is descriptive context, not a
  // Creative decision. Keep `.select("...,industry,...")` out of the control-
  // flow rule while still blocking actual routing/selecting/ranking by taxonomy.
  if (taxonomyDataProjection(line)) return false;
  const taxonomy = "(?:industry|sector|businessVertical|business_vertical|organizationType|organization_type)";
  const patterns = [
    new RegExp(`if\\s*\\([^)]*\\b${taxonomy}\\b`, "i"),
    new RegExp(`switch\\s*\\([^)]*\\b${taxonomy}\\b`, "i"),
    new RegExp(`case\\s+[^:]*\\b${taxonomy}\\b`, "i"),
    new RegExp(`\\b${taxonomy}\\b[^\\n]{0,120}\\?(?:[^:]|$)`, "i"),
    new RegExp(`\\b${taxonomy}\\b[^\\n]{0,120}\\.(?:includes|startsWith|endsWith|match|test)\\(`, "i"),
    new RegExp(`(?:route|select|rank|score|template|preset|default)[A-Za-z0-9_]*\\s*\\([^)]*\\b${taxonomy}\\b`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(line) || pattern.test(context));
}

function addLiteralFindings(findings, relative, line, index) {
  const fixture = isTestFixture(relative);

  for (const term of ORGANIZATION_TERMS) {
    if (!phraseRegex(term).test(line)) continue;
    addFinding(findings, {
      severity: fixture ? "REVIEW" : "BLOCKER",
      ownership: fixture ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
      rule: fixture
        ? "ORGANIZATION_SPECIFIC_TEST_FIXTURE_REVIEW"
        : "ORGANIZATION_SPECIFIC_LITERAL",
      term,
      file: relative,
      line: index + 1,
      source: line.trim(),
      reason: fixture
        ? "Named organization fixtures must remain isolated from production Creative routing."
        : "Universal Creative production must not encode one organization as behavior.",
    });
  }

  for (const term of BUSINESS_TERMS) {
    if (!phraseRegex(term).test(line)) continue;
    if (antiHardcodingText(line)) continue;
    addFinding(findings, {
      severity: fixture ? "REVIEW" : "BLOCKER",
      ownership: fixture ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
      rule: fixture
        ? "BUSINESS_CATEGORY_TEST_FIXTURE_REVIEW"
        : "BUSINESS_CATEGORY_LITERAL",
      term,
      file: relative,
      line: index + 1,
      source: line.trim(),
      reason: fixture
        ? "Business-category fixtures must remain isolated from universal production logic."
        : "Production behavior must come from verified organization and mission context, not a fixed business-category vocabulary.",
    });
  }
}

const files = unique(ROOTS.flatMap((root) => walk(path.resolve(root)))).sort();
const findings = [];

for (const absolute of files) {
  const relative = path.relative(process.cwd(), absolute);
  const source = fs.readFileSync(absolute, "utf8");
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || isComment(trimmed)) continue;
    const context = windowFor(lines, index);

    addLiteralFindings(findings, relative, line, index);

    const blockers = [
      {
        test: /\bconst\s+DELIVERABLES\s*=\s*\[/,
        rule: "STATIC_DELIVERABLE_CATALOG",
        ownership: "REGISTRY_DATA",
        reason: "Deliverable choice must not be owned by a component-local fixed catalog.",
      },
      {
        test: /\bconst\s+CHANNELS\s*=\s*\[/,
        rule: "STATIC_CHANNEL_CATALOG",
        ownership: "REGISTRY_DATA",
        reason: "Channel availability must resolve from organization channel data.",
      },
      {
        test: /useState\(\s*["'`](?:VIDEO|FILM|IMAGE|DOCUMENT|AUDIO)["'`]\s*\)/i,
        rule: "STATIC_MEDIA_DEFAULT",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        reason: "Creative medium may not be silently preselected by UI state.",
      },
      {
        test: /useState\(\s*\[\s*["'`](?:instagram|facebook|tiktok|youtube|website|display)["'`]\s*\]\s*\)/i,
        rule: "STATIC_CHANNEL_DEFAULT",
        ownership: "MISSION_DECISION",
        reason: "Publication channel may not be silently preselected.",
      },
      {
        test: /\bworkflow_kind\s*:\s*["'`]TEMPORAL["'`]/i,
        context: /fallback|degraded/i,
        rule: "TEMPORAL_FALLBACK_DEFAULT",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        reason: "Failure handling may not silently choose temporal work.",
      },
      {
        test: /\btype\s*:\s*["'`]VIDEO["'`]/i,
        context: /fallback|degraded|default/i,
        rule: "VIDEO_FALLBACK_DELIVERABLE",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        reason: "Fallback/default paths may not invent video work.",
      },
      {
        test: /\b(?:duration|duration_seconds)\s*:\s*30\b/i,
        context: /default|fallback|\?\?|\|\|/i,
        rule: "STATIC_DURATION_DEFAULT",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        reason: "Creative duration must come from mission or delivery evidence.",
      },
      {
        test: /\b(?:aspect_ratio|resolution|frame_rate)\s*:\s*["'`]?(?:16:9|9:16|1:1|4:5|1920x1080|1080x1920|30)["'`]?/i,
        context: /default|fallback|\?\?|\|\|/i,
        rule: "STATIC_FORMAT_DEFAULT",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        reason: "Technical delivery format may not come from a silent fallback.",
      },
    ];

    for (const rule of blockers) {
      if (!rule.test.test(line)) continue;
      if (rule.context && !rule.context.test(context)) continue;
      addFinding(findings, {
        severity: isTestFixture(relative) ? "REVIEW" : "BLOCKER",
        ownership: isTestFixture(relative) ? "TEST_FIXTURE" : rule.ownership,
        rule: isTestFixture(relative) ? `${rule.rule}_TEST_FIXTURE_REVIEW` : rule.rule,
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: rule.reason,
      });
    }

    if (
      /\b(?:industry|sector|businessVertical|business_vertical|organizationType|organization_type)\b/.test(line) &&
      taxonomyControlsBehavior(line, context)
    ) {
      addFinding(findings, {
        severity: isTestFixture(relative) ? "REVIEW" : "BLOCKER",
        ownership: isTestFixture(relative) ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
        rule: isTestFixture(relative)
          ? "BUSINESS_TAXONOMY_CONTROL_FLOW_TEST_FIXTURE_REVIEW"
          : "BUSINESS_TAXONOMY_CONTROL_FLOW",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Descriptive business taxonomy may inform research but must not branch, route, score, preset or default Creative behavior.",
      });
    }

    if (/\b(?:USD|EUR|GBP|THB)\b/.test(line) && /currency|cost|budget|price/i.test(context)) {
      addFinding(findings, {
        severity: "REVIEW",
        ownership: isTestFixture(relative) ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
        rule: isTestFixture(relative)
          ? "CURRENCY_TEST_FIXTURE_REVIEW"
          : "CURRENCY_LITERAL_REVIEW",
        term: line.match(/\b(?:USD|EUR|GBP|THB)\b/)?.[0] || "currency",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Currency literals require review to confirm they are explicit fixtures/configuration rather than runtime defaults.",
      });
    }

    if (/\bfunction\s+promptFor\s*\(|\bconst\s+promptFor\s*=/.test(line)) {
      addFinding(findings, {
        severity: "REVIEW",
        ownership: "PROVIDER_TRANSPORT_DETAIL",
        rule: "CREATIVE_PROMPT_TEMPLATE_OWNER",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Confirm prompt serialization exists only at a provider/service transport boundary.",
      });
    }
  }
}

const deduped = [...new Map(findings.map((finding) => [
  [finding.rule, finding.file, finding.line, finding.term].join("|"),
  finding,
])).values()].sort((left, right) =>
  left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule),
);

const blockers = deduped.filter((finding) => finding.severity === "BLOCKER");
const reviews = deduped.filter((finding) => finding.severity === "REVIEW");
const ownership = {};
for (const finding of deduped) {
  ownership[finding.ownership] ||= { blockers: 0, reviews: 0, findings: 0 };
  ownership[finding.ownership].findings += 1;
  if (finding.severity === "BLOCKER") ownership[finding.ownership].blockers += 1;
  if (finding.severity === "REVIEW") ownership[finding.ownership].reviews += 1;
}

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  git_commit: gitValue(["rev-parse", "HEAD"]),
  git_branch: gitValue(["branch", "--show-current"], "DETACHED"),
  scanned_roots: ROOTS,
  scanned_file_count: files.length,
  strict_mode: STRICT,
  blocker_count: blockers.length,
  review_count: reviews.length,
  finding_count: deduped.length,
  blocker_files: unique(blockers.map((finding) => finding.file)),
  review_files: unique(reviews.map((finding) => finding.file)),
  ownership_summary: ownership,
  findings: deduped,
  decision: blockers.length
    ? "DYNAMIC_CREATIVE_ARCHITECTURE_CONVERGENCE_REQUIRED"
    : reviews.length
      ? "NO_PROVEN_BLOCKERS_REVIEW_REMAINING_ASSUMPTIONS"
      : "DYNAMIC_CREATIVE_ARCHITECTURE_GUARD_CLEAR",
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_spend_approved: false,
  publication_executed: false,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE DYNAMIC ARCHITECTURE AUDIT");
console.log("============================================================");
console.log(`CONTRACT=${CONTRACT}`);
console.log(`OUTPUT=${OUTPUT}`);
console.log(`SCANNED_FILE_COUNT=${report.scanned_file_count}`);
console.log(`STRICT_MODE=${STRICT ? "YES" : "NO"}`);
console.log(`BLOCKER_COUNT=${report.blocker_count}`);
console.log(`REVIEW_COUNT=${report.review_count}`);
console.log(`DECISION=${report.decision}`);
for (const finding of deduped) {
  console.log([
    `FINDING=${finding.severity}`,
    `ownership=${finding.ownership}`,
    `rule=${finding.rule}`,
    `term=${finding.term || ""}`,
    `file=${finding.file}`,
    `line=${finding.line}`,
    `source=${finding.source}`,
  ].join("|"));
}
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED=NO");
console.log("PUBLICATION_EXECUTED=NO");

if (STRICT && blockers.length) process.exitCode = 2;
