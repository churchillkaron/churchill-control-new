import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("../scripts/next-alias-loader.mjs", import.meta.url);
const { createRegistryCreateCapability } = await import(
  "../lib/platform/registry/operatorRegistryBridge.js"
);

function schemaFrom(manifest) {
  return manifest.inputSchema || manifest.input_schema || null;
}

test("registry create honors a declared canonical input schema", () => {
  const schema = {
    type: "object",
    properties: {
      reference_id: { type: "string" },
      post_to_finance: { type: "boolean" },
    },
    required: ["reference_id"],
    additionalProperties: false,
  };
  const { manifest } = createRegistryCreateCapability({
    domain: "supply_chain",
    item: {
      id: "example",
      name: "Example",
      create: { enabled: true, label: "+ Example", inputSchema: schema },
    },
    endpoint: "/api/example",
  });
  assert.deepEqual(schemaFrom(manifest), schema);
});

test("registry create stays backward-compatible when no schema is declared", () => {
  const { manifest } = createRegistryCreateCapability({
    domain: "supply_chain",
    item: {
      id: "legacy",
      name: "Legacy",
      create: { enabled: true, label: "+ Legacy" },
    },
    endpoint: "/api/legacy",
  });
  const schema = schemaFrom(manifest);
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, true);
  assert.deepEqual(schema.properties, {});
});
