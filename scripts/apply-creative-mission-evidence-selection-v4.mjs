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
    throw new Error(`CREATIVE_EVIDENCE_SELECTION_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function replaceRegexRequired(source, pattern, replacement, marker, path) {
  if (source.includes(marker)) return source;
  if (!pattern.test(source)) {
    throw new Error(`CREATIVE_EVIDENCE_SELECTION_PATTERN_MISSING:${path}:${marker}`);
  }
  return source.replace(pattern, replacement);
}

function patchMissionComposition() {
  const path = "app/api/creative/missions/compose/route.js";
  let source = read(path);
  const marker = "CREATIVE_MISSION_RELEVANT_EVIDENCE_IMPORT_V4";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `import {\n  CreativeAssetGraphRuntime,\n} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";`,
      `import {\n  CreativeAssetGraphRuntime,\n} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";\nimport {\n  CreativeMissionEvidenceSelectionRuntime,\n} from "@/lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime";`,
      path,
      "import-mission-evidence-selector",
    );
  }

  const replacement = `// ${marker}
async function importBusinessEvidence({
  organization_id,
  creative_project_id,
  businessTruth,
  request,
  blueprint,
  supplied_assets = [],
}) {
  const selection = CreativeMissionEvidenceSelectionRuntime.select({
    request,
    blueprint,
    business_truth: businessTruth,
    supplied_assets,
  });

  if (!creative_project_id) {
    return {
      nodes: [],
      selection,
    };
  }

  const nodes = await Promise.all(
    selection.assets.map((asset) =>
      CreativeAssetGraphRuntime.create({
        organization_id,
        creative_project_id,
        creative_asset_id: asset.id,
        type: String(asset.type || "IMAGE").toUpperCase(),
        status: "IMPORTED",
        name: asset.name || "Imported Reference",
        description:
          asset.description ||
          "Mission-matched organization-scoped production reference",
        url: asset.url || asset.thumbnail_url || null,
        lineage: {
          source: "creative_assets",
          provider_id: null,
          capability: "creative.reference.import",
          generation_version: 1,
        },
        intelligence: {
          quality_score: Number(asset.analysis?.quality_score || 0),
          tags: list(asset.tags),
        },
        reuse: {
          reusable: true,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: false,
          human_reviewed: false,
          approved: false,
          notes:
            "Imported as mission-matched production evidence. Rights and reuse approval remain separate gates.",
        },
        metadata: {
          evidence_role: "MISSION_REFERENCE",
          evidence_roles: list(asset.evidence_roles),
          reference_roles: list(asset.reference_roles),
          source_asset_id: asset.id,
          rights_status: "UNVERIFIED",
          evidence_selection_version: selection.version,
          evidence_selection: asset.selection || {},
          arbitrary_organization_asset_fallback: false,
        },
      }),
    ),
  );

  return {
    nodes,
    selection,
  };
}

function invalidDirectorError`;

  source = replaceRegexRequired(
    source,
    /async function importBusinessEvidence\(\{[\s\S]*?\n\}\n\nfunction invalidDirectorError/,
    replacement,
    marker,
    path,
  );

  source = replaceRequired(
    source,
    `    const evidenceNodes = await importBusinessEvidence({\n      organization_id,\n      creative_project_id: evidenceProjectId,\n      businessTruth,\n    });`,
    `    const suppliedEvidenceAssets = [\n      ...list(body.assets),\n      ...list(body.reference_assets),\n      ...list(body.context?.assets),\n      ...list(body.context?.reference_assets),\n    ];\n    const evidenceImport = await importBusinessEvidence({\n      organization_id,\n      creative_project_id: evidenceProjectId,\n      businessTruth,\n      request: creativeRequest,\n      blueprint,\n      supplied_assets: suppliedEvidenceAssets,\n    });`,
    path,
    "select-relevant-evidence",
  );

  source = replaceRequired(
    source,
    `            business_truth_source_manifest: finalBusinessTruth.source_manifest,`,
    `            business_truth_source_manifest: finalBusinessTruth.source_manifest,\n            mission_evidence_selection_version: evidenceImport.selection.version,\n            mission_evidence_selection: evidenceImport.selection.diagnostics,`,
    path,
    "project-evidence-diagnostics",
  );

  const missionMetadataAnchor = `        business_truth_source_manifest: finalBusinessTruth.source_manifest,\n      },\n    });`;
  const missionMetadataReplacement = `        business_truth_source_manifest: finalBusinessTruth.source_manifest,\n        mission_evidence_selection_version: evidenceImport.selection.version,\n        mission_evidence_selection: evidenceImport.selection.diagnostics,\n      },\n    });`;
  const lastAnchor = source.lastIndexOf(missionMetadataAnchor);
  if (!source.includes("mission_evidence_selection_version: evidenceImport.selection.version") ||
      source.indexOf("mission_evidence_selection_version: evidenceImport.selection.version") ===
        source.lastIndexOf("mission_evidence_selection_version: evidenceImport.selection.version")) {
    if (lastAnchor < 0) {
      throw new Error(`CREATIVE_EVIDENCE_SELECTION_PATTERN_MISSING:${path}:mission-evidence-diagnostics`);
    }
    source =
      source.slice(0, lastAnchor) +
      missionMetadataReplacement +
      source.slice(lastAnchor + missionMetadataAnchor.length);
  }

  source = replaceRequired(
    source,
    `        evidence_node_count: evidenceNodes.length,`,
    `        evidence_node_count: evidenceImport.nodes.length,\n        evidence_selection: evidenceImport.selection.diagnostics,`,
    path,
    "response-evidence-diagnostics",
  );

  write(path, source);
}

function patchBusinessTruthApproval() {
  const path = "lib/creative/knowledge/CreativeBusinessTruthRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_UPLOADED_REFERENCE_APPROVAL_V2";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `function uploadedAssetTruth(row = {}) {`,
      `// ${marker}\nfunction uploadedReferenceApproved(row = {}) {\n  return (\n    row.approved_reference === true ||\n    row.approved_for_reuse === true ||\n    row.review?.approved === true ||\n    row.metadata?.approved_reference === true ||\n    row.metadata?.approved_for_reuse === true ||\n    String(row.status || "").toUpperCase() === "APPROVED"\n  );\n}\n\nfunction uploadedAssetTruth(row = {}) {`,
      path,
      "insert-uploaded-reference-approval",
    );
  }

  source = replaceRequired(
    source,
    `    approved_reference: row.archived !== true,`,
    `    approved_reference: uploadedReferenceApproved(row),`,
    path,
    "strict-uploaded-reference-approval",
  );

  write(path, source);
}

patchMissionComposition();
patchBusinessTruthApproval();

console.log("CREATIVE_MISSION_EVIDENCE_SELECTION_V4=APPLIED");
