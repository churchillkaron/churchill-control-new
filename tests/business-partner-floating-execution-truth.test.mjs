import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("floating Avantiqo restores and renders evidence-driven execution state", () => {
  const floating = source("components/operator/AvantiqoOperator.jsx");

  assert.match(
    floating,
    /operatorExecutionStatePresentation/,
  );
  assert.match(
    floating,
    /execution:\s*turn\?\.execution\s*\|\|\s*\{\}/,
  );
  assert.match(
    floating,
    /evidence:\s*turn\?\.evidence\s*\|\|\s*\{\}/,
  );
  assert.match(
    floating,
    /governance:\s*operatorExecutionStatePresentation\(turn\)/,
  );
  assert.match(
    floating,
    /governance:\s*operatorExecutionStatePresentation\(result\)/,
  );
  assert.match(
    floating,
    /data-avantiqo-execution-state=\{message\.governance\.tone\}/,
  );
  assert.doesNotMatch(
    floating,
    /message\.execution\.status\s*===\s*"completed"\s*\?\s*"Executed"/,
  );
});

test("shared execution presenter distinguishes verified, blocked and checked completion", () => {
  const presenter = source(
    "lib/operator/presentation/OperatorExecutionStatePresentation.js",
  );

  assert.match(presenter, /label:\s*"Verified complete"/);
  assert.match(presenter, /label:\s*"Not completed"/);
  assert.match(presenter, /label:\s*"Completed check"/);
  assert.match(presenter, /label:\s*"Awaiting confirmation"/);
  assert.match(presenter, /label:\s*"Awaiting approval"/);
  assert.match(presenter, /authorization_effect:\s*"NONE"/);
});
