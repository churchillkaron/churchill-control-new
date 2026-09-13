import test from "node:test";
import assert from "node:assert/strict";
import { routeOperatorCognition } from "../lib/operator/runtime/OperatorCognitionRouter.js";

const capability = (key, aliases = []) => {
  const [domain, name, action] = key.split(".");
  return {
    key, domain, capability: name, action,
    mode: action === "read" ? "read" : "write",
    operator_aliases: aliases,
    description: key,
    input_schema: { type: "object", properties: {} },
  };
};

test("clear create command stays on Fast even with weaker nearby actions", () => {
  const result = routeOperatorCognition({
    message: "create customer invoice",
    capabilities: [
      capability("finance.customer_invoices.create", ["create customer invoice"]),
      capability("finance.customers.create", ["create customer"]),
      capability("finance.vendor_bills.create", ["create vendor bill"]),
    ],
  });
  assert.equal(result.path, "fast");
  assert.match(result.reason, /REGISTERED_ACTION/);
});

test("clear add staff command stays on Fast", () => {
  const result = routeOperatorCognition({
    message: "add employee",
    capabilities: [
      capability("people.employees.create", ["add employee", "add staff"]),
      capability("projects.projects.create", ["create project"]),
    ],
  });
  assert.equal(result.path, "fast");
});

test("genuinely ambiguous multi-action request still escalates to Deep", () => {
  const result = routeOperatorCognition({
    message: "create customer and create supplier",
    capabilities: [
      capability("commercial.customers.create", ["create customer"]),
      capability("supply-chain.suppliers.create", ["create supplier"]),
    ],
  });
  assert.equal(result.path, "deep");
});

test("strategy request remains Deep even when a capability matches", () => {
  const result = routeOperatorCognition({
    message: "what should we do about invoices",
    capabilities: [capability("finance.customer_invoices.create", ["create invoice"])],
  });
  assert.equal(result.path, "deep");
});
