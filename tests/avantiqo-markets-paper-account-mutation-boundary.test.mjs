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

test("application code cannot directly update PAPER account economic state", () => {
  const offenders = [];
  for (const base of ["app", "lib"]) {
    const directory = path.join(root, base);
    for (const file of javascriptFiles(directory)) {
      const source = fs.readFileSync(file, "utf8");
      const directUpdate = /\.from\(["']market_paper_accounts["']\)[\s\S]{0,500}?\.update\s*\(/g;
      if (directUpdate.test(source)) {
        offenders.push(path.relative(root, file));
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "PAPER account economic mutations must go through governed database RPCs that advance execution_revision",
  );
});

test("current governed economic mutation migrations all advance execution revision", () => {
  const fills = fs.readFileSync(
    path.join(root, "supabase/migrations/20260919012246_markets_daily_equity_revision_fence.sql"),
    "utf8",
  );
  const corporateActions = fs.readFileSync(
    path.join(root, "supabase/migrations/20260919011319_markets_corporate_adjustment_execution_revision.sql"),
    "utf8",
  );

  assert.match(fills, /execution_revision = execution_revision \+ 1/);
  assert.match(corporateActions, /execution_revision = execution_revision \+ 1/);
});
