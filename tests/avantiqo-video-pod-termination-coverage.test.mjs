import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, ROOT), "utf8");

function assertEveryDeleteIsConfirmed(body, label) {
  const deletes = [...body.matchAll(/await deleteVideoPod\(/g)];
  assert.ok(deletes.length > 0, `${label} must contain Pod deletion paths`);

  for (const deletion of deletes) {
    const tail = body.slice(deletion.index, deletion.index + 700);
    assert.match(
      tail,
      /await confirmAvantiqoVideoPodTerminal\(/,
      `${label} delete path at offset ${deletion.index} must confirm terminal state before ownership can move on`,
    );
  }
}

test("normal Video Pod ownership is never released after an unconfirmed delete", async () => {
  const runtime = await read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js");
  assert.match(runtime, /import \{ confirmAvantiqoVideoPodTerminal \} from "\.\/AvantiqoVideoPodTermination\.js";/);
  assertEveryDeleteIsConfirmed(runtime, "normal Video runtime");
});

test("FlashVSR shared-volume ownership is never released after an unconfirmed A100 delete", async () => {
  const runtime = await read("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrPodRuntime.js");
  assert.match(runtime, /import \{ confirmAvantiqoVideoPodTerminal \} from "\.\/AvantiqoVideoPodTermination\.js";/);
  assertEveryDeleteIsConfirmed(runtime, "FlashVSR runtime");
});
