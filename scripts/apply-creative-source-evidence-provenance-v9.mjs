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
    throw new Error(`CREATIVE_EVIDENCE_V9_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function patchBusinessTruth() {
  const path = "lib/creative/knowledge/CreativeBusinessTruthRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_ASSET_PROVENANCE_CLASSIFICATION_V9";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `// CREATIVE_ORGANIZATION_UPLOAD_SCOPE_V3\nfunction uploadedAssetTruth(row = {}) {\n  const url = first(row.file_url, row.image_url, row.thumbnail_url);`,
      `// CREATIVE_ORGANIZATION_UPLOAD_SCOPE_V3\n// ${marker}\nfunction creativeAssetSourceMetadata(row = {}) {\n  return row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)\n    ? row.metadata\n    : {};\n}\n\nfunction creativeAssetSourceKind(row = {}) {\n  const metadata = creativeAssetSourceMetadata(row);\n  const source = String(first(\n    metadata.source_kind,\n    metadata.source_type,\n    metadata.origin,\n    metadata.source,\n  ) || "").trim().toUpperCase();\n  const explicitUpload = Boolean(\n    row.uploaded_by ||\n    metadata.uploaded_by ||\n    metadata.original_file_name ||\n    /(?:^|_)(?:USER|MANUAL|ORGANIZATION|ASSET)?_?UPLOAD(?:$|_)/.test(source) ||\n    source === "INTAKE"\n  );\n  const generated = Boolean(\n    row.ai_generated === true ||\n    row.provider ||\n    row.engine ||\n    row.prompt ||\n    metadata.production_task_id ||\n    metadata.source_task_id ||\n    metadata.provider ||\n    metadata.model ||\n    metadata.generation_id ||\n    metadata.generation_version ||\n    /(?:^|_)(?:AI_)?GENERATED(?:$|_)|(?:^|_)PRODUCTION_TASK(?:$|_)|(?:^|_)DERIVED(?:$|_)|(?:^|_)RENDER(?:$|_)/.test(source) ||\n    (!explicitUpload && Boolean(\n      row.creative_mission_id ||\n      metadata.creative_project_id ||\n      metadata.source_campaign_id\n    ))\n  );\n\n  return generated ? "GENERATED_OUTPUT" : "USER_UPLOAD";\n}\n\nfunction uploadedAssetTruth(row = {}) {\n  const url = first(row.file_url, row.image_url, row.thumbnail_url);\n  const metadata = creativeAssetSourceMetadata(row);\n  const sourceKind = creativeAssetSourceKind(row);`,
      path,
      "insert-provenance-classification",
    );

    source = replaceRequired(
      source,
      `    type: compact(row.asset_type, 100),\n    status: compact(row.status, 80),\n    archived: row.archived === true,\n    source_scope: "ORGANIZATION_UPLOAD",\n    organization_owned: true,`,
      `    type: compact(row.asset_type, 100),\n    ai_suggested_type: compact(row.ai_suggested_type, 100),\n    status: compact(row.status, 80),\n    archived: row.archived === true,\n    source_kind: sourceKind,\n    source_scope: sourceKind === "USER_UPLOAD"\n      ? "ORGANIZATION_UPLOAD"\n      : "CREATIVE_OUTPUT",\n    original_upload: sourceKind === "USER_UPLOAD",\n    organization_owned: true,\n    ai_generated: row.ai_generated === true,\n    provider: compact(row.provider, 120),\n    engine: compact(row.engine, 120),\n    creative_mission_id: row.creative_mission_id || null,`,
      path,
      "preserve-provenance-fields",
    );

    source = replaceRequired(
      source,
      `      people: strings(row.analysis?.people, 30),\n      text: compact(row.analysis?.text, 500),\n      classification: compact(row.analysis?.classification, 200),`,
      `      people: strings(row.analysis?.people, 30),\n      identity: row.analysis?.identity || null,\n      wardrobe: compact(first(\n        row.analysis?.wardrobe,\n        row.analysis?.clothing,\n        row.analysis?.attire,\n      ), 500),\n      text: compact(row.analysis?.text, 500),\n      classification: compact(row.analysis?.classification, 200),`,
      path,
      "preserve-identity-wardrobe-analysis",
    );

    source = replaceRequired(
      source,
      `    approved_reference: uploadedReferenceApproved(row),\n    created_at: row.created_at || null,`,
      `    approved_reference: uploadedReferenceApproved(row),\n    metadata: cleanObject({\n      source: compact(metadata.source, 120),\n      source_kind: compact(metadata.source_kind, 120),\n      source_type: compact(metadata.source_type, 120),\n      origin: compact(metadata.origin, 120),\n      uploaded_by: metadata.uploaded_by || null,\n      creative_project_id: metadata.creative_project_id || null,\n      source_campaign_id: metadata.source_campaign_id || null,\n      production_task_id: metadata.production_task_id || null,\n      source_task_id: metadata.source_task_id || null,\n    }),\n    created_at: row.created_at || null,`,
      path,
      "preserve-source-metadata",
    );
  }

  write(path, source);
}

