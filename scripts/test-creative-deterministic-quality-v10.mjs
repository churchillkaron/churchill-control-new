#!/usr/bin/env node

import assert from "node:assert/strict";
import sharp from "sharp";

import {
  CreativeDeterministicImageQualityRuntime,
} from "../lib/creative/production/quality/CreativeDeterministicImageQualityRuntime.js";

function dataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function solidImage({ width = 128, height = 96, background }) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  }).png().toBuffer();
}

const black = await solidImage({
  background: { r: 5, g: 5, b: 5, alpha: 1 },
});
const white = await solidImage({
  background: { r: 245, g: 245, b: 245, alpha: 1 },
});
const logo = await sharp({
  create: {
    width: 40,
    height: 20,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{
    input: Buffer.from(
      '<svg width="40" height="20"><rect x="2" y="2" width="36" height="16" fill="#ffffff"/></svg>',
    ),
  }])
  .png()
  .toBuffer();

let exactDuplicateRejected = false;
try {
  await CreativeDeterministicImageQualityRuntime.assertUniqueMasterStill({
    candidate_url: dataUrl(black),
    comparison_urls: [dataUrl(black)],
  });
} catch (error) {
  exactDuplicateRejected =
    error.code === "CREATIVE_MASTER_STILL_EXACT_DUPLICATE";
}
assert.equal(exactDuplicateRejected, true);

const distinct = await CreativeDeterministicImageQualityRuntime.assertUniqueMasterStill({
  candidate_url: dataUrl(black),
  comparison_urls: [dataUrl(white)],
});
assert.equal(distinct.passed, true);
assert.equal(distinct.compared, 1);

const brandAsset = {
  id: "brand-source-1",
  image_url: dataUrl(logo),
  evidence_roles: ["BRAND"],
};

let missingPlacementRejected = false;
try {
  CreativeDeterministicImageQualityRuntime.assertExactBrandOverlayContract({
    task: { input: { specification: { shot: {} } } },
    brand_assets: [brandAsset],
    required: true,
  });
} catch (error) {
  missingPlacementRejected =
    error.code === "CREATIVE_EXACT_BRAND_PLACEMENT_CONTRACT_REQUIRED";
}
assert.equal(missingPlacementRejected, true);

const overlay = await CreativeDeterministicImageQualityRuntime.applyExactBrandOverlay({
  task: {
    input: {
      specification: {
        shot: {
          brand_overlay: {
            required: true,
            asset_id: "brand-source-1",
            position: "BOTTOM_RIGHT",
            width_ratio: 0.2,
            margin_ratio: 0.05,
          },
        },
      },
    },
  },
  image_url: dataUrl(black),
  brand_assets: [brandAsset],
  required: true,
});

assert.equal(overlay.applied, true);
assert.equal(
  overlay.diagnostics.version,
  "CREATIVE_EXACT_BRAND_COMPOSITOR_V10",
);
assert.equal(overlay.diagnostics.source_asset_id, "brand-source-1");
assert.equal(overlay.diagnostics.exact_source_asset_raster_used, true);
assert.match(overlay.diagnostics.source_asset_sha256, /^[a-f0-9]{64}$/);
assert.match(overlay.diagnostics.output_sha256, /^[a-f0-9]{64}$/);
assert.match(overlay.url, /^data:image\/png;base64,/);

console.log("CREATIVE_DETERMINISTIC_QUALITY_V10_TEST=PASS");
