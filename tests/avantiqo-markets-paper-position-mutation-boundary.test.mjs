import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function javascriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(full));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("application code cannot directly update PAPER positions", () => {
  const offenders = [];
  for (const base of ["app", "lib"]) {
    for (const file of javascriptFiles(path.join(root, base))) {
      const source = fs.readFileSync(file, "utf8");
      if (/\.from\(["']market_paper_positions["']\)[\s\S]{0,500}?\.update\s*\(/.test(source)) {
        offenders.push(path.relative(root, file));
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "PAPER position mutations must use governed database mutation paths",
  );
});

test("runtime position high-water mutation advances account execution revision", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260919025306_markets_position_high_water_execution_revision.sql"),
    "utf8",
  );
  assert.match(migration, /update public\.market_paper_positions/);
  assert.match(migration, /execution_revision = execution_revision \+ 1/);
});

test("corporate-action position mutation advances account execution revision", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260919011319_markets_corporate_adjustment_execution_revision.sql"),
    "utf8",
  );
  assert.match(migration, /update public\.market_paper_positions/);
  assert.match(migration, /execution_revision = execution_revision \+ 1/);
});

test("risk-policy protection refresh advances account execution revision", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260919032127_markets_protection_refresh_execution_revision.sql"),
    "utf8",
  );
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for update/,
  );
  assert.match(migration, /update public\.market_paper_positions/);
  assert.match(
    migration,
    /if v_count > 0 then[\s\S]*?execution_revision = execution_revision \+ 1/,
  );
});

test("protection refresh RPC remains service-role only", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260919032127_markets_protection_refresh_execution_revision.sql"),
    "utf8",
  );
  assert.match(
    migration,
    /revoke all on function public\.market_refresh_portfolio_paper_protection[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_refresh_portfolio_paper_protection[\s\S]*?to service_role/,
  );
});
