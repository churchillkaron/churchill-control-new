#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const CONTRACT = "CREATIVE_UNIVERSAL_BUSINESS_HARDCODING_AUDIT_V2";
const ROOTS = ["lib/creative"];
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const OUTPUT = path.resolve(
  process.env.CREATIVE_BUSINESS_HARDCODING_AUDIT_OUTPUT ||
  "/tmp/creative-universal-business-hardcoding-audit.json",
);

const DEFAULT_ORGANIZATION_TERMS = ["churchill"];
const DEFAULT_BUSINESS_TERMS = [
  "restaurant",
  "hospitality",
  "food and beverage",
  "food & beverage",
  "food",
  "beverage",
  "dish",
  "meal",
  "menu",
  "cocktail",
  "beer",
  "waiter",
  "waitress",
  "waitstaff",
  "chef",
  "hotel",
  "entertainment",
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

function envTerms(name, defaults) {
  const configured = text(process.env[name]);
  return unique([
    ...defaults,
    ...configured.split(",").map((value) => value.trim()),
  ]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(phrase) {
  const escaped = escapeRegex(phrase)
    .replace(/\\ /g, "\\s+")
    .replace(/\\&/g, "(?:&|and)");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function stripComments(source) {
  let output = "";
  let mode = "code";
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (mode === "line-comment") {
      if (current === "\n") {
        output += "\n";
        mode = "code";
      } else {
        output += " ";
      }
      continue;
    }

    if (mode === "block-comment") {
      if (current === "*" && next === "/") {
        output += "  ";
        index += 1;
        mode = "code";
      } else {
        output += current === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (mode === "string") {
      output += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === quote) {
        mode = "code";
        quote = null;
      }
      continue;
    }

    if (current === "/" && next === "/") {
      output += "  ";
      index += 1;
      mode = "line-comment";
      continue;
    }

    if (current === "/" && next === "*") {
      output += "  ";
      index += 1;
      mode = "block-comment";
      continue;
    }

    if (["'", '"', "`"].includes(current)) {
      output += current;
      mode = "string";
      quote = current;
      escaped = false;
      continue;
    }

    output += current;
  }

  return output;
}

function walk(root) {
  const output = [];
  if (!fs.existsSync(root)) return output;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...walk(absolute));
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      output.push(absolute);
    }
  }
  return output;
}

function gitValue(args, fallback = null) {
  try {
    return text(execFileSync("git", args, { encoding: "utf8" })) || fallback;
  } catch {
    return fallback;
  }
}

function contextWindow(lines, index, radius = 2) {
  return lines
    .slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1))
    .join("\n");
}

function isNavigationMenuContext(context) {
  return /\b(?:nav|navbar|navigation|nav-toggle|aria-label|toggle navigation)\b/i.test(context);
}

