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
    throw new Error(`CREATIVE_EVIDENCE_V7_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function patchEvidenceDiagnostics() {
  const path = "lib/creative/assets/evidence/runtime/CreativeMissionEvidenceSelectionRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_PRE_SPEND_EVIDENCE_DIAGNOSTICS_V7";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `        requested_roles: context.requested_roles,\n        selected_asset_ids: selected.map((candidate) => candidate.id).filter(Boolean),`,
      `        requested_roles: context.requested_roles,\n        // ${marker}\n        selected_assets: selected.map((candidate) => ({\n          id: candidate.id || null,\n          name: text(\n            candidate.asset.name ||\n            candidate.asset.title ||\n            candidate.asset.file_name ||\n            candidate.asset.filename,\n          ) || null,\n          approval_basis: candidate.approval_basis,\n          score: Number(candidate.score.toFixed(3)),\n          inferred_roles: candidate.roles,\n          matched_roles: candidate.role_overlap,\n          matched_terms: candidate.overlap,\n          identity_terms: candidate.identity_token_overlap,\n          identity_phrase_match: candidate.identity_phrase_match,\n        })),\n        selected_asset_ids: selected.map((candidate) => candidate.id).filter(Boolean),`,
      path,
      "selected-evidence-diagnostics",
    );
  }

  write(path, source);
}

