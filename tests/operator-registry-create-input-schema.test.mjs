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


test("registry create risk defaults are stricter for Finance without changing other domains", () => {
  const finance = createRegistryCreateCapability({
    domain: "finance",
    item: { id: "tax_codes", name: "Tax Codes", create: { enabled: true, api: "/api/finance/tax-codes/upsert" }, data: { identity: "tax_code_id" } },
    endpoint: "/api/finance/tax-codes/upsert",
  });
  const commercial = createRegistryCreateCapability({
    domain: "commercial",
    item: { id: "quotes", name: "Quotes", create: { enabled: true, api: "/api/commercial/quotes" }, data: { identity: "quote_id" } },
    endpoint: "/api/commercial/quotes",
  });
  const explicit = createRegistryCreateCapability({
    domain: "finance",
    item: { id: "safe_config", name: "Safe Config", create: { enabled: true, api: "/api/finance/safe-config", risk: "low" }, data: { identity: "config_id" } },
    endpoint: "/api/finance/safe-config",
  });

  assert.equal(finance.manifest.risk, "high");
  assert.equal(commercial.manifest.risk, "medium");
  assert.equal(explicit.manifest.risk, "low");
  assert.equal(finance.manifest.operatorRequiresConfirmation, true);
  assert.equal(finance.manifest.operatorAutoExecute, false);
  assert.equal(finance.manifest.operatorVerification.capability_key, "finance.tax_codes.read");
});
