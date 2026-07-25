#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(source, search, replacement, path, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`CREATIVE_EVIDENCE_V6_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function patchBusinessTruth() {
  const path = "lib/creative/knowledge/CreativeBusinessTruthRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_ORGANIZATION_UPLOAD_SCOPE_V3";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "function uploadedAssetTruth(row = {}) {",
      `// ${marker}\nfunction uploadedAssetTruth(row = {}) {`,
      path,
      "mark-upload-scope",
    );
  }

  source = replaceRequired(
    source,
    `    type: compact(row.asset_type, 100),\n    description: compact(row.description, 500),`,
    `    type: compact(row.asset_type, 100),\n    status: compact(row.status, 80),\n    archived: row.archived === true,\n    source_scope: "ORGANIZATION_UPLOAD",\n    organization_owned: true,\n    description: compact(row.description, 500),`,
    path,
    "preserve-upload-scope-fields",
  );

  source = replaceRequired(
    source,
    `    tags: strings(row.tags, 30),\n    analysis: cleanObject({`,
    `    tags: strings(row.tags, 30),\n    labels: strings(row.labels, 30),\n    reference_roles: strings(\n      row.reference_roles || row.metadata?.reference_roles,\n      20,\n    ),\n    evidence_roles: strings(\n      row.evidence_roles || row.metadata?.evidence_roles,\n      20,\n    ),\n    analysis: cleanObject({`,
    path,
    "preserve-upload-intelligence-fields",
  );

  source = replaceRequired(
    source,
    `      objects: strings(row.analysis?.objects, 30),\n      colors: strings(row.analysis?.colors, 20),`,
    `      objects: strings(row.analysis?.objects, 30),\n      tags: strings(row.analysis?.tags, 30),\n      labels: strings(row.analysis?.labels, 30),\n      people: strings(row.analysis?.people, 30),\n      text: compact(row.analysis?.text, 500),\n      classification: compact(row.analysis?.classification, 200),\n      colors: strings(row.analysis?.colors, 20),`,
    path,
    "preserve-upload-analysis-fields",
  );

  write(path, source);
}

