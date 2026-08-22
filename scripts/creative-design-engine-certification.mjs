import assert from "node:assert/strict";

import {
  composeCreativeDesignDocument,
} from "../lib/creative/design/runtime/CreativeDesignCompositionRuntime.js";
import {
  bindCreativeDesignDocument,
} from "../lib/creative/design/runtime/CreativeDesignDataBindingRuntime.js";
import {
  createEan13Bits,
  createQrMatrix,
} from "../lib/creative/design/runtime/CreativeDesignCodeRuntime.js";
import {
  renderCreativeDesignDocumentToSvg,
} from "../lib/creative/design/runtime/CreativeDesignSvgRenderer.js";
import {
  inspectCreativeDesignDocument,
} from "../lib/creative/design/runtime/CreativeDesignQualityRuntime.js";
import {
  repairCreativeDesignUntilStable,
} from "../lib/creative/design/runtime/CreativeDesignRepairRuntime.js";

const organizationId = "design-certification-organization";
const projectId = "design-certification-project";

const specification = {
  title: "Avantiqo Design Engine Certification",
  authority: {
    creative_master_plan_hash: "master-plan-certification-v1",
    art_direction_id: "art-direction-certification-v1",
    brand_direction_id: "brand-direction-certification-v1",
    copy_direction_id: "copy-direction-certification-v1",
  },
  pages: [
    {
      id: "poster",
      width: 800,
      height: 1000,
      unit: "px",
      background: "#ffffff",
      nodes: [
        {
          id: "brand-title",
          type: "TEXT",
          locked: true,
          content: "AVANTIQO",
          frame: { x: 70, y: 60, width: 660, height: 70 },
          typography: {
            font_asset_id: "font-brand",
            font_size: 46,
            font_weight: 700,
            line_height: 1.1,
          },
        },
        {
          id: "campaign-title",
          type: "TEXT",
          content: "Premium Dinner",
          frame: { x: 70, y: 160, width: 660, height: 70 },
          typography: {
            font_asset_id: "font-display",
            font_size: 38,
            font_weight: 600,
            line_height: 1.1,
          },
          binding: {
            source_id: "campaign",
            path: "headline",
          },
        },
        {
          id: "menu-table",
          type: "TABLE",
          frame: { x: 70, y: 270, width: 660, height: 250 },
          columns: [
            {
              id: "name",
              width: 4,
              binding: { path: "name" },
            },
            {
              id: "price",
              width: 1,
              align: "right",
              binding: {
                path: "price",
                format: "CURRENCY",
                currency: "THB",
                locale: "en-US",
                maximum_fraction_digits: 0,
              },
            },
          ],
          typography: {
            font_asset_id: "font-body",
            font_size: 22,
            line_height: 1.2,
          },
          binding: {
            source_id: "menu",
            path: "items",
          },
        },
        {
          id: "website-qr",
          type: "QR",
          frame: { x: 70, y: 600, width: 180, height: 180 },
          binding: {
            source_id: "campaign",
            path: "website",
          },
        },
        {
          id: "product-barcode",
          type: "BARCODE",
          frame: { x: 320, y: 610, width: 360, height: 130 },
          symbology: "EAN13",
          binding: {
            source_id: "product",
            path: "ean13",
          },
        },
        {
          id: "repair-target",
          type: "SHAPE",
          frame: { x: 760, y: 850, width: 100, height: 80 },
          fill: "#111111",
        },
      ],
    },
  ],
};

const composed = composeCreativeDesignDocument({
  organization_id: organizationId,
  creative_project_id: projectId,
  specification,
});
assert.equal(composed.success, true);
assert.equal(composed.document.pages.length, 1);
assert.equal(composed.document.metadata.prompt_persisted, false);

