import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreativeDesignMeasuredTextLayout,
} from "../lib/creative/design/runtime/CreativeDesignMeasuredTextLayoutRuntime.js";

const fontBindings = new Map([
  [
    "font-test",
    {
      font_family: "Test Sans",
      css_family: "Test Sans",
      file_path: "/tmp/not-used-by-injected-measurer.ttf",
    },
  ],
]);

const measureText = ({ content }) => Array.from(String(content ?? "")).length * 10;

test("measured typography balances exact line breaks and table cells", async () => {
  const document = {
    pages: [
      {
        id: "poster",
        nodes: [
          {
            id: "headline",
            type: "TEXT",
            content: "Premium dinner tonight",
            frame: { width: 150, height: 80 },
            typography: {
              font_asset_id: "font-test",
              font_size: 20,
              line_height: 1.1,
            },
          },
          {
            id: "thai-copy",
            type: "TEXT",
            content: "อาหารค่ำระดับพรีเมียม",
            frame: { width: 120, height: 90 },
            typography: {
              font_asset_id: "font-test",
              font_size: 18,
              line_height: 1.2,
            },
          },
          {
            id: "menu",
            type: "TABLE",
            frame: { width: 300, height: 180 },
            columns: [
              { id: "name", width: 4 },
              { id: "price", width: 1 },
            ],
            rows: [
              { cells: ["Tenderloin steak", "690"] },
            ],
            typography: {
              font_asset_id: "font-test",
              font_size: 16,
              line_height: 1.2,
            },
          },
        ],
      },
    ],
  };

  const result = await createCreativeDesignMeasuredTextLayout({
    document,
    font_bindings: fontBindings,
    measure_text: measureText,
  });

  assert.equal(result.success, true);
  assert.equal(result.actual_font_measurement, false);
  assert.ok(result.measurement_count > 0);

  const headline = result.layouts.get("headline");
  assert.equal(headline.estimated, false);
  assert.equal(headline.overflow, false);
  assert.ok(headline.lines.length >= 2);
  assert.ok(headline.balance_score >= 0 && headline.balance_score <= 1);

  const thai = result.layouts.get("thai-copy");
  assert.equal(thai.locale, "th");
  assert.equal(thai.unicode_segmented, true);
  assert.ok(thai.lines.length >= 2);

  const tableCell = result.layouts.get("menu:r0:c0");
  assert.ok(tableCell);
  assert.equal(tableCell.overflow, false);
  assert.equal(tableCell.measurement_source, "INJECTED_TEST_MEASURER");
});