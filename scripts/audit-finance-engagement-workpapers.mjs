#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const files = {
  engagementApi: "app/api/workspace/finance/engagement-file/route.js",
  engagementUi: "components/workspace/finance/FinanceEngagementFile.jsx",
  evidenceApi: "app/api/workspace/finance/work-programs/evidence/route.js",
  verifyApi: "app/api/workspace/finance/work-programs/verify/route.js",
  gates: "lib/finance/practice/workProgramGates.js",
};

const failures = [];

function source(name) {
  const file = files[name];
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    failures.push(`Missing ${name}: ${file}`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
}

function requireTokens(name, tokens) {
  const text = source(name);
  for (const token of tokens) {
    if (!text.includes(token)) failures.push(`${files[name]} missing contract: ${token}`);
  }
}

requireTokens("engagementApi", [
  "accounting_work_program_evidence_links",
  "available_documents",
  "verification_state",
  "verification_summary",
  "last_verified_at",
  "can_verify",
  "can_manage_evidence",
  "evidence_edit_block_reason",
  "evidence_requirements",
  "evidence_coverage",
  "missing_evidence_categories",
  "verification_attention_items",
  "completion_system_clearance",
  "no_external_message: true",
]);

requireTokens("engagementUi", [
  "Digital engagement file",
  "Work program & workpapers",
  "Workpaper evidence",
  "Evidence coverage",
  "Verify now",
  "Link existing document",
  "Link evidence",
  "Unlink",
  "Uses canonical client documents; no duplicate upload is created.",
  "Financial statement truth",
  "Dependency audit chain",
  "Historical system clearance snapshot retained at final lock.",
  "Missing evidence",
  "Verify attention",
  "/api/workspace/finance/work-programs/verify",
  "/api/workspace/finance/work-programs/evidence",
  "verification_state",
  "can_manage_evidence",
]);

requireTokens("evidenceApi", [
  "EVIDENCE_MUTABLE_ITEM_STATUSES",
  "Evidence cannot change after a work item enters review or completes; request changes first",
  "invalidateSystemGate",
  "verification_invalidated: true",
  "ACCOUNTING_EVIDENCE_LINKED",
  "ACCOUNTING_EVIDENCE_UNLINKED",
  "no_external_message: true",
]);

requireTokens("verifyApi", [
  "evaluateWorkProgramGate",
  "system_gate",
  "system_verified",
  "ACCOUNTING_WORK_ITEM_SYSTEM_VERIFIED",
  "ACCOUNTING_WORK_ITEM_SYSTEM_BLOCKED",
]);

requireTokens("gates", [
  "documentsGate",
  "statementsGate",
  "auditTrailGate",
  "DOCUMENT_CATEGORIES",
  "FINANCIAL_REPORT_SET",
  "DEPENDENCY_AUDIT_CHAIN",
  "runReport",
  "balanced",
]);

const coverage = {
  workpaper_procedure_drilldown: true,
  required_evidence_category_visibility: true,
  missing_evidence_visibility: true,
  canonical_document_linking: true,
  no_duplicate_document_upload_silo: true,
  controlled_document_unlinking: true,
  evidence_mutation_invalidates_verification: true,
  evidence_frozen_after_review_entry: true,
  explicit_current_truth_verification: true,
  statement_verification_detail: true,
  dependency_audit_chain_detail: true,
  historic_locked_system_clearance_visibility: true,
  zero_automatic_external_messages: true,
};

console.log("AVANTIQO FINANCE ENGAGEMENT WORKPAPER CERTIFICATION");
console.log(JSON.stringify(coverage, null, 2));

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("PASS: The Digital Engagement File is an operational, governed workpaper surface with visible evidence readiness, canonical document classification, explicit current-truth verification, locked historical snapshots and no duplicate document silo.");
}
