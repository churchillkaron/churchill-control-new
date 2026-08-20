#!/usr/bin/env node

// Production activation sentinel for the governed Creative organization import audit.
// Selected-only import is the active Studio organization-transfer contract.
import fs from "node:fs/promises";

const path = "app/api/internal/creative/assets/organization-import/route.js";
const source = await fs.readFile(path, "utf8");

const checks = [
  ["generic import contract", 'CREATIVE_ASSET_ORGANIZATION_IMPORT_V1'],
  ["source project validation", 'CREATIVE_ASSET_IMPORT_PROJECT_NOT_FOUND'],
  ["cross organization guard", 'CREATIVE_ASSET_IMPORT_CROSS_ORGANIZATION_REQUIRED'],
  ["one time token hash", 'asset_import_token_sha256'],
  ["source provenance", 'organization_import_source_asset_id'],
  ["destination project scope", 'targetProject.id'],
  ["selected project assets only", 'project.metadata?.selected_asset_ids'],
  ["selected id database filter", 'query = query.in("id", selectedAssetIds)'],
  ["storage copy download", '.download(sourceStorage.storagePath)'],
  ["storage copy upload", '.upload(destinationPath, file'],
  ["token consumption", 'delete nextMetadata.asset_import_token_sha256'],
  ["selected asset update", 'selected_asset_ids: selectedAssetIds'],
];

for (const [label, marker] of checks) {
  if (!source.includes(marker)) {
    throw new Error(`CREATIVE_ASSET_ORGANIZATION_IMPORT_AUDIT_FAILED:${label}`);
  }
  console.log(`PASS ${label}`);
}

if (source.includes("33336a72-acb5-474e-856b-8be0269360e2") ||
    source.includes("9a148429-b6a0-4bc6-ac83-a35c64fb7045") ||
    source.toLowerCase().includes("investor")) {
  throw new Error("CREATIVE_ASSET_ORGANIZATION_IMPORT_AUDIT_FAILED:hardcoded_business_identity");
}

console.log("CREATIVE_ASSET_ORGANIZATION_IMPORT_AUDIT=PASS");
