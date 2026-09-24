import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");

test("ordinary back-office domains use the canonical light workspace boundary", () => {
  const globals = source("app/globals.css");
  assert.match(globals, /\.avantiqo-backoffice-light/);
  for (const path of [
    "app/(system)/workspace/[organizationId]/people/layout.jsx",
    "app/(system)/workspace/[organizationId]/administration/layout.jsx",
    "app/(system)/workspace/[organizationId]/commercial/marketing/layout.jsx",
  ]) assert.match(source(path), /avantiqo-backoffice-light/);
  assert.match(source("app/(system)/workspace/[organizationId]/operations/configuration/page.jsx"), /avantiqo-backoffice-light/);
  assert.match(source("app/(system)/workspace/[organizationId]/operations/tables/configuration/page.jsx"), /avantiqo-backoffice-light/);
});

test("AI uses the organization workspace shell and legacy route only redirects", () => {
  assert.match(source("app/(system)/workspace/[organizationId]/ai/page.jsx"), /WorkspaceHeader/);
  assert.match(source("app/(system)/workspace/[organizationId]/ai/page.jsx"), /WorkspaceModuleGrid/);
  assert.match(source("app/(system)/workspace/[organizationId]/ai/page.jsx"), /HomeAvantiqoIntelligenceDock/);
  assert.match(source("app/(system)/intelligence/page.jsx"), /redirect\(`\/workspace\/\$\{encodeURIComponent\(organizationId\)\}\/ai`\)/);
  assert.doesNotMatch(source("app/(system)/intelligence/page.jsx"), /bg-\[#050505\]|text-white/);
});

test("unavailable project and AI subworkspaces are explicit planned capabilities", () => {
  const registry = source("lib/platform/registry/erpRegistry.base.js");
  for (const id of ["planning", "time", "costs", "finance_ai", "operations_ai", "marketing_ai", "agents", "workflows", "knowledge"]) {
    assert.match(registry, new RegExp(`id: "${id}"[^\\n]*status: "planned"`));
  }
  assert.match(registry, /id: "alerts"[^\n]*route: "\/dashboard"/);
});

test("planned workspace items render non-clickable in the shared module grid", () => {
  const grid = source("components/workspace/WorkspaceModuleGrid.jsx");
  assert.match(grid, /DISABLED_STATUSES/);
  assert.match(grid, /"planned"/);
  assert.match(grid, /aria-disabled="true"/);
  assert.match(grid, /if \(disabled\) return <div/);
});

test("the entire product workspace enforces Avantiqo light colors with no dark or blue chrome", () => {
  const rootLayout = source("app/(system)/workspace/[organizationId]/layout.jsx");
  const globals = source("app/globals.css");
  const exportControls = source("app/(system)/components/marketing/ExportControls.jsx");
  assert.match(rootLayout, /avantiqo-workspace-theme/);
  assert.match(globals, /Avantiqo global product palette/);
  assert.match(globals, /background:\s*#f7f6f3/);
  assert.match(globals, /body \[class\*="bg-black"\]/);
  assert.match(globals, /body \[class\*="text-white"\]/);
  assert.match(globals, /body \[class\*="bg-blue-"\]/);
  assert.match(globals, /#d6a66a/i);
  assert.match(exportControls, /backgroundColor: "#F7F6F3"/);
  assert.match(exportControls, /bg-\[#D6A66A\]/);
  assert.doesNotMatch(exportControls, /#000000|bg-orange-500/);
});


test("Campaign Command Center uses Avantiqo light product chrome", () => {
  const campaign = source("components/marketing/CampaignCommandCenter.jsx");
  assert.match(campaign, /bg-\[#FCFAF6\]/);
  assert.match(campaign, /text-\[#2D2822\]/);
  assert.match(campaign, /bg-\[#D6A66A\]/);
  assert.doesNotMatch(campaign, /bg-black(?:\/|\b)|bg-\[#090909\]|bg-black\/80|border-white\/10|text-white\/40/);
});

test("owned provider registrations declare every Modal readiness symbol they expose", () => {
  const imageProvider = source("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js");
  for (const symbol of ["modalTokenId", "modalTokenSecret", "modalEnvironment"]) {
    const declaration = imageProvider.indexOf(`const ${symbol} =`);
    const exposure = imageProvider.indexOf(`Boolean(${symbol})`);
    assert.ok(declaration >= 0, `${symbol} must be declared`);
    assert.ok(exposure > declaration, `${symbol} must be declared before provider metadata uses it`);
  }
});


test("customer and restaurant operational shells are source-level light", () => {
  for (const path of [
    "app/(system)/workspace/[organizationId]/customers/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/tables/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx",
    "app/(system)/workspace/[organizationId]/operations/pos/POSWorkspace.jsx",
    "app/(system)/workspace/[organizationId]/operations/pos/receipts/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/pos/RestaurantPaymentCorrections.jsx",
    "app/(system)/workspace/[organizationId]/operations/configuration/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/tables/configuration/page.jsx",
  ]) {
    const content = source(path);
    assert.doesNotMatch(content, /bg-black(?:\/|\b)|bg-\[#0[0-9A-Fa-f]{5}\]|border-white\/|text-white(?:\/|\b)|violet-|blue-/);
    assert.match(content, /#F7F6F3|bg-white|#D6A66A/);
  }
});


test("Healthcare workspace is source-level Avantiqo light", () => {
  const root = "app/(system)/workspace/[organizationId]/healthcare";
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
        assert.doesNotMatch(source(path), /bg-black(?:\/|\b)|border-white\/|text-white(?:\/|\b)|(?:bg|border|text|ring)-(?:blue|cyan|indigo|violet)-/);
      }
    }
  }
});


test("no non-Creative workspace page ships a dark full-screen shell", () => {
  const root = "app/(system)/workspace/[organizationId]";
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "creative") stack.push(path);
      } else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
        assert.doesNotMatch(source(path), /min-h-screen[^"\n]*(?:bg-black|bg-\[#0[0-9A-Fa-f]{5}\])/);
      }
    }
  }
});
