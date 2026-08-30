import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Business Partner home never mounts passive local wake listening", async () => {
  const shell = await source("components/platform/PlatformShell.jsx");
  assert.match(shell, /usePathname/);
  assert.match(shell, /businessPartnerHome\s*=\s*\/\^\\\/workspace\\\/\[\^\/\]\+\\\/?\$\//);
  assert.match(
    shell,
    /!secretaryMeetingCaptureActive\s*&&\s*!businessPartnerHome\s*\?\s*\(\s*<LocalHeyAvantiqoWakeBridge\s*\/>/s,
  );
});
