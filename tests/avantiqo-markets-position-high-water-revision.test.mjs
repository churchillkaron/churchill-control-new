import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketAutonomousPaperRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919025306_markets_position_high_water_execution_revision.sql", import.meta.url),
  "utf8",
);

test("position high-water ratchet locks account and position", () => {
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for update/,
  );
  assert.match(
    migration,
    /from public\.market_paper_positions[\s\S]*?for update/,
  );
});

test("only a genuine ratchet advances execution revision", () => {
  assert.match(
    migration,
    /if p_high_water_price > coalesce\(v_position\.high_water_price, 0\) then[\s\S]*?high_water_price = p_high_water_price[\s\S]*?execution_revision = execution_revision \+ 1/,
  );
});

test("position ratchet RPC is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_raise_paper_position_high_water[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_raise_paper_position_high_water[\s\S]*?to service_role/,
  );
});

test("autonomous protective exits use governed ratchet RPC", () => {
  assert.match(runtime, /market_raise_paper_position_high_water/);
  assert.doesNotMatch(
    runtime,
    /\.from\("market_paper_positions"\)[\s\S]{0,400}?\.update\s*\(/,
  );
});

test("runtime carries returned revision forward after a ratchet", () => {
  assert.match(runtime, /highWaterPromotion\?\.promoted === true/);
  assert.match(runtime, /state\.account\.execution_revision = number/);
});
