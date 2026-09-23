import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = "lib/operator/runtime";

test("every operator front-cognition call explicitly disables fast escalation", () => {
  for (const name of fs.readdirSync(root).filter((name) => name.endsWith(".js"))) {
    const file = path.join(root, name);
    const source = fs.readFileSync(file, "utf8");
    let offset = 0;
    while (true) {
      const start = source.indexOf("runOperatorFrontCognition({", offset);
      if (start < 0) break;
      const prefix = source.slice(Math.max(0, start - 40), start);
      if (/export\s+async\s+function\s*$/.test(prefix)) {
        offset = start + 1;
        continue;
      }
      const end = source.indexOf("});", start);
      assert.ok(end > start, `${file} has unterminated front cognition call`);
      const block = source.slice(start, end + 3);
      assert.match(block, /allow_fast_escalation: false/, `${file} front cognition call must be explicitly local-only`);
      offset = start + 1;
    }
  }
});
