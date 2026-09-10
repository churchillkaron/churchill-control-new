import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { externalResearchRequested } from "../lib/operator/runtime/OperatorResearchRoutingPolicy.js";
import { rankOperatorCapabilities } from "../lib/operator/runtime/OperatorCapabilityMatcher.js";

test("internal current records stay internal-first while public current facts research", () => {
  const cases = [
    ["latest certificate in our documents", false],
    ["show me our current unpaid invoices", false],
    ["which employees work for our business today", false],
    ["what creative production tasks are failed right now in our studio", false],
    ["what is the current USD THB exchange rate today", true],
    ["latest Thailand labor law changes", true],
    ["search the web for current hotel market trends", true],
    ["https://docs.example.com/page", true],
  ];
  for (const [message, expected] of cases) {
    assert.equal(externalResearchRequested(message), expected, message);
  }
});

test("Fast conversation lazy-loads the heavy read bridge only on evidence turns", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url), "utf8");
  assert.match(source, /from "\.\/OperatorResearchRoutingPolicy"/);
  assert.doesNotMatch(source, /import \{[\s\S]{0,100}createOperatorIntelligenceReadTools[\s\S]{0,100}from "\.\/OperatorIntelligenceToolBridgeRuntime"/);
  assert.match(source, /Promise\.all\(\[\s*import\("\.\/OperatorIntelligenceToolBridgeRuntime"\)/);
});
test("Hotel solution is registered under canonical Solutions with a read-only booking surface", () => {
  const registry = fs.readFileSync(new URL("../lib/ubte/runtime/domains/DomainRuntimeRegistry.js", import.meta.url), "utf8");
  const solution = fs.readFileSync(new URL("../lib/solutions/runtime/SolutionsOperatorDomainRuntime.js", import.meta.url), "utf8");
  assert.match(registry, /solutions:\s*async \(\) =>/);
  assert.match(solution, /domain:\s*"solutions"/);
  assert.match(solution, /capability:\s*"hotel_bookings"/);
  assert.match(solution, /endpoint:\s*"\/api\/hotel\/bookings\/list"/);
  assert.match(solution, /operatorAliases:/);
});

test("hotel reservation language outranks neutral reservation primitives", () => {
  const capabilities = [
    { key: "solutions.hotel_bookings.read", name: "Hotel Bookings & Reservation Readiness", domain: "solutions", capability: "hotel_bookings", action: "read", mode: "read", description: "Read canonical Hotel bookings with guest room operational day turnover arrival readiness departure readiness payment and folio state. Use for hotel reservations arrivals departures check-in readiness and bookings needing attention.", operator_aliases: ["hotel reservations", "hotel bookings", "bookings needing attention", "reservations needing attention", "today arrivals", "today departures", "guests checking in", "guests checking out", "arrival readiness", "departure readiness"], tags: ["solutions", "hotel", "bookings", "reservations", "arrivals", "departures", "guests", "readiness"] },
    { key: "operations.capacity_reservations.list", domain: "operations", capability: "capacity_reservations", action: "list", mode: "read", description: "Neutral capacity reservations" },
    { key: "operations.resource_reservations.list", domain: "operations", capability: "resource_reservations", action: "list", mode: "read", description: "Neutral resource reservations" },
  ];
  const ranked = rankOperatorCapabilities({ message: "what hotel reservations need attention today", capabilities, modes: ["read"], limit: 3 });
  assert.equal(ranked[0]?.capability?.key, "solutions.hotel_bookings.read");
});

test("Fast startup does not statically import heavy execution runtimes", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import[\s\S]{0,180}ServiceExecutionRuntime/m);
  assert.doesNotMatch(source, /^import[\s\S]{0,180}AvantiqoIntelligenceReasoningRuntime/m);
  assert.doesNotMatch(source, /^import[\s\S]{0,220}OperatorOwnedIntelligenceServiceRuntime/m);
  assert.match(source, /Promise\.all\(\[\s*import\("\.\/OperatorIntelligenceToolBridgeRuntime"\)/);
  assert.match(source, /import\("@\/lib\/platform\/service-runtime\/execution\/ServiceExecutionRuntime"\)/);
});