function patchEndToEndSmoke() {
  const path = "scripts/creative-end-to-end-smoke.sh";
  let source = read(path);
  const marker = "CREATIVE_PRE_SPEND_EVIDENCE_GATE_V7";

  source = replaceRequired(
    source,
    `ARTIFACT_DIR="\${CREATIVE_TEST_ARTIFACT_DIR:-$(dirname "$REPORT")/creative-smoke-evidence}"\nmkdir -p "$ARTIFACT_DIR"`,
    `ARTIFACT_DIR="\${CREATIVE_TEST_ARTIFACT_DIR:-$(dirname "$REPORT")/creative-smoke-evidence}"\nREQUIRE_EVIDENCE="\${CREATIVE_TEST_REQUIRE_EVIDENCE:-false}"\nREQUIRED_EVIDENCE_ROLES="\${CREATIVE_TEST_REQUIRED_EVIDENCE_ROLES:-}"\nmkdir -p "$ARTIFACT_DIR"`,
    path,
    "pre-spend-environment",
  );

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `[ -n "$MISSION_ID" ] || fail "compose response missing mission id"\n[ -n "$PROJECT_ID" ] || {\n  jq '{deliverables:.blueprint.deliverables,projects:.projects}' "$COMPOSE_BODY"\n  write_failure_summary "PROJECT_SELECTION" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n  fail "compose response missing requested $PROJECT_TYPE project"\n}\n\nprintf 'Creative smoke: start project %s\\n' "$PROJECT_ID"`,
      `[ -n "$MISSION_ID" ] || fail "compose response missing mission id"\n[ -n "$PROJECT_ID" ] || {\n  jq '{deliverables:.blueprint.deliverables,projects:.projects}' "$COMPOSE_BODY"\n  write_failure_summary "PROJECT_SELECTION" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n  fail "compose response missing requested $PROJECT_TYPE project"\n}\n\n# ${marker}\nEVIDENCE_SELECTION="$ARTIFACT_DIR/evidence-selection.json"\njq '.business_truth.evidence_selection // {}' "$COMPOSE_BODY" > "$EVIDENCE_SELECTION"\nSELECTED_EVIDENCE_COUNT="$(jq -r '.selected_count // 0' "$EVIDENCE_SELECTION")"\nARBITRARY_EVIDENCE_FALLBACK="$(jq -r '.arbitrary_fallback_allowed // true' "$EVIDENCE_SELECTION")"\nSELECTED_EVIDENCE_DIAGNOSTIC_COUNT="$(jq -r '[.selected_assets[]?] | length' "$EVIDENCE_SELECTION")"\nINVALID_EVIDENCE_BASIS_COUNT="$(jq -r '[\n  .selected_assets[]?\n  | select(\n      (.id // "") == "" or\n      ((.approval_basis // "") | IN(\n        "EXPLICIT_REQUEST_ASSET",\n        "APPROVED_REFERENCE",\n        "STRONG_MISSION_MATCHED_ORGANIZATION_UPLOAD"\n      ) | not)\n    )\n] | length' "$EVIDENCE_SELECTION")"\n\nprintf 'Creative smoke: evidence selected=%s arbitrary_fallback=%s\\n' \\
  "$SELECTED_EVIDENCE_COUNT" \\
  "$ARBITRARY_EVIDENCE_FALLBACK"\njq '{\n  selected_count,\n  explicitly_selected_count,\n  approved_reference_count,\n  mission_authorized_upload_count,\n  requested_roles,\n  selected_assets,\n  rejected_irrelevant_count,\n  arbitrary_fallback_allowed\n}' "$EVIDENCE_SELECTION"\n\nif [ "$(printf '%s' "$REQUIRE_EVIDENCE" | tr '[:upper:]' '[:lower:]')" = "true" ]; then\n  [ "$SELECTED_EVIDENCE_COUNT" -gt 0 ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_EMPTY" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence selection returned zero assets"\n  }\n  [ "$ARBITRARY_EVIDENCE_FALLBACK" = "false" ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_ARBITRARY" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence selection allowed arbitrary fallback"\n  }\n  [ "$SELECTED_EVIDENCE_DIAGNOSTIC_COUNT" -eq "$SELECTED_EVIDENCE_COUNT" ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_DIAGNOSTICS" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence diagnostics do not describe every selected asset"\n  }\n  [ "$INVALID_EVIDENCE_BASIS_COUNT" -eq 0 ] || {\n    write_failure_summary "PRE_SPEND_EVIDENCE_AUTHORIZATION" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n    fail "pre-spend evidence contains an asset without a valid mission authorization basis"\n  }\n\n  OLD_IFS="$IFS"\n  IFS=','\n  for role in $REQUIRED_EVIDENCE_ROLES; do\n    role="$(printf '%s' "$role" | tr '[:lower:]' '[:upper:]' | xargs)"\n    [ -n "$role" ] || continue\n    ROLE_COUNT="$(jq -r --arg role "$role" '[\n      .selected_assets[]?\n      | select(\n          ((.inferred_roles // []) | index($role)) != null or\n          ((.matched_roles // []) | index($role)) != null\n        )\n    ] | length' "$EVIDENCE_SELECTION")"\n    if [ "$ROLE_COUNT" -eq 0 ]; then\n      IFS="$OLD_IFS"\n      write_failure_summary "PRE_SPEND_EVIDENCE_ROLE_$role" "$COMPOSE_STATUS" "$COMPOSE_BODY"\n      fail "pre-spend evidence is missing required neutral role $role"\n    fi\n  done\n  IFS="$OLD_IFS"\nfi\n\nprintf 'Creative smoke: pre-spend evidence gate passed\\n'\n\nprintf 'Creative smoke: start project %s\\n' "$PROJECT_ID"`,
      path,
      "pre-spend-evidence-gate",
    );
  }

  write(path, source);
}

function patchLocalLauncher() {
  const path = "scripts/creative-live-smoke-local.sh";
  let source = read(path);
  const marker = "CREATIVE_LIVE_SMOKE_REQUIRED_EVIDENCE_ROLES_V7";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `export CREATIVE_TEST_MEDIUM="FILM"\nexport CREATIVE_TEST_MAX_POLLS="120"`,
      `export CREATIVE_TEST_MEDIUM="FILM"\n# ${marker}\nexport CREATIVE_TEST_REQUIRE_EVIDENCE="true"\nexport CREATIVE_TEST_REQUIRED_EVIDENCE_ROLES="LOCATION,IDENTITY,WARDROBE,BRAND"\nexport CREATIVE_TEST_MAX_POLLS="120"`,
      path,
      "live-smoke-required-evidence",
    );
  }

  write(path, source);
}

patchEvidenceDiagnostics();
patchEndToEndSmoke();
patchLocalLauncher();

console.log("CREATIVE_PRE_SPEND_EVIDENCE_GATE_V7=APPLIED");
