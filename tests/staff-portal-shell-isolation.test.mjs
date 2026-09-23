import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync(new URL("../components/platform/PlatformShell.jsx", import.meta.url), "utf8");
const staffLayout = fs.readFileSync(new URL("../app/(system)/staff/layout.jsx", import.meta.url), "utf8");
const navRuntime = fs.readFileSync(new URL("../lib/people/portal/StaffPortalNavigationRuntime.js", import.meta.url), "utf8");

test("staff portal exits the global platform shell before workspace chrome and assistant bridges mount", () => {
  assert.match(shell, /const staffPortal = \/\^\\\/staff/);
  assert.match(shell, /if \(staffPortal\) \{[\s\S]*return \([\s\S]*\{children\}/);
  const staffBranch = shell.indexOf("if (staffPortal)");
  const topBar = shell.indexOf("<WorkspaceTopBar />");
  const secretary = shell.indexOf("<SecretaryMeetingPresenceBridge />");
  const wake = shell.indexOf("<LocalHeyAvantiqoWakeBridge />");
  assert.ok(staffBranch >= 0 && topBar > staffBranch && secretary > staffBranch && wake > staffBranch);
});

test("staff portal navigation contains no Secretary or global assistant item", () => {
  assert.doesNotMatch(navRuntime, /label:\s*"Secretary"/i);
  assert.doesNotMatch(navRuntime, /label:\s*"Ask Avantiqo"/i);
  assert.match(staffLayout, /Staff mobile navigation/);
  assert.match(staffLayout, /mobileMenuOpen/);
});
