import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);

test("manual decision evidence is server-resolved inside organization portfolio and symbol scope", () => {
  assert.match(
    route,
    /from\("market_evidence_events"\)[\s\S]*?eq\("organization_id", organizationId\)[\s\S]*?eq\("portfolio_id", portfolioId\)[\s\S]*?eq\("symbol", symbol\)[\s\S]*?in\("id", requestedEvidenceIds\)/,
  );
  assert.match(
    route,
    /from\("market_agent_theses"\)[\s\S]*?eq\("organization_id", organizationId\)[\s\S]*?eq\("portfolio_id", portfolioId\)[\s\S]*?eq\("symbol", symbol\)[\s\S]*?in\("id", requestedThesisIds\)/,
  );
});

test("manual executable decisions require evidence or thesis lineage", () => {
  assert.match(
    route,
    /\["BUY", "SELL"\]\.includes\(action\)[\s\S]*?requestedEvidenceIds\.length === 0[\s\S]*?requestedThesisIds\.length === 0[\s\S]*?Executable manual decisions require validated evidence or thesis lineage/,
  );
});

test("manual decision persistence uses validated references rather than raw caller arrays", () => {
  assert.match(route, /evidence_ids: validatedEvidenceIds/);
  assert.match(route, /evidence_refs: evidenceRefs/);
  assert.match(route, /thesis_ids: validatedThesisIds/);
});
