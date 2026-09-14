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


test("registry mission creates derive replay-stable idempotency only inside governed mission steps", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ success: true, journal_id: "journal-1" }) };
  };

  try {
    const { execute } = createRegistryCreateCapability({
      domain: "finance",
      item: {
        id: "journals",
        name: "Journals",
        create: {
          enabled: true,
          api: "/api/finance/journals/create",
          inputSchema: { type: "object", properties: { idempotency_key: { type: "string" } } },
        },
        data: { identity: "journal_id" },
      },
      endpoint: "/api/finance/journals/create",
    });
    const callerRequest = { url: "https://example.test/operator", headers: { get: () => null } };
    const missionContext = {
      organizationId: "org-1",
      callerRequest,
      metadata: {
        parentCapabilityKey: "platform.operator_mission.execute",
        operatorMissionExecutionId: "mission-1",
        missionStepId: "step-1",
        source: "AVANTIQO_OPERATOR_MISSION",
      },
    };
    await execute({ context: missionContext, payload: { reference: "A" } });
    await execute({ context: missionContext, payload: { reference: "A" } });
    await execute({ context: { organizationId: "org-1", callerRequest, metadata: {} }, payload: { reference: "A" } });

    assert.ok(calls[0].idempotency_key);
    assert.equal(calls[0].idempotency_key, calls[1].idempotency_key);
    assert.equal(calls[2].idempotency_key, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});


test("registry confirmed single actions derive replay-stable idempotency from the operator run", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ success: true, invoice_id: "invoice-1" }) };
  };

  try {
    const { execute } = createRegistryCreateCapability({
      domain: "finance",
      item: {
        id: "customer_invoices",
        name: "Customer Invoices",
        create: {
          enabled: true,
          api: "/api/finance/customer-invoices/create",
          inputSchema: { type: "object", properties: { idempotency_key: { type: "string" } } },
        },
        data: { identity: "invoice_id" },
      },
      endpoint: "/api/finance/customer-invoices/create",
    });
    const callerRequest = { url: "https://example.test/operator", headers: { get: () => null } };
    const context = {
      organizationId: "org-1",
      callerRequest,
      metadata: {
        source: "AVANTIQO_OPERATOR",
        operatorRunId: "run-1",
        operatorConfirmedAction: true,
        conversationallyConfirmed: true,
      },
    };
    await execute({ context, payload: { party_id: "party-1" } });
    await execute({ context, payload: { party_id: "party-1" } });
    await execute({
      context: { organizationId: "org-1", callerRequest, metadata: { source: "AVANTIQO_OPERATOR" } },
      payload: { party_id: "party-1" },
    });

    assert.ok(calls[0].idempotency_key);
    assert.equal(calls[0].idempotency_key, calls[1].idempotency_key);
    assert.equal(calls[2].idempotency_key, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});
