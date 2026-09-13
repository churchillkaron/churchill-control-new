import assert from "node:assert/strict";
import test from "node:test";

import {
  renderCreativeDesignDocumentToSvg,
} from "../lib/creative/design/runtime/CreativeDesignSvgRenderer.js";

function documentWithFocal(focal_point) {
  return {
    contract: "CREATIVE_DESIGN_DOCUMENT_V1",
    organization_id: "org-1",
    creative_project_id: "project-1",
    title: "Focal test",
    pages: [{
      id: "page-1",
      width: 1080,
      height: 1350,
      nodes: [{
        id: "hero",
        type: "IMAGE",
        asset_reference: "https://example.com/hero.jpg",
        frame: { x: 0, y: 0, width: 1080, height: 1350 },
        fit: "cover",
        focal_point,
      }],
    }],
  };
}

test("cover rendering preserves left-top focal intent", () => {
  const result = renderCreativeDesignDocumentToSvg(documentWithFocal({ x: 0.1, y: 0.1 }));
  assert.equal(result.success, true);
  assert.match(result.pages[0].svg, /preserveAspectRatio="xMinYMin slice"/);
  assert.equal(result.pages[0].evidence[0].preserve_aspect_ratio, "xMinYMin slice");
});

test("cover rendering preserves right-bottom focal intent", () => {
  const result = renderCreativeDesignDocumentToSvg(documentWithFocal({ x: 0.9, y: 0.9 }));
  assert.match(result.pages[0].svg, /preserveAspectRatio="xMaxYMax slice"/);
});

test("contain rendering remains centered and uncropped", () => {
  const document = documentWithFocal({ x: 0.9, y: 0.1 });
  document.pages[0].nodes[0].fit = "contain";
  const result = renderCreativeDesignDocumentToSvg(document);
  assert.match(result.pages[0].svg, /preserveAspectRatio="xMidYMid meet"/);
});