function patchMissionSelector() {
  const path = "lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_STRONG_RELEVANCE_MISSION_AUTHORIZATION_V6";

  source = replaceRequired(
    source,
    `  if (asset.metadata?.approved_for_reuse === true) return true;\n  return ["APPROVED", "ACTIVE", "READY"].includes(\n    text(asset.status).toUpperCase(),\n  );`,
    `  if (asset.metadata?.approved_for_reuse === true) return true;\n  return text(asset.status).toUpperCase() === "APPROVED";`,
    path,
    "separate-approval-from-active-status",
  );

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "function scoreCandidate(asset, context, explicit = false) {",
      `// ${marker}\nfunction organizationOwnedUpload(asset = {}) {\n  return Boolean(\n    asset.organization_owned === true ||\n    text(asset.source_scope).toUpperCase() === "ORGANIZATION_UPLOAD"\n  ) && asset.archived !== true;\n}\n\nfunction scoreCandidate(asset, context, explicit = false) {`,
      path,
      "insert-mission-authorization-contract",
    );
  }

  source = replaceRequired(
    source,
    `  const approved = approval(asset, explicit);\n  const quality = Number(`,
    `  const approved = approval(asset, explicit);\n  const strongRelevance = Boolean(\n    identityPhraseMatch ||\n    identityTokenOverlap.length >= 2 ||\n    overlap.length >= 4 ||\n    (overlap.length >= 2 && roleOverlap.length >= 1)\n  );\n  const missionAuthorized = Boolean(\n    !explicit &&\n    !approved &&\n    organizationOwnedUpload(asset) &&\n    strongRelevance\n  );\n  const quality = Number(`,
    path,
    "derive-strong-relevance-authorization",
  );

  source = replaceRequired(
    source,
    `    approved,\n    relevant,\n    score,`,
    `    approved,\n    mission_authorized: missionAuthorized,\n    approval_basis: explicit\n      ? "EXPLICIT_REQUEST_ASSET"\n      : approved\n        ? "APPROVED_REFERENCE"\n        : missionAuthorized\n          ? "STRONG_MISSION_MATCHED_ORGANIZATION_UPLOAD"\n          : null,\n    relevant,\n    score,`,
    path,
    "return-mission-authorization",
  );

  source = replaceRequired(
    source,
    `function mergeCandidates(supplied_assets, uploaded_assets) {\n  const values = [\n    ...list(supplied_assets).map((asset) => ({ asset, explicit: true })),\n    ...list(uploaded_assets).map((asset) => ({ asset, explicit: false })),\n  ];`,
    `function mergeCandidates(\n  supplied_assets,\n  uploaded_assets,\n  approved_reusable_assets,\n) {\n  const values = [\n    ...list(supplied_assets).map((asset) => ({ asset, explicit: true })),\n    ...list(uploaded_assets).map((asset) => ({ asset, explicit: false })),\n    ...list(approved_reusable_assets).map((asset) => ({\n      asset: {\n        ...asset,\n        approved_reference: asset.approved_for_reuse === true,\n      },\n      explicit: false,\n    })),\n  ];`,
    path,
    "include-approved-reusable-evidence",
  );

  source = replaceRequired(
    source,
    `    const merged = mergeCandidates(\n      supplied_assets,\n      business_truth?.assets?.uploaded_references,\n    );`,
    `    const merged = mergeCandidates(\n      supplied_assets,\n      business_truth?.assets?.uploaded_references,\n      business_truth?.assets?.approved_reusable,\n    );`,
    path,
    "pass-approved-reusable-evidence",
  );

  source = replaceRequired(
    source,
    `        (candidate.explicit || candidate.approved),`,
    `        (\n          candidate.explicit ||\n          candidate.approved ||\n          candidate.mission_authorized\n        ),`,
    path,
    "admit-strong-mission-matches",
  );

  source = replaceRequired(
    source,
    `        approved_reference: candidate.approved,\n        selection: {`,
    `        approved_reference: candidate.approved,\n        mission_authorized: candidate.mission_authorized,\n        approval_basis: candidate.approval_basis,\n        selection: {`,
    path,
    "persist-mission-authorization",
  );

  source = replaceRequired(
    source,
    `          explicit: candidate.explicit,\n          score: Number(candidate.score.toFixed(3)),`,
    `          explicit: candidate.explicit,\n          approved_reference: candidate.approved,\n          mission_authorized: candidate.mission_authorized,\n          approval_basis: candidate.approval_basis,\n          score: Number(candidate.score.toFixed(3)),`,
    path,
    "persist-selection-basis",
  );

  source = replaceRequired(
    source,
    `        selected_count: selected.length,\n        requested_roles: context.requested_roles,`,
    `        selected_count: selected.length,\n        explicitly_selected_count: selected.filter((candidate) =>\n          candidate.explicit\n        ).length,\n        approved_reference_count: selected.filter((candidate) =>\n          candidate.approved\n        ).length,\n        mission_authorized_upload_count: selected.filter((candidate) =>\n          candidate.mission_authorized\n        ).length,\n        requested_roles: context.requested_roles,`,
    path,
    "selection-authorization-diagnostics",
  );

  write(path, source);
}

function patchCorrectionAttempts() {
  const path = "lib/operations/tasks/runtime/ProductionTaskRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_QUALITY_REVISION_ATTEMPT_BUDGET_V6";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `  const maximum = Number(task.metadata?.max_quality_revisions || 3);\n  if (cycle > maximum) return null;`,
      `  // ${marker}\n  const maximum = Number(task.metadata?.max_quality_revisions || 3);\n  const requiredAttempts = Math.max(2, maximum + 1);\n  if (cycle > maximum) return null;`,
      path,
      "derive-revision-attempt-budget",
    );
  }

  source = replaceRequired(
    source,
    `        quality_revision_cycle: cycle,\n        correction_instructions: corrections,\n        provider_status: "WAITING_FOR_QUALITY_CORRECTION",`,
    `        quality_revision_cycle: cycle,\n        max_quality_revisions: maximum,\n        max_attempts: Math.max(\n          Number(dependency.metadata?.max_attempts || 0),\n          requiredAttempts,\n        ),\n        correction_instructions: corrections,\n        provider_status: "WAITING_FOR_QUALITY_CORRECTION",`,
    path,
    "extend-generation-attempt-budget",
  );

  source = replaceRequired(
    source,
    `        quality_revision_cycle: cycle,\n        correction_instructions: corrections,\n        provider_status: "WAITING_FOR_CORRECTED_DEPENDENCY",`,
    `        quality_revision_cycle: cycle,\n        max_quality_revisions: maximum,\n        max_attempts: Math.max(\n          Number(task.metadata?.max_attempts || 0),\n          requiredAttempts,\n        ),\n        correction_instructions: corrections,\n        provider_status: "WAITING_FOR_CORRECTED_DEPENDENCY",`,
    path,
    "extend-qa-attempt-budget",
  );

  write(path, source);
}

patchBusinessTruth();
patchMissionSelector();
patchCorrectionAttempts();

console.log("CREATIVE_EVIDENCE_SELECTION_RETRY_V6=APPLIED");
