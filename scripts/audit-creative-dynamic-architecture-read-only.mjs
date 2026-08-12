#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const CONTRACT = "CREATIVE_DYNAMIC_ARCHITECTURE_AUDIT_V1";
const ROOTS = ["lib/creative", "components/creative", "app/api/creative"];
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const OUTPUT = path.resolve(
  process.env.CREATIVE_DYNAMIC_ARCHITECTURE_AUDIT_OUTPUT ||
    "/tmp/creative-dynamic-architecture-audit.json",
);
const STRICT = process.env.CREATIVE_DYNAMIC_ARCHITECTURE_STRICT === "true";

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

const WORKFLOW_TERMS = [
  "TEMPORAL",
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
];

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(value) {
  return new RegExp(`\\b${escapeRegex(value).replace(/\\ /g, "\\s+")}\\b`, "i");
}

function windowFor(lines, index, radius = 5) {
  return lines
    .slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1))
    .join("\n");
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

function isDocumentationLikeLine(line) {
  return /^\s*(?:\/\/|\/\*|\*|#)/.test(line);
}

function hasAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function isTestFixture(relative) {
  return /^app\/api\/creative\/tests\//.test(relative);
}

function isAntiHardcodingInstruction(context) {
  return /(?:\bno\s+hardcoded\b|\bno\s+canned\b|\bdo\s+not\s+use\b|\bmust\s+not\b|\bnever\s+use\b|\bforbid(?:den)?\b).{0,80}\b(?:industry|sector|vertical|template|preset)\b/i.test(context) ||
    /\b(?:industry|sector|vertical)\b.{0,80}(?:\bmust\s+not\b|\bdo\s+not\b|\bnever\b|\bforbid(?:den)?\b|\bno\s+hardcoded\b|\bno\s+canned\b)/i.test(context);
}

function fixtureSeverity(relative, defaultSeverity) {
  return isTestFixture(relative) ? "REVIEW" : defaultSeverity;
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
    if (!trimmed || isDocumentationLikeLine(trimmed)) continue;
    const context = windowFor(lines, index);

    for (const term of ORGANIZATION_TERMS) {
      if (!phraseRegex(term).test(line)) continue;
      addFinding(findings, {
        severity: fixtureSeverity(relative, "BLOCKER"),
        ownership: isTestFixture(relative) ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
        rule: isTestFixture(relative)
          ? "ORGANIZATION_SPECIFIC_TEST_FIXTURE_REVIEW"
          : "ORGANIZATION_SPECIFIC_LITERAL",
        term,
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: isTestFixture(relative)
          ? "Named organization test fixtures are review evidence and must not leak into production Creative routing."
          : "Universal Creative execution must not encode one organization as behavior.",
      });
    }

    for (const term of BUSINESS_TERMS) {
      if (!phraseRegex(term).test(line)) continue;
      const menuDeliverable = term === "menu" && /\b(?:type|deliverable|output|document)\b/i.test(context);
      if (menuDeliverable) continue;
      addFinding(findings, {
        severity: fixtureSeverity(relative, "BLOCKER"),
        ownership: isTestFixture(relative) ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
        rule: isTestFixture(relative)
          ? "BUSINESS_CATEGORY_TEST_FIXTURE_REVIEW"
          : "BUSINESS_CATEGORY_LITERAL",
        term,
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: isTestFixture(relative)
          ? "Business-category test fixtures are review evidence and must remain isolated from universal production logic."
          : "Business meaning must come from verified organization and mission context, not a fixed category vocabulary.",
      });
    }

    if (/\bconst\s+DELIVERABLES\s*=\s*\[/.test(line)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "REGISTRY_DATA",
        rule: "STATIC_DELIVERABLE_CATALOG",
        term: "DELIVERABLES",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "The Studio deliverable universe must be registry/capability data rather than a component-owned fixed list.",
      });
    }

    if (/\bconst\s+CHANNELS\s*=\s*\[/.test(line)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "REGISTRY_DATA",
        rule: "STATIC_CHANNEL_CATALOG",
        term: "CHANNELS",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Available channels must be resolved from organization/channel capability data rather than a component-owned fixed list.",
      });
    }

    if (/useState\(\s*["'`](?:VIDEO|FILM|IMAGE|DOCUMENT|AUDIO)["'`]\s*\)/.test(line)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        rule: "STATIC_MEDIA_DEFAULT",
        term: line.match(/(?:VIDEO|FILM|IMAGE|DOCUMENT|AUDIO)/)?.[0] || "media",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "A creative medium must not be silently chosen before mission reasoning.",
      });
    }

    if (/useState\(\s*\[\s*["'`](?:instagram|facebook|tiktok|youtube|website|display)["'`]\s*\]\s*\)/i.test(line)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "MISSION_DECISION",
        rule: "STATIC_CHANNEL_DEFAULT",
        term: line.match(/(?:instagram|facebook|tiktok|youtube|website|display)/i)?.[0] || "channel",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "A publication channel must not be silently selected before organization and mission context resolve it.",
      });
    }

    if (/\b(?:const|let|var)\s+(?:map|workflowMap|workflow_map)\s*=\s*\{/.test(line) && hasAny(context, WORKFLOW_TERMS)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "REGISTRY_DATA",
        rule: "STATIC_WORKFLOW_ROUTING_MAP",
        term: "workflow-map",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Creative workflow routing must be resolved from registered capabilities rather than an embedded taxonomy map.",
      });
    }

    if (/\bworkflow_kind\s*:\s*["'`]TEMPORAL["'`]/.test(line) && /fallback/i.test(context)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        rule: "TEMPORAL_FALLBACK_DEFAULT",
        term: "TEMPORAL",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Failure handling may not silently choose a temporal/video creative solution.",
      });
    }

    if (/\btype\s*:\s*["'`]VIDEO["'`]/.test(line) && /fallback|degraded/i.test(context)) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        rule: "VIDEO_FALLBACK_DELIVERABLE",
        term: "VIDEO",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "A degraded or fallback path must not invent a video deliverable.",
      });
    }

    if (/\bfunction\s+promptFor\s*\(/.test(line) || /\bconst\s+promptFor\s*=/.test(line)) {
      addFinding(findings, {
        severity: "REVIEW",
        ownership: "PROVIDER_TRANSPORT_DETAIL",
        rule: "CREATIVE_PROMPT_TEMPLATE_OWNER",
        term: "promptFor",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Verify that creative ontology and policy are owned by structured contracts and only serialized into provider instructions at the transport boundary.",
      });
    }

    if (/\b(?:USD|EUR|GBP|THB)\b/.test(line) && /currency|cost|budget|price/i.test(context)) {
      addFinding(findings, {
        severity: isTestFixture(relative) ? "REVIEW" : "REVIEW",
        ownership: isTestFixture(relative) ? "TEST_FIXTURE" : "ORGANIZATION_CONTEXT",
        rule: isTestFixture(relative)
          ? "CURRENCY_TEST_FIXTURE_REVIEW"
          : "CURRENCY_LITERAL_REVIEW",
        term: line.match(/\b(?:USD|EUR|GBP|THB)\b/)?.[0] || "currency",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: isTestFixture(relative)
          ? "Currency in a test fixture must remain isolated from production defaults."
          : "Confirm currency is sample/schema data only and never a runtime default that bypasses organization configuration.",
      });
    }

    if (/\b(?:16:9|9:16|1:1|4:5|1920x1080|1080x1920)\b/.test(line) && /default|fallback|aspect|resolution|output_spec/i.test(context)) {
      addFinding(findings, {
        severity: "REVIEW",
        ownership: "CREATIVE_DIRECTOR_DECISION",
        rule: "FORMAT_LITERAL_REVIEW",
        term: line.match(/\b(?:16:9|9:16|1:1|4:5|1920x1080|1080x1920)\b/)?.[0] || "format",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Confirm the format value is an explicit contract/example and not a hidden creative default.",
      });
    }

    if (/\b(?:openai|grok|veo|seedance|fal)\b/i.test(line) && !/provider|adapter|loader|registry|capability|service/i.test(context)) {
      addFinding(findings, {
        severity: "REVIEW",
        ownership: "PROVIDER_TRANSPORT_DETAIL",
        rule: "PROVIDER_LITERAL_REVIEW",
        term: line.match(/\b(?:openai|grok|veo|seedance|fal)\b/i)?.[0] || "provider",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Provider names should only appear in provider/service boundary code, never as creative decision logic.",
      });
    }

    if (
      /\b(?:industry|sector|businessVertical|business_vertical|organizationType|organization_type)\b/.test(line) &&
      /\b(?:if|switch|case|route|select|rank|score|template|preset)\b/i.test(context) &&
      !isAntiHardcodingInstruction(context)
    ) {
      addFinding(findings, {
        severity: "BLOCKER",
        ownership: "ORGANIZATION_CONTEXT",
        rule: "BUSINESS_TAXONOMY_CONTROL_FLOW",
        term: line.match(/\b(?:industry|sector|businessVertical|business_vertical|organizationType|organization_type)\b/)?.[0] || "taxonomy",
        file: relative,
        line: index + 1,
        source: trimmed,
        reason: "Descriptive business taxonomy may inform context but must not select fixed Creative behavior.",
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
  ownership_model: [
    "SYSTEM_INVARIANT",
    "REGISTRY_DATA",
    "ORGANIZATION_CONTEXT",
    "MISSION_DECISION",
    "CREATIVE_DIRECTOR_DECISION",
    "PROVIDER_TRANSPORT_DETAIL",
    "TEST_FIXTURE",
  ],
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
