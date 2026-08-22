import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  resolveCreativeDesignMenuDataSource,
} from "../lib/creative/design/data-sources/CreativeDesignMenuDataSourceRuntime.js";
import {
  composeCreativeDesignDocument,
} from "../lib/creative/design/runtime/CreativeDesignCompositionRuntime.js";
import {
  bindCreativeDesignDocument,
} from "../lib/creative/design/runtime/CreativeDesignDataBindingRuntime.js";
import {
  materializeCreativeDesignFonts,
} from "../lib/creative/design/runtime/CreativeDesignFontMaterializationRuntime.js";
import {
  renderCreativeDesignDocumentToSvg,
} from "../lib/creative/design/runtime/CreativeDesignSvgRenderer.js";
import {
  renderCreativeDesignDocumentToPng,
} from "../lib/creative/design/runtime/CreativeDesignPngRenderer.js";
import {
  renderCreativeDesignDocumentToPdf,
} from "../lib/creative/design/runtime/CreativeDesignPdfRenderer.js";
import {
  inspectCreativeDesignDocument,
} from "../lib/creative/design/runtime/CreativeDesignQualityRuntime.js";
import {
  materializeMedia,
} from "../lib/creative/media/runtime/CreativeMediaInspectionRuntime.js";

const ORGANIZATION_ID =
  process.env.CREATIVE_CERTIFICATION_ORGANIZATION_ID ||
  "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID =
  process.env.CREATIVE_CERTIFICATION_PROJECT_ID ||
  "28cba496-4cc3-42dd-8b3a-c47e73a907a1";
const FONT_DISPLAY = process.env.CREATIVE_CERTIFICATION_DISPLAY_FONT || "platform-font:playfairdisplay";
const FONT_BODY = process.env.CREATIVE_CERTIFICATION_BODY_FONT || "platform-font:inter";

function categoryPages(menu) {
  const categories = menu.data.categories;
  return categories.map((entry, index) => {
    const rows = entry.items.length;
    const tableY = 310;
    const rowHeight = 54;
    const tableHeight = Math.max(100, rows * rowHeight);
    const pageHeight = Math.max(1400, tableY + tableHeight + 140);
    return {
      id: `menu-${index + 1}`,
      width: 992,
      height: pageHeight,
      unit: "px",
      background: "#111111",
      safe_area: { top: 64, right: 64, bottom: 64, left: 64 },
      nodes: [
        {
          id: `brand-${index + 1}`,
          type: "IMAGE",
          locked: true,
          frame: { x: 346, y: 54, width: 300, height: 160 },
          fit: "contain",
          asset_reference: "LOGO_PLACEHOLDER",
          metadata: { brand_locked: true },
        },
        {
          id: `category-${index + 1}`,
          type: "TEXT",
          content: entry.category === "uncategorized" ? "Menu" : entry.category,
          frame: { x: 64, y: 228, width: 864, height: 64 },
          typography: {
            font_asset_id: FONT_DISPLAY,
            font_size: 44,
            font_weight: 600,
            line_height: 1.1,
            align: "center",
            color: "#ffffff",
          },
        },
        {
          id: `table-${index + 1}`,
          type: "TABLE",
          frame: { x: 96, y: tableY, width: 800, height: tableHeight },
          row_height: rowHeight,
          cell_padding_x: 8,
          cell_padding_y: 8,
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
                currency_display: "narrowSymbol",
                maximum_fraction_digits: 0,
              },
            },
          ],
          typography: {
            font_asset_id: FONT_BODY,
            font_size: 26,
            font_weight: 400,
            line_height: 1.15,
            color: "#f5f5f5",
          },
          binding: {
            source_id: menu.source_id,
            path: `categories.${index}.items`,
          },
        },
      ],
    };
  });
}

async function approvedLogo() {
  const { data, error } = await supabaseAdmin
    .from("creative_asset_nodes")
    .select("id,url,name,status,review,creative_project_id,creative_asset_id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("type", "LOGO")
    .eq("status", "APPROVED")
    .not("url", "is", null)
    .order("creative_project_id", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw new Error(`CREATIVE_DESIGN_LIVE_LOGO_QUERY_FAILED:${error.message}`);
  const logo = (data || []).find((row) => row.review?.approved === true) || data?.[0];
  if (!logo?.url) throw new Error("CREATIVE_DESIGN_LIVE_APPROVED_LOGO_REQUIRED");
  return logo;
}

async function embedLogo(document, logo) {
  const material = await materializeMedia({
    url: logo.url,
    file_name: logo.name || "churchill-logo.png",
    organization_id: ORGANIZATION_ID,
    policy: {
      max_bytes: 12 * 1024 * 1024,
      timeout_ms: 30_000,
      max_redirects: 2,
    },
  });
  try {
    const bytes = await fs.readFile(material.file_path);
    const mime = material.mime_type || "image/png";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    return {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        nodes: page.nodes.map((node) =>
          node.type === "IMAGE" && node.asset_reference === "LOGO_PLACEHOLDER"
            ? {
                ...node,
                asset_reference: dataUrl,
                asset_id: logo.id,
                metadata: {
                  ...(node.metadata || {}),
                  source_asset_node_id: logo.id,
                  source_asset_checksum: material.checksum,
                },
              }
            : node,
        ),
      })),
    };
  } finally {
    await material.cleanup();
  }
}

