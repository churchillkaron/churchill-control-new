import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateCreativeDesignGovernance,
} from "../lib/creative/design/runtime/CreativeDesignGovernanceValidationRuntime.js";

function specification(fontAssetId, brandLocked = false) {
  return {
    pages: [
      {
        id: "page-1",
        nodes: [
          {
            id: "headline",
            type: "TEXT",
            brand_locked: brandLocked,
            typography: {
              font_asset_id: fontAssetId,
            },
          },
        ],
      },
    ],
  };
}

test("general typography may use Avantiqo platform fonts", () => {
  const result = validateCreativeDesignGovernance({
    specification: specification("platform-font:inter", false),
  });
  assert.equal(result.success, true);
  assert.equal(result.contract, "CREATIVE_DESIGN_GOVERNANCE_VALIDATION_V1");
});

test("brand locked typography cannot use an Avantiqo fallback font", () => {
  assert.throws(
    () => validateCreativeDesignGovernance({
      specification: specification("platform-font:inter", true),
    }),
    /CREATIVE_DESIGN_BRAND_LOCKED_PLATFORM_FONT_FORBIDDEN/,
  );
});

test("brand locked typography accepts an organization font asset id", () => {
  const result = validateCreativeDesignGovernance({
    specification: specification("0b6f5be8-1e63-4d8c-9747-9c9b40b46220", true),
  });
  assert.equal(result.success, true);
});
