import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_OWNED_MODEL_CATALOG,
  ownedModelCertification,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

function provider(model) {
  return {
    id: "avantiqo-image",
    metadata: {
      configured_foundation_model: model,
      configured_model: model,
      foundation_models: model ? [model] : [],
    },
  };
}

test("Z-Image is licensed and approved for owned image generation", () => {
  const model = AVANTIQO_OWNED_MODEL_CATALOG["avantiqo-image"].models[
    "Tongyi-MAI/Z-Image"
  ];
  assert.equal(model.license, "apache-2.0");
  assert.equal(model.license_verified, true);
  assert.equal(model.runtime_compatible, true);
  assert.deepEqual(model.capabilities, ["ai.image.generate"]);

  const result = ownedModelCertification({
    provider: provider("Tongyi-MAI/Z-Image"),
    capability: "ai.image.generate",
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.approved_models, ["Tongyi-MAI/Z-Image"]);
});

test("Z-Image remains generation-only in owned model governance", () => {
  const result = ownedModelCertification({
    provider: provider("Tongyi-MAI/Z-Image"),
    capability: "ai.image.edit",
  });
  assert.equal(result.eligible, false);
  assert.equal(
    result.reason,
    "OWNED_FOUNDATION_MODEL_NOT_APPROVED_FOR_CAPABILITY",
  );
});