function isDeliverableMenuContext(context) {
  const hasMenuToken = /(?:\bMENU\b|["'`]MENU["'`])/i.test(context);
  const hasDeliverableVocabulary = /\b(?:DOCUMENT|PRESENTATION|REPORT|BROCHURE|POSTER|BANNER|WEBSITE|LANDING_PAGE|APPLICATION|IMAGE|VIDEO|FILM|AUDIO|DELIVERABLE|OUTPUT_TYPE|WORKFLOW_KIND)\b/i.test(context);
  const explicitDocumentMapping = /\bMENU\s*:\s*["'`](?:MENU|DOCUMENT)["'`]/i.test(context);
  return hasMenuToken && (hasDeliverableVocabulary || explicitDocumentMapping);
}

function literalDisposition(rule, code, context) {
  if (rule.rule !== "BUSINESS_CATEGORY_LITERAL") return "BLOCKER";

  if (rule.term.toLowerCase() === "menu") {
    if (isNavigationMenuContext(context)) return "EXEMPT_NAVIGATION_LABEL";
    if (isDeliverableMenuContext(context)) return "EXEMPT_DELIVERABLE_TYPE";
  }

  return "BLOCKER";
}

const organizationTerms = envTerms(
  "CREATIVE_FORBIDDEN_ORGANIZATION_TERMS",
  DEFAULT_ORGANIZATION_TERMS,
);
const businessTerms = envTerms(
  "CREATIVE_FORBIDDEN_BUSINESS_TERMS",
  DEFAULT_BUSINESS_TERMS,
);
const literalRules = [
  ...organizationTerms.map((term) => ({
    rule: "ORGANIZATION_SPECIFIC_LITERAL",
    severity: "BLOCKER",
    term,
    regex: phraseRegex(term),
    reason: "Universal Creative code must not encode one organization as execution logic.",
  })),
  ...businessTerms.map((term) => ({
    rule: "BUSINESS_CATEGORY_LITERAL",
    severity: "BLOCKER",
    term,
    regex: phraseRegex(term),
    reason: "Universal Creative code must derive business meaning from verified context rather than a fixed category vocabulary.",
  })),
];

const taxonomyField = /\b(?:industry|sector|industry_vertical|industryVertical|business_vertical|businessVertical|business_type|businessType|organization_type|organizationType)\b/i;
const controlFlow = /\b(?:if|else\s+if|switch|case)\b|\?.*:/;
const routingVerb = /\b(?:route|routing|select|selection|rank|ranking|score|scoring|priority|prioritize|order|ordering|strategy|profile|template|preset)\b/i;
const taxonomyMap = /\b(?:INDUSTRY|SECTOR|INDUSTRY_VERTICAL|BUSINESS_VERTICAL|BUSINESS_TYPE|ORGANIZATION_TYPE|CATEGORY)_[A-Z0-9_]*\s*=|\b(?:industry|sector|industryVertical|businessVertical|businessType|organizationType)Map\b/;

const files = unique(ROOTS.flatMap((root) => walk(path.resolve(root)))).sort();
const findings = [];
const exemptions = [];

for (const absolute of files) {
  const relative = path.relative(process.cwd(), absolute);
  const raw = fs.readFileSync(absolute, "utf8");
  const executable = stripComments(raw);
  const rawLines = raw.split(/\r?\n/);
  const executableLines = executable.split(/\r?\n/);

  for (let index = 0; index < executableLines.length; index += 1) {
    const code = executableLines[index];
    const original = rawLines[index] || "";
    if (!text(code)) continue;
    const context = contextWindow(executableLines, index);

    for (const rule of literalRules) {
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(code)) continue;

      const disposition = literalDisposition(rule, code, context);
      if (disposition !== "BLOCKER") {
        exemptions.push({
          rule: rule.rule,
          term: rule.term,
          file: relative,
          line: index + 1,
          source: original.trim(),
          disposition,
        });
        continue;
      }

      findings.push({
        severity: rule.severity,
        rule: rule.rule,
        term: rule.term,
        file: relative,
        line: index + 1,
        source: original.trim(),
        reason: rule.reason,
      });
    }

    if (taxonomyField.test(code) && controlFlow.test(code)) {
      findings.push({
        severity: "BLOCKER",
        rule: "TAXONOMY_CONTROL_FLOW",
        term: code.match(taxonomyField)?.[0] || "taxonomy",
        file: relative,
        line: index + 1,
        source: original.trim(),
        reason: "A descriptive business taxonomy field must not choose universal Creative behavior.",
      });
    } else if (taxonomyField.test(code) && routingVerb.test(code)) {
      findings.push({
        severity: "REVIEW",
        rule: "TAXONOMY_ROUTING_OR_SCORING_REFERENCE",
        term: code.match(taxonomyField)?.[0] || "taxonomy",
        file: relative,
        line: index + 1,
        source: original.trim(),
        reason: "Confirm that business taxonomy text is contextual evidence only and does not select a fixed path.",
      });
    }

    if (taxonomyMap.test(code)) {
      findings.push({
        severity: "BLOCKER",
        rule: "STATIC_TAXONOMY_MAP",
        term: code.match(taxonomyMap)?.[0] || "taxonomy-map",
        file: relative,
        line: index + 1,
        source: original.trim(),
        reason: "Universal Creative code must not maintain a fixed business taxonomy map.",
      });
    }
  }
}

const deduped = [...new Map(findings.map((finding) => [
  [finding.rule, finding.file, finding.line, finding.term].join("|"),
  finding,
])).values()].sort((left, right) =>
  left.file.localeCompare(right.file) ||
  left.line - right.line ||
  left.rule.localeCompare(right.rule),
);
const dedupedExemptions = [...new Map(exemptions.map((exemption) => [
  [exemption.disposition, exemption.file, exemption.line, exemption.term].join("|"),
  exemption,
])).values()].sort((left, right) =>
  left.file.localeCompare(right.file) || left.line - right.line,
);

const blockers = deduped.filter((finding) => finding.severity === "BLOCKER");
const reviews = deduped.filter((finding) => finding.severity === "REVIEW");
const byFile = {};
for (const finding of deduped) {
  byFile[finding.file] ||= { blockers: 0, reviews: 0, findings: [] };
  if (finding.severity === "BLOCKER") byFile[finding.file].blockers += 1;
  else byFile[finding.file].reviews += 1;
  byFile[finding.file].findings.push(finding);
}

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  repository_root: process.cwd(),
  git_commit: gitValue(["rev-parse", "HEAD"]),
  git_branch: gitValue(["branch", "--show-current"], "DETACHED"),
  scanned_roots: ROOTS,
  scanned_file_count: files.length,
  forbidden_organization_terms: organizationTerms,
  forbidden_business_terms: businessTerms,
  audit_semantics: {
    plain_vertical_is_media_orientation: true,
    explicit_business_vertical_fields_remain_audited: true,
    navigation_menu_labels_are_exempt: true,
    deliverable_menu_types_are_exempt: true,
  },
  exemption_count: dedupedExemptions.length,
  exemptions: dedupedExemptions,
  blocker_count: blockers.length,
  review_count: reviews.length,
  finding_count: deduped.length,
  blocker_files: unique(blockers.map((finding) => finding.file)),
  review_files: unique(reviews.map((finding) => finding.file)),
  findings: deduped,
  by_file: byFile,
  decision: blockers.length
    ? "UNIVERSAL_CREATIVE_BUSINESS_HARDCODING_REPAIR_REQUIRED"
    : reviews.length
      ? "NO_PROVEN_BLOCKERS_REVIEW_TAXONOMY_REFERENCES"
      : "UNIVERSAL_CREATIVE_BUSINESS_HARDCODING_NOT_FOUND",
  readiness: blockers.length
    ? "READY_FOR_BOUNDED_RUNTIME_REPAIR_SELECTION"
    : "READY_FOR_NEXT_STORY_LINEAGE_REPAIR",
  database_writes_executed: false,
  provider_selection_executed: false,
  provider_spend_approved: false,
  provider_calls_executed: false,
  task_dispatch_executed: false,
  source_regeneration_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY UNIVERSAL CREATIVE BUSINESS HARDCODING AUDIT");
console.log("============================================================");
console.log(`CONTRACT=${report.contract}`);
console.log(`OUTPUT=${OUTPUT}`);
console.log(`GIT_COMMIT=${report.git_commit}`);
console.log(`SCANNED_FILE_COUNT=${report.scanned_file_count}`);
console.log(`EXEMPTION_COUNT=${report.exemption_count}`);
console.log(`BLOCKER_COUNT=${report.blocker_count}`);
console.log(`REVIEW_COUNT=${report.review_count}`);
console.log(`BLOCKER_FILES=${JSON.stringify(report.blocker_files)}`);
console.log(`REVIEW_FILES=${JSON.stringify(report.review_files)}`);
for (const exemption of dedupedExemptions) {
  console.log([
    "EXEMPTION",
    `kind=${exemption.disposition}`,
    `term=${exemption.term}`,
    `file=${exemption.file}`,
    `line=${exemption.line}`,
    `source=${exemption.source}`,
  ].join("|"));
}
for (const finding of deduped) {
  console.log([
    `FINDING=${finding.severity}`,
    `rule=${finding.rule}`,
    `term=${finding.term}`,
    `file=${finding.file}`,
    `line=${finding.line}`,
    `source=${finding.source}`,
  ].join("|"));
}
console.log(`DECISION=${report.decision}`);
console.log(`READINESS=${report.readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_SELECTION_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
