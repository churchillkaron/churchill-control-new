#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count === 0) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  if (count > 1) throw new Error(`PATCH_TARGET_AMBIGUOUS:${label}:${count}`);
  return source.replace(search, replacement);
}

function patchFile(file, transform) {
  const absolute = path.resolve(process.cwd(), file);
  const before = fs.readFileSync(absolute, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`PATCH_NO_CHANGE:${file}`);
  fs.writeFileSync(absolute, after);
  console.log(`PATCHED=${file}`);
}

patchFile(
  "lib/creative/director/validation/CreativeShotReferenceContractValidator.js",
  (source) => replaceOnce(
    source,
`function sourceRequired(shot = {}, references = []) {
  const medium = text(shot.medium).toUpperCase().replaceAll("_", "-");
  return Boolean(
    references.length ||
    medium === "LIVE-ASSET" ||
    medium === "ASSET-LED-MOTION" ||
    shot.source_required === true ||
    shot.generation?.source_required === true
  );
}`,
`function sourceRequired(shot = {}, references = []) {
  const medium = text(shot.medium).toUpperCase().replaceAll("_", "-");
  const visualReferenceRoles = new Set([
    "PRIMARY_SOURCE",
    "IDENTITY_REFERENCE",
    "LOCATION_REFERENCE",
    "CONTINUITY_REFERENCE",
    "PRODUCT_REFERENCE",
    "STYLE_REFERENCE",
    "SUBJECT_REFERENCE",
  ]);
  const visualReferences = list(references).filter((reference) =>
    visualReferenceRoles.has(text(reference?.role).toUpperCase()),
  );
  return Boolean(
    visualReferences.length ||
    medium === "LIVE-ASSET" ||
    medium === "ASSET-LED-MOTION" ||
    shot.source_required === true ||
    shot.generation?.source_required === true
  );
}`,
    "visual-source-required-semantics",
  ),
);

patchFile(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  (source) => replaceOnce(
    source,
`    assets: list(shot.assets).length ? shot.assets : list(shot.reference_assets),`,
`    assets: [],`,
    "typed-reference-assets-authority",
  ),
);

patchFile(
  "lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js",
  (source) => {
    let next = replaceOnce(
      source,
`function enrichPlan({ plan, synthesis, identities, audio, isMusicVideo }) {`,
`const FRESH_REFERENCE_ROLES = new Set([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "BRAND_REFERENCE",
  "SUBJECT_REFERENCE",
  "AUDIO_REFERENCE",
]);

const VISUAL_REFERENCE_ROLES = new Set([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "SUBJECT_REFERENCE",
]);

function freshReferenceRows({ shot = {}, identityAssetIds = [], audioAssetId = null } = {}) {
  const byId = new Map();
  for (const reference of list(shot.reference_assets)) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) continue;
    const id = assetId(reference);
    const role = text(reference.role).toUpperCase();
    if (!id || !FRESH_REFERENCE_ROLES.has(role)) continue;
    byId.set(id, {
      ...reference,
      asset_id: id,
      role,
      reason: text(reference.reason) || "Explicit shot reference selected by the director.",
    });
  }

  const existingPrimary = text(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id,
  );
  for (const id of unique(identityAssetIds)) {
    if (!id) continue;
    const current = byId.get(id);
    if (current?.role === "PRIMARY_SOURCE") continue;
    byId.set(id, {
      ...(current || {}),
      asset_id: id,
      role: "IDENTITY_REFERENCE",
      reason: text(current?.reason) ||
        "Identity evidence required to preserve the exact real subject across this shot.",
    });
  }
  if (audioAssetId) {
    const current = byId.get(audioAssetId);
    byId.set(audioAssetId, {
      ...(current || {}),
      asset_id: audioAssetId,
      role: "AUDIO_REFERENCE",
      reason: text(current?.reason) ||
        "Primary soundtrack timing and visible performance synchronization reference.",
    });
  }

  const rows = [...byId.values()];
  const visualRows = rows.filter((row) => VISUAL_REFERENCE_ROLES.has(row.role));
  const primaryRows = rows.filter((row) => row.role === "PRIMARY_SOURCE");
  let primaryId = existingPrimary || primaryRows[0]?.asset_id || null;

  if (!primaryId && visualRows.length) {
    const identityPrimary = unique(identityAssetIds).find((id) => byId.has(id));
    primaryId = identityPrimary || visualRows[0].asset_id;
  }
  if (primaryId && !byId.has(primaryId)) {
    throw new Error(`FRESH_DIRECTION_PRIMARY_SOURCE_REFERENCE_MISSING:${primaryId}`);
  }

  const normalized = rows.map((row) => ({
    ...row,
    role: row.asset_id === primaryId && VISUAL_REFERENCE_ROLES.has(row.role)
      ? "PRIMARY_SOURCE"
      : row.role === "PRIMARY_SOURCE"
        ? "CONTINUITY_REFERENCE"
        : row.role,
  }));
  const normalizedPrimary = normalized.filter((row) => row.role === "PRIMARY_SOURCE");
  if (visualRows.length && normalizedPrimary.length !== 1) {
    throw new Error("FRESH_DIRECTION_EXACT_PRIMARY_SOURCE_REQUIRED");
  }

  return {
    primary_source_asset_id: primaryId,
    reference_assets: normalized,
  };
}

function enrichPlan({ plan, synthesis, identities, audio, isMusicVideo }) {`,
      "universal-temporal-reference-helper",
    );

    next = replaceOnce(
      next,
`      const performanceContract = {
        ...object(shot.performance_contract),`,
`      const referenceContract = freshReferenceRows({
        shot,
        identityAssetIds: references,
        audioAssetId: visibleSinging ? audioId : null,
      });

      const performanceContract = {
        ...object(shot.performance_contract),`,
      "universal-temporal-reference-contract",
    );

    next = replaceOnce(
      next,
`        ...shot,
        reference_asset_ids: unique([shot.reference_asset_ids, references]),
        reference_assets: unique([shot.reference_asset_ids, references]).map((asset_id) => ({
          asset_id,
          role: references.includes(asset_id) ? "IDENTITY_REFERENCE" : "SHOT_REFERENCE",
        })),`,
`        ...shot,
        primary_source_asset_id: referenceContract.primary_source_asset_id,
        reference_asset_ids: [],
        reference_assets: referenceContract.reference_assets,
        assets: [],`,
      "universal-temporal-typed-reference-output",
    );

    next = replaceOnce(
      next,
`          provider_parameters: {
            ...object(shot.generation?.provider_parameters),
            reference_asset_ids: references,
            identity_profile_id: profile?.id || null,
            requested_identity_angle: angle,
          },`,
`          primary_source_asset_id: referenceContract.primary_source_asset_id,
          provider_parameters: {
            ...object(shot.generation?.provider_parameters),
            primary_source_asset_id: referenceContract.primary_source_asset_id,
            identity_profile_id: profile?.id || null,
            requested_identity_angle: angle,
          },`,
      "universal-temporal-provider-source-isolation",
    );

    return next;
  },
);

