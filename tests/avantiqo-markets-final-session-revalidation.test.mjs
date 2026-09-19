import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("PAPER fill performs final authoritative session revalidation after risk", () => {
  const riskIndex = runtime.indexOf("const riskRevalidation = {");
  const finalSessionIndex = runtime.indexOf("const finalSessionSafety = await MarketSessionSafetyRuntime.evaluate");
  const rpcIndex = runtime.indexOf('rpc("market_apply_paper_fill_with_quality"');
  assert.ok(riskIndex >= 0 && riskIndex < finalSessionIndex);
  assert.ok(finalSessionIndex < rpcIndex);
});

test("final session recheck fails closed before mutation", () => {
  assert.match(runtime, /FINAL_MARKET_SESSION_INELIGIBLE/);
  assert.match(
    runtime,
    /if \(!finalSessionSafety\.approved\)[\s\S]*?return \{[\s\S]*?FINAL_MARKET_SESSION_INELIGIBLE/,
  );
});

test("final session evidence seals clock and asset provenance", () => {
  assert.match(runtime, /final_session_revalidation/);
  assert.match(runtime, /clock_timestamp: finalSessionSafety\.clock\?\.timestamp/);
  assert.match(runtime, /clock_provenance: finalSessionSafety\.clock\?\.provenance/);
  assert.match(runtime, /asset_id: finalSessionSafety\.asset\?\.id/);
  assert.match(runtime, /asset_status: finalSessionSafety\.asset\?\.status/);
  assert.match(runtime, /asset_tradable: finalSessionSafety\.asset\?\.tradable === true/);
});
