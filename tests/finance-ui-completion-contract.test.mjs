import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const financePage = read("app/(system)/workspace/[organizationId]/finance/page.jsx");
const overview = read("components/workspace/finance/FinanceAccountantOverview.jsx");
const clientDependencyRail = read("components/workspace/finance/FinanceClientDependencyRail.jsx");
const areaHub = read("components/workspace/finance/FinanceAreaHub.jsx");
const shellNavigation = read("components/workspace/finance/FinanceShellNavigation.jsx");
const informationArchitecture = read("lib/finance/ui/FinanceInformationArchitecture.js");
const presentationPolicy = read("lib/finance/ui/FinanceCapabilityPresentation.js");
const registryBase = read("lib/platform/registry/erpRegistry.base.js");
const runtimeManifest = JSON.parse(read("lib/finance/runtime/financeCapabilityRuntimeManifest.json"));

test("Finance landing page is work-first rather than a KPI card dashboard", () => {
  assert.match(financePage, /FinanceAccountantOverview/);
  assert.doesNotMatch(financePage, /FinanceCommandCenter/);
  assert.match(overview, /What needs attention now/);
  assert.match(overview, /Recommended next human action/);
  assert.match(overview, /Priority work/);
  assert.match(overview, /Control state/);
  assert.match(overview, /Accounting context, not a dashboard/);
  assert.doesNotMatch(overview, /MetricCard/);
  assert.doesNotMatch(overview, /Practice pulse/);
  assert.doesNotMatch(overview, /grid-cols-2 gap-2 md:grid-cols-4/);
});

test("Finance client dependencies stay a work list instead of becoming KPI cards", () => {
  assert.match(clientDependencyRail, /Client dependencies/);
  assert.match(clientDependencyRail, /need action/);
  assert.match(clientDependencyRail, /follow-up due/);
  assert.match(clientDependencyRail, /do not chase/);
  assert.match(clientDependencyRail, /Client \/ request/);
  assert.match(clientDependencyRail, /Next safe action/);
  assert.doesNotMatch(clientDependencyRail, /DependencyMetric/);
  assert.doesNotMatch(clientDependencyRail, /grid-cols-4 gap/);
});

test("Finance areas use one explicit accountant information architecture, never keyword guessing", () => {
  assert.match(informationArchitecture, /REPORT_CAPABILITIES/);
  assert.match(informationArchitecture, /CONFIGURE_CAPABILITIES/);
  assert.match(informationArchitecture, /DEDICATED_CAPABILITIES/);
  assert.match(informationArchitecture, /"period_close"/);
  assert.match(informationArchitecture, /"year_end"/);
  assert.match(informationArchitecture, /"financial_health"/);
  assert.match(informationArchitecture, /"ai_insights"/);
  assert.match(areaHub, /resolveFinanceCapabilitySection\(item\.id\) !== area/);
  assert.doesNotMatch(areaHub, /REPORT_WORDS/);
  assert.doesNotMatch(areaHub, /CONFIGURE_WORDS/);
});

test("Finance top navigation uses the same explicit route truth", () => {
  assert.match(shellNavigation, /resolveFinanceNavigationSection\(pathname\)/);
  assert.doesNotMatch(shellNavigation, /function activeSection/);
  assert.match(informationArchitecture, /financePath\.startsWith\("\/finance\/year-end"\)/);
  assert.match(informationArchitecture, /"\/finance\/health"/);
  assert.match(informationArchitecture, /"\/finance\/insights"/);
  assert.match(informationArchitecture, /"\/finance\/organization-profile"/);
  assert.match(informationArchitecture, /"\/finance\/approval-workflows"/);
});

test("Every stale Finance planned declaration is runtime-backed and converges before presentation", () => {
  const financeStart = registryBase.indexOf("\n    finance: {");
  const financeEnd = registryBase.indexOf("\n    services: {", financeStart);
  assert.ok(financeStart >= 0 && financeEnd > financeStart, "Finance registry block must be found");

  const financeRegistry = registryBase.slice(financeStart, financeEnd);
  const plannedIds = [...financeRegistry.matchAll(/id:\s*"([^"]+)"[^\n]*status:\s*"planned"/g)]
    .map((match) => match[1]);

  assert.ok(plannedIds.length >= 20, `Expected legacy Finance planned declarations, found ${plannedIds.length}`);
  for (const capabilityId of plannedIds) {
    assert.ok(runtimeManifest[capabilityId], `${capabilityId} is still planned without a Finance runtime definition`);
  }

  assert.match(presentationPolicy, /runtimeBacked && declaredStatus\.toLowerCase\(\) === "planned"/);
  assert.match(presentationPolicy, /\? "active"/);
  assert.match(presentationPolicy, /item\.status = readiness\.effectiveStatus/);
  assert.match(areaHub, /"planned", "blocked", "disabled", "unavailable"/);
});

test("Finance runtime coverage remains complete enough for the accountant surface", () => {
  const runtimeIds = Object.keys(runtimeManifest);
  assert.ok(runtimeIds.length >= 60);
  assert.equal(new Set(runtimeIds).size, runtimeIds.length);
  assert.match(informationArchitecture, /return "books"/);
});