patchFile(
  "lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime.js",
  (source) => {
    let next = replaceOnce(
      source,
`function restoreAndDirectPlan(plan = {}, context = {}) {`,
`const CAST_VISUAL_REFERENCE_ROLES = new Set([
  "PRIMARY_SOURCE",
  "IDENTITY_REFERENCE",
  "LOCATION_REFERENCE",
  "CONTINUITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "STYLE_REFERENCE",
  "SUBJECT_REFERENCE",
]);

function normalizeCastReferences(references = [], preferredPrimaryId = null) {
  const rows = list(references)
    .filter((reference) => reference && typeof reference === "object" && !Array.isArray(reference))
    .map((reference) => ({
      ...reference,
      asset_id: text(reference.asset_id || reference.id),
      role: text(reference.role).toUpperCase(),
    }))
    .filter((reference) => reference.asset_id && reference.role);
  const visual = rows.filter((reference) =>
    CAST_VISUAL_REFERENCE_ROLES.has(reference.role),
  );
  const existingPrimary = rows.find((reference) => reference.role === "PRIMARY_SOURCE")?.asset_id;
  const primaryId = preferredPrimaryId || existingPrimary || visual[0]?.asset_id || null;
  return {
    primary_source_asset_id: primaryId,
    reference_assets: rows.map((reference) => ({
      ...reference,
      role: reference.asset_id === primaryId && CAST_VISUAL_REFERENCE_ROLES.has(reference.role)
        ? "PRIMARY_SOURCE"
        : reference.role === "PRIMARY_SOURCE"
          ? "CONTINUITY_REFERENCE"
          : reference.role,
    })),
  };
}

function restoreAndDirectPlan(plan = {}, context = {}) {`,
      "reference-casting-normalizer",
    );

    next = replaceOnce(
      next,
`        const nonPersonReferences = explicitReferenceIds(shot)
          .filter((assetId) => !personIds.has(assetId));
        shot = {
          ...shot,
          actors: list(shot.actors),
          reference_asset_ids: nonPersonReferences,
          reference_assets: list(shot.reference_assets).filter((reference) =>
            !personIds.has(text(reference?.asset_id || reference)),
          ),`,
`        const nonPersonReferences = list(shot.reference_assets).filter((reference) =>
          !personIds.has(text(reference?.asset_id || reference)),
        );
        const normalizedReferences = normalizeCastReferences(nonPersonReferences);
        shot = {
          ...shot,
          actors: list(shot.actors),
          primary_source_asset_id: normalizedReferences.primary_source_asset_id,
          reference_asset_ids: [],
          reference_assets: normalizedReferences.reference_assets,
          assets: [],`,
      "reference-casting-synthetic-reference-filter",
    );

    next = replaceOnce(
      next,
`            provider_parameters: {
              ...object(shot.generation?.provider_parameters),
              identity_profile_id: null,
              reference_asset_ids: nonPersonReferences,
              cast_mode: cast.mode,
              synthetic_cast_contract: cast,
            },`,
`            primary_source_asset_id: normalizedReferences.primary_source_asset_id,
            provider_parameters: {
              ...object(shot.generation?.provider_parameters),
              primary_source_asset_id: normalizedReferences.primary_source_asset_id,
              identity_profile_id: null,
              cast_mode: cast.mode,
              synthetic_cast_contract: cast,
            },`,
      "reference-casting-provider-source-isolation",
    );

    return next;
  },
);

patchFile(
  "scripts/creative-runtime-bootstrap.mjs",
  (source) => replaceOnce(
    source,
`await import(
  "@/lib/creative/director/runtime/CreativeUniversalTemporalCoverageBootstrap"
);
await import(
  "@/lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime"
);`,
`await import(
  "@/lib/creative/director/runtime/CreativeUniversalTemporalCoverageBootstrap"
);
await import(
  "@/lib/creative/assets/intelligence/runtime/CreativeUniversalAssetSemanticCoverageRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeUniversalReferenceCastingRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeFreshDirectionReferenceContractRuntime"
);
await import(
  "@/lib/creative/director/runtime/CreativeCanonicalShotSourceRuntime"
);`,
    "cli-runtime-reference-gates",
  ),
);

console.log("CREATIVE_DIRECTION_ONLY_HARDENING_PATCH=PASS");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("DATABASE_ROWS_CHANGED=NO");