const menu = await resolveCreativeDesignMenuDataSource({
  organization_id: ORGANIZATION_ID,
});
assert.ok(menu, "Churchill governed dishes source must exist");
assert.ok(menu.data.items.length > 0, "Churchill menu must have rows");
assert.equal(menu.policy.invented_values_allowed, false);

const logo = await approvedLogo();
assert.equal(logo.status, "APPROVED");

const specification = {
  title: "Churchill Live Menu Certification",
  authority: {
    creative_master_plan_hash: "live-certification:churchill-menu",
    art_direction_id: "live-certification:deterministic-layout",
    brand_direction_id: `asset-node:${logo.id}`,
    copy_direction_id: `governed-source:${menu.evidence_id}`,
  },
  pages: categoryPages(menu),
  metadata: {
    certification_only: true,
    publish_allowed: false,
    business_truth_source_id: menu.source_id,
    business_truth_evidence_id: menu.evidence_id,
    approved_logo_asset_node_id: logo.id,
  },
};

const composed = composeCreativeDesignDocument({
  organization_id: ORGANIZATION_ID,
  creative_project_id: PROJECT_ID,
  specification,
});
assert.equal(composed.success, true);

const bound = bindCreativeDesignDocument(composed.document, {
  [menu.source_id]: menu,
});
assert.equal(bound.success, true);
assert.equal(bound.binding_count, menu.data.categories.length);

const withLogo = await embedLogo(bound.document, logo);
const quality = inspectCreativeDesignDocument(withLogo);
assert.equal(quality.release_blocked, false, JSON.stringify(quality.issues));

const fonts = await materializeCreativeDesignFonts({
  document: withLogo,
  media_policy: {
    max_bytes: 20 * 1024 * 1024,
    timeout_ms: 30_000,
    max_redirects: 2,
    allowed_hosts: ["raw.githubusercontent.com"],
  },
});

try {
  assert.equal(fonts.exact_font_assets_verified, true);
  assert.equal(fonts.host_os_font_lookup_used, false);
  assert.ok(fonts.bindings.has(FONT_DISPLAY));
  assert.ok(fonts.bindings.has(FONT_BODY));

  const svg = renderCreativeDesignDocumentToSvg(withLogo, {
    font_bindings: fonts.bindings,
  });
  assert.equal(svg.success, true);
  assert.equal(svg.text_overflow_nodes.length, 0);
  assert.equal(svg.table_overflow_nodes.length, 0);
  assert.equal(svg.content_preserved_on_overflow, true);

  const png = await renderCreativeDesignDocumentToPng(withLogo, {
    font_bindings: fonts.bindings,
    density: 144,
  });
  assert.equal(png.success, true);
  assert.equal(png.pages.length, menu.data.categories.length);
  assert.ok(png.pages.every((page) => page.byte_length > 0));

  const pdf = await renderCreativeDesignDocumentToPdf(withLogo, {
    font_bindings: fonts.bindings,
    density: 144,
  });
  assert.equal(pdf.success, true);
  assert.equal(pdf.page_count, menu.data.categories.length);
  assert.ok(pdf.byte_length > 0);

  console.log(JSON.stringify({
    certification: "CHURCHILL_LIVE_MENU_DESIGN_V1",
    passed: true,
    publish_performed: false,
    organization_id: ORGANIZATION_ID,
    project_id: PROJECT_ID,
    menu_source_id: menu.source_id,
    menu_evidence_id: menu.evidence_id,
    menu_item_count: menu.data.items.length,
    category_count: menu.data.categories.length,
    categories: menu.planning_summary.categories.map((entry) => ({
      category: entry.category,
      item_count: entry.item_count,
    })),
    approved_logo_asset_node_id: logo.id,
    display_font: FONT_DISPLAY,
    body_font: FONT_BODY,
    font_evidence: fonts.evidence,
    svg_pages: svg.pages.length,
    png_pages: png.pages.length,
    pdf_pages: pdf.page_count,
    pdf_color_space: pdf.color_space,
    cmyk_certified: pdf.cmyk_certified,
    pdfx_certified: pdf.pdfx_certified,
    business_truth_preserved: true,
    invented_business_facts_allowed: false,
  }, null, 2));
} finally {
  await fonts.cleanup();
}
