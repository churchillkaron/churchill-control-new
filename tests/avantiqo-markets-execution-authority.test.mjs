import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);
const ui = fs.readFileSync(
  new URL("../components/workspace/solutions/markets/MarketsCommandCenter.jsx", import.meta.url),
  "utf8",
);

test("Markets execution authority is limited to owner-grade roles", () => {
  assert.match(route, /const MARKETS_AUTOMATION_OWNER_ROLES = new Set\(\[[\s\S]*?"OWNER"[\s\S]*?"SUPER_ADMIN"[\s\S]*?\]\)/);
  assert.match(route, /can_execute_paper: MARKETS_AUTOMATION_OWNER_ROLES\.has\(role\)/);
});

test("manual BUY and SELL decision creation requires execution authority", () => {
  assert.match(
    route,
    /if \(action === "RECORD_DECISION"\)[\s\S]*?\["BUY", "SELL"\]\.includes\(decisionAction\)[\s\S]*?requireMarketsAutomationAuthority\(scope\)/,
  );
});

test("paper order submission and processing require execution authority", () => {
  assert.match(
    route,
    /if \(action === "SUBMIT_PAPER_ORDER"\)[\s\S]*?requireMarketsAutomationAuthority\(scope\)/,
  );
  assert.match(
    route,
    /if \(action === "PROCESS_PAPER_ORDERS"\)[\s\S]*?requireMarketsAutomationAuthority\(scope\)/,
  );
});

test("GET exposes server-derived paper execution authority to the client", () => {
  assert.match(
    route,
    /execution:\s*\{[\s\S]*?mode: "PAPER"[\s\S]*?live_enabled: false[\s\S]*?\.\.\.marketsAuthority\(scope\)/,
  );
});

test("Markets UI disables execution controls without server authority", () => {
  assert.match(ui, /const canExecutePaper = data\?\.execution\?\.can_execute_paper === true/);
  assert.match(ui, /Owner authority required for PAPER execution/);
  assert.match(ui, /disabled=\{!canExecutePaper \|\| Boolean\(working\)/);
});