function patchSelector() {
  const path = "lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_SOURCE_ONLY_MISSION_EVIDENCE_V9";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `const MAXIMUM_SELECTED_ASSETS = 16;`,
      `const MAXIMUM_SELECTED_ASSETS = 16;\n\n// ${marker}`,
      path,
      "selector-marker",
    );

    source = replaceRequired(
      source,
      `  "about",\n  "after",`,
      `  "about",\n  "and",\n  "are",\n  "for",\n  "the",\n  "was",\n  "were",\n  "will",\n  "after",`,
      path,
      "neutral-stop-words",
    );

    source = replaceRequired(
      source,
      `  LOCATION: /\\b(location|place|site|space|entrance|exterior|interior|architecture|structure|facade|doorway|room|street|environment|scene plate|source plate)\\b/i,\n  IDENTITY: /\\b(identity|person|portrait|individual|group|team|subject|talent|cast|character|people|human)\\b/i,`,
      `  LOCATION: /\\b(location|place|site|space|venue|premises|building|storefront|entrance|exterior|interior|architecture|structure|facade|doorway|room|street|environment|scene plate|source plate)\\b/i,\n  IDENTITY: /\\b(identity|person|portrait|individual|group|team|staff|employee|personnel|workforce|subject|talent|cast|character|people|human|face|headshot)\\b/i,`,
      path,
      "neutral-role-patterns",
    );

    source = replaceRequired(
      source,
      `  return [\n    asset.name,`,
      `  return [\n    asset.type,\n    asset.asset_type,\n    asset.ai_suggested_type,\n    asset.source_kind,\n    asset.name,`,
      path,
      "asset-type-search-text",
    );

    source = replaceRequired(
      source,
      `    asset.analysis?.classification,\n    ...list(asset.analysis?.objects),`,
      `    asset.analysis?.classification,\n    asset.analysis?.identity,\n    asset.analysis?.wardrobe,\n    asset.analysis?.text,\n    ...list(asset.analysis?.people),\n    ...list(asset.analysis?.objects),`,
      path,
      "asset-analysis-search-text",
    );

    source = replaceRequired(
      source,
      `function missionContext({ request, blueprint, business_truth }) {`,
      `function missionContext({\n  request,\n  blueprint,\n  business_truth,\n  required_roles = [],\n}) {`,
      path,
      "mission-required-roles-signature",
    );

    source = replaceRequired(
      source,
      `  const identityTokens = new Set(identityPhrases.flatMap(words));\n  const source = [`,
      `  const identityTokens = new Set(identityPhrases.flatMap(words));\n  const requiredRoles = unique(list(required_roles))\n    .map((role) => role.toUpperCase())\n    .filter((role) => Object.hasOwn(ROLE_PATTERNS, role));\n  const source = [`,
      path,
      "mission-required-role-normalization",
    );

    source = replaceRequired(
      source,
      `    requested_roles: inferRoles(source),\n    identity_phrases:`,
      `    required_roles: requiredRoles,\n    requested_roles: unique([\n      ...requiredRoles,\n      ...inferRoles(source),\n    ]),\n    identity_phrases:`,
      path,
      "mission-required-role-context",
    );

    source = replaceRequired(
      source,
      `function organizationOwnedUpload(asset = {}) {\n  return Boolean(\n    asset.organization_owned === true ||\n    text(asset.source_scope).toUpperCase() === "ORGANIZATION_UPLOAD"\n  ) && asset.archived !== true;\n}\n\nfunction scoreCandidate`,
      `function organizationOwnedUpload(asset = {}) {\n  const sourceKind = text(asset.source_kind).toUpperCase();\n  const sourceScope = text(asset.source_scope).toUpperCase();\n  const metadata = asset.metadata || {};\n  const sourceUpload = Boolean(\n    asset.original_upload === true ||\n    sourceKind === "USER_UPLOAD" ||\n    sourceScope === "ORGANIZATION_UPLOAD"\n  );\n  const derived = Boolean(\n    asset.ai_generated === true ||\n    sourceKind === "GENERATED_OUTPUT" ||\n    sourceScope === "CREATIVE_OUTPUT" ||\n    asset.provider ||\n    asset.engine ||\n    metadata.production_task_id ||\n    metadata.source_task_id\n  );\n\n  return Boolean(\n    asset.organization_owned === true &&\n    sourceUpload &&\n    !derived &&\n    asset.archived !== true\n  );\n}\n\nfunction isVisualReference(asset = {}) {\n  const category = text(\n    asset.type ||\n    asset.asset_type ||\n    asset.ai_suggested_type,\n  ).toLowerCase();\n  return Boolean(assetUrl(asset)) &&\n    !/\\b(audio|voice|music|sfx|caption|copy|text|document)\\b/.test(category);\n}\n\nfunction candidateRoles(asset = {}, searchable = "") {\n  const roles = unique([\n    ...list(asset.reference_roles),\n    ...list(asset.evidence_roles),\n    ...list(asset.metadata?.reference_roles),\n    ...list(asset.metadata?.evidence_roles),\n    ...inferRoles([\n      asset.type,\n      asset.asset_type,\n      asset.ai_suggested_type,\n      searchable,\n    ].map(objectText).join(" ")),\n  ]).map((role) => role.toUpperCase());\n\n  if (isVisualReference(asset) && roles.includes("IDENTITY")) {\n    roles.push("WARDROBE");\n  }\n\n  return unique(roles);\n}\n\nfunction scoreCandidate`,
      path,
      "source-upload-and-role-classification",
    );

    source = replaceRequired(
      source,
      `  const roles = unique([\n    ...list(asset.reference_roles),\n    ...list(asset.evidence_roles),\n    ...inferRoles(searchable),\n  ]).map((role) => role.toUpperCase());`,
      `  const roles = candidateRoles(asset, searchable);`,
      path,
      "candidate-role-resolution",
    );

    source = replaceRequired(
      source,
      `  const strongRelevance = Boolean(\n    identityPhraseMatch ||\n    identityTokenOverlap.length >= 2 ||\n    overlap.length >= 4 ||\n    (overlap.length >= 2 && roleOverlap.length >= 1)\n  );`,
      `  const strongRelevance = Boolean(\n    roleOverlap.length >= 1 &&\n    (\n      identityPhraseMatch ||\n      identityTokenOverlap.length >= 1 ||\n      overlap.length >= 1 ||\n      roles.length >= 1\n    )\n  );`,
      path,
      "role-bound-strong-relevance",
    );

    source = replaceRequired(
      source,
      `  const relevant = Boolean(\n    explicit ||\n    identityPhraseMatch ||\n    identityTokenOverlap.length >= 2 ||\n    overlap.length >= 3 ||\n    (overlap.length >= 2 && roleOverlap.length >= 1) ||\n    (asset.favorite === true && overlap.length >= 1 && roleOverlap.length >= 1),\n  );`,
      `  const relevant = Boolean(\n    explicit ||\n    missionAuthorized ||\n    (\n      approved &&\n      (\n        roleOverlap.length >= 1 ||\n        identityPhraseMatch ||\n        identityTokenOverlap.length >= 1 ||\n        overlap.length >= 2\n      )\n    )\n  );`,
      path,
      "source-bound-relevance",
    );

    source = replaceRequired(
      source,
      `          ? "STRONG_MISSION_MATCHED_ORGANIZATION_UPLOAD"`,
      `          ? "MISSION_ROLE_MATCHED_ORGANIZATION_UPLOAD"`,
      path,
      "source-role-authorization-basis",
    );

    source = replaceRequired(
      source,
      `    (approved ? 8 : 0) +\n    (asset.favorite === true ? 6 : 0) +`,
      `    (approved ? 24 : 0) +\n    (missionAuthorized ? 36 : 0) +\n    (asset.favorite === true ? 6 : 0) +`,
      path,
      "source-role-score",
    );

    source = replaceRequired(
      source,
      `    role_overlap: roleOverlap,\n  };`,
      `    role_overlap: roleOverlap,\n    source_kind: text(asset.source_kind).toUpperCase() || null,\n    original_upload: asset.original_upload === true,\n    ai_generated: asset.ai_generated === true,\n  };`,
      path,
      "candidate-provenance-diagnostics",
    );

    source = source.replaceAll(
      `const key = id || url;`,
      `const key = url || id;`,
    );
    source = source.replaceAll(
      `const key = candidate.id || candidate.url;`,
      `const key = candidate.url || candidate.id;`,
    );

    source = replaceRequired(
      source,
      `function diversify(scored, maximum) {\n  const selected = [];`,
      `function diversify(scored, maximum, preferredRoles = []) {\n  const selected = [];`,
      path,
      "preferred-role-diversification-signature",
    );

    source = replaceRequired(
      source,
      `  for (const role of Object.keys(ROLE_PATTERNS)) {`,
      `  const roleOrder = unique([\n    ...preferredRoles,\n    ...Object.keys(ROLE_PATTERNS),\n  ]);\n\n  for (const role of roleOrder) {`,
      path,
      "preferred-role-diversification-order",
    );

    source = replaceRequired(
      source,
      `    supplied_assets = [],\n    maximum = MAXIMUM_SELECTED_ASSETS,`,
      `    supplied_assets = [],\n    required_roles = [],\n    maximum = MAXIMUM_SELECTED_ASSETS,`,
      path,
      "selector-required-roles-signature",
    );

    source = replaceRequired(
      source,
      `    const context = missionContext({ request, blueprint, business_truth });`,
      `    const context = missionContext({\n      request,\n      blueprint,\n      business_truth,\n      required_roles,\n    });`,
      path,
      "selector-required-role-context",
    );

    source = replaceRequired(
      source,
      `    const scored = merged\n      .map(({ asset, explicit }) => scoreCandidate(asset, context, explicit))\n      .filter((candidate) =>`,
      `    const allScored = merged\n      .map(({ asset, explicit }) => scoreCandidate(asset, context, explicit));\n    const scored = allScored\n      .filter((candidate) =>`,
      path,
      "all-candidate-provenance-accounting",
    );

    source = replaceRequired(
      source,
      `      Math.max(1, Math.min(32, Number(maximum || MAXIMUM_SELECTED_ASSETS))),\n    );`,
      `      Math.max(1, Math.min(32, Number(maximum || MAXIMUM_SELECTED_ASSETS))),\n      context.required_roles,\n    );`,
      path,
      "prioritize-required-roles",
    );

    source = source.replaceAll(
      "CREATIVE_MISSION_EVIDENCE_SELECTION_V4",
      "CREATIVE_MISSION_EVIDENCE_SELECTION_V9",
    );

    source = replaceRequired(
      source,
      `        requested_roles: context.requested_roles,\n        // CREATIVE_PRE_SPEND_EVIDENCE_DIAGNOSTICS_V7`,
      `        required_roles: context.required_roles,\n        requested_roles: context.requested_roles,\n        excluded_generated_output_count: allScored.filter((candidate) =>\n          candidate.source_kind === "GENERATED_OUTPUT" &&\n          !candidate.explicit &&\n          !candidate.approved\n        ).length,\n        // CREATIVE_PRE_SPEND_EVIDENCE_DIAGNOSTICS_V7`,
      path,
      "selector-provenance-summary",
    );

    source = replaceRequired(
      source,
      `          identity_phrase_match: candidate.identity_phrase_match,\n        })),`,
      `          identity_phrase_match: candidate.identity_phrase_match,\n          source_kind: candidate.source_kind,\n          original_upload: candidate.original_upload,\n          ai_generated: candidate.ai_generated,\n        })),`,
      path,
      "selected-source-diagnostics",
    );
  }

  write(path, source);
}