const bound = bindCreativeDesignDocument(composed.document, {
  campaign: {
    organization_id: organizationId,
    source_type: "CAMPAIGN_FACTS",
    evidence_id: "campaign-evidence-v1",
    data: {
      headline: "Premium Dinner Tonight",
      website: "https://example.com/dinner",
    },
  },
  menu: {
    organization_id: organizationId,
    source_type: "PRODUCT_CATALOG",
    evidence_id: "menu-evidence-v1",
    data: {
      items: [
        { name: "Tenderloin", price: 690 },
        { name: "Sea Bass", price: 590 },
        { name: "Crème brûlée", price: 290 },
      ],
    },
  },
  product: {
    organization_id: organizationId,
    source_type: "PRODUCT_MASTER",
    evidence_id: "product-evidence-v1",
    data: { ean13: "4006381333931" },
  },
});
assert.equal(bound.success, true);
assert.equal(bound.binding_count, 4);
assert.equal(bound.invented_business_facts_allowed, false);

const qr = createQrMatrix("https://example.com/dinner");
assert.ok(qr.size >= 21);
assert.equal(qr.error_correction, "L");
assert.equal(qr.matrix.length, qr.size);
assert.equal(qr.matrix.every((row) => row.length === qr.size), true);

const barcode = createEan13Bits("4006381333931");
assert.equal(barcode.digits, "4006381333931");
assert.equal(barcode.bits.length, 95);
assert.equal(barcode.bits.startsWith("101"), true);
assert.equal(barcode.bits.endsWith("101"), true);

const svgBefore = renderCreativeDesignDocumentToSvg(bound.document);
assert.equal(svgBefore.pages.length, 1);
assert.match(svgBefore.pages[0].svg, /data-node-type="TABLE"/);
assert.match(svgBefore.pages[0].svg, /data-code-type="QR"/);
assert.match(svgBefore.pages[0].svg, /data-code-type="EAN13"/);

const qualityBefore = inspectCreativeDesignDocument(bound.document);
assert.equal(qualityBefore.release_blocked, true);
assert.ok(
  qualityBefore.issues.some((issue) =>
    issue.code === "NODE_OUTSIDE_PAGE" && issue.node_id === "repair-target"),
);

const lockedBefore = JSON.stringify(
  bound.document.pages[0].nodes.find((node) => node.id === "brand-title"),
);
const headlineBefore = bound.document.pages[0].nodes.find(
  (node) => node.id === "campaign-title",
).content;
const menuBefore = JSON.stringify(
  bound.document.pages[0].nodes.find((node) => node.id === "menu-table").rows,
);

const repaired = repairCreativeDesignUntilStable(bound.document, {
  maximum_passes: 3,
});
assert.equal(repaired.success, true);
assert.equal(repaired.status, "PASSED_AFTER_REPAIR");
assert.ok(repaired.repair_pass_count >= 1);
assert.equal(repaired.quality.release_blocked, false);

const repairedPage = repaired.document.pages[0];
const repairTarget = repairedPage.nodes.find((node) => node.id === "repair-target");
assert.ok(repairTarget.frame.x + repairTarget.frame.width <= repairedPage.width);
assert.equal(
  JSON.stringify(repairedPage.nodes.find((node) => node.id === "brand-title")),
  lockedBefore,
);
assert.equal(
  repairedPage.nodes.find((node) => node.id === "campaign-title").content,
  headlineBefore,
);
assert.equal(
  JSON.stringify(repairedPage.nodes.find((node) => node.id === "menu-table").rows),
  menuBefore,
);

const qualityAfter = inspectCreativeDesignDocument(repaired.document);
assert.equal(qualityAfter.release_blocked, false);
assert.equal(qualityAfter.status, "PASSED");

console.log(JSON.stringify({
  certification: "AVANTIQO_CREATIVE_DESIGN_ENGINE_V1",
  passed: true,
  composed_document_hash: composed.document_hash,
  bound_document_hash: bound.document.document_hash,
  repaired_document_hash: repaired.document.document_hash,
  binding_count: bound.binding_count,
  qr_version: qr.version,
  barcode: barcode.digits,
  repair_pass_count: repaired.repair_pass_count,
  final_quality_status: qualityAfter.status,
  provider_called: false,
  business_truth_preserved: true,
  locked_nodes_preserved: true,
}, null, 2));