function patchMissionRoute() {
  const path = "app/api/creative/missions/compose/route.js";
  let source = read(path);
  const marker = "CREATIVE_REQUIRED_EVIDENCE_ROLE_HANDOFF_V9";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `  supplied_assets = [],\n}) {\n  const selection = CreativeMissionEvidenceSelectionRuntime.select({`,
      `  supplied_assets = [],\n  required_evidence_roles = [],\n}) {\n  const selection = CreativeMissionEvidenceSelectionRuntime.select({`,
      path,
      "route-required-role-signature",
    );

    source = replaceRequired(
      source,
      `    business_truth: businessTruth,\n    supplied_assets,\n  });`,
      `    business_truth: businessTruth,\n    supplied_assets,\n    // ${marker}\n    required_roles: required_evidence_roles,\n  });`,
      path,
      "route-required-role-selection",
    );

    source = replaceRequired(
      source,
      `      supplied_assets: suppliedEvidenceAssets,\n    });`,
      `      supplied_assets: suppliedEvidenceAssets,\n      required_evidence_roles: list(\n        body.context?.required_evidence_roles,\n      ),\n    });`,
      path,
      "route-required-role-handoff",
    );
  }

  write(path, source);
}

function patchSmoke() {
  const path = "scripts/creative-end-to-end-smoke.sh";
  let source = read(path);
  const marker = "CREATIVE_PRE_SPEND_BOOLEAN_AND_PROVENANCE_V9";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `    --arg medium "$MEDIUM" \\\n    '{organization_id:$organization_id,request:$request,context:{smoke_test:true,requested_medium:$medium}}' \\\n`,
      `    --arg medium "$MEDIUM" \\\n    --arg required_evidence_roles "$REQUIRED_EVIDENCE_ROLES" \\\n    '{\n      organization_id:$organization_id,\n      request:$request,\n      context:{\n        smoke_test:true,\n        requested_medium:$medium,\n        required_evidence_roles:(\n          $required_evidence_roles\n          | split(",")\n          | map(gsub("^\\\\s+|\\\\s+$"; "") | ascii_upcase)\n          | map(select(length > 0))\n        )\n      }\n    }' \\\n`,
      path,
      "smoke-required-role-compose-context",
    );

    source = replaceRequired(
      source,
      `ARBITRARY_EVIDENCE_FALLBACK="$(jq -r '.arbitrary_fallback_allowed // true' "$EVIDENCE_SELECTION")"`,
      `# ${marker}\nARBITRARY_EVIDENCE_FALLBACK="$(jq -r '\n  if type == "object" and has("arbitrary_fallback_allowed")\n  then (.arbitrary_fallback_allowed | tostring)\n  else "true"\n  end\n' "$EVIDENCE_SELECTION")"`,
      path,
      "jq-false-preservation",
    );

    source = replaceRequired(
      source,
      `        "APPROVED_REFERENCE",\n        "STRONG_MISSION_MATCHED_ORGANIZATION_UPLOAD"`,
      `        "APPROVED_REFERENCE",\n        "MISSION_ROLE_MATCHED_ORGANIZATION_UPLOAD"`,
      path,
      "valid-v9-authorization-basis",
    );

    source = replaceRequired(
      source,
      `] | length' "$EVIDENCE_SELECTION")"\n\nprintf 'Creative smoke: evidence selected=%s arbitrary_fallback=%s\\n'`,
      `] | length' "$EVIDENCE_SELECTION")"\nINVALID_MISSION_SOURCE_COUNT="$(jq -r '[\n  .selected_assets[]?\n  | select(\n      (.approval_basis // "") == "MISSION_ROLE_MATCHED_ORGANIZATION_UPLOAD" and\n      (\n        (.source_kind // "") != "USER_UPLOAD" or\n        (.original_upload // false) != true or\n        (.ai_generated // false) == true\n      )\n    )\n] | length' "$EVIDENCE_SELECTION")"\n\nprintf 'Creative smoke: evidence selected=%s arbitrary_fallback=%s\\n'`,
      path,
      "source-provenance-preflight-count",
    );

    source = replaceRequired(
      source,
      `  requested_roles,\n  selected_assets,`,
      `  required_roles,\n  requested_roles,\n  excluded_generated_output_count,\n  selected_assets,`,
      path,
      "display-v9-diagnostics",
    );

    source = replaceRequired(
      source,
      `  [ "$INVALID_EVIDENCE_BASIS_COUNT" -eq 0 ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_AUTHORIZATION" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence contains an asset without a valid mission authorization basis"\n  }\n\n  OLD_IFS=`,
      `  [ "$INVALID_EVIDENCE_BASIS_COUNT" -eq 0 ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_AUTHORIZATION" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence contains an asset without a valid mission authorization basis"\n  }\n  [ "$INVALID_MISSION_SOURCE_COUNT" -eq 0 ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_PROVENANCE" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence mission-authorized a generated or derived output"\n  }\n\n  OLD_IFS=`,
      path,
      "fail-closed-source-provenance",
    );
  }

  write(path, source);
}

patchBusinessTruth();
patchSelector();
patchMissionRoute();
patchSmoke();

console.log("CREATIVE_SOURCE_EVIDENCE_PROVENANCE_V9=APPLIED");
