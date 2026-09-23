import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/(system)/staff/layout.jsx", "utf8");
const home = fs.readFileSync("app/(system)/staff/page.jsx", "utf8");
const myDay = fs.readFileSync("app/(system)/staff/my-day/page.jsx", "utf8");
const navigation = fs.readFileSync("lib/people/portal/StaffPortalNavigationRuntime.js", "utf8");
const auth = fs.readFileSync("lib/auth/getServerCurrentUser.js", "utf8");

const requiredFiles = [
  "app/(system)/staff/documents/page.jsx",
  "app/(system)/staff/documents/upload/page.jsx",
  "app/(system)/staff/intake/page.jsx",
  "app/(system)/staff/profile/page.jsx",
  "app/api/staff/activation/route.js",
  "app/api/staff/navigation/route.js",
  "app/api/staff/quick-upload/route.js",
  "lib/people/portal/StaffPortalNavigationRuntime.js",
  "lib/people/workforce/StaffPasskeyBrokerClient.js",
];

test("customer-domain Staff Portal surface is present", () => {
  for (const file of requiredFiles) assert.equal(fs.existsSync(file), true, `missing ${file}`);
  assert.match(home, /bg-\[#F7F6F3\]/);
  assert.match(home, /Recent updates/i);
});

test("mobile dock preserves Home Work Camera Requests More", () => {
  assert.match(layout, /Staff mobile navigation/);
  assert.match(layout, />Home<|"Home"/);
  assert.match(layout, />Work<|"Work"/);
  assert.match(layout, />Requests<|"Requests"/);
  assert.match(layout, />More<|"More"/);
  assert.match(layout, /capture="environment"/);
  assert.match(layout, /\/api\/staff\/quick-upload/);
});

test("real Staff Portal My Day is industry-adaptive and GPS conditional", () => {
  assert.match(myDay, /job\.requiresLocationConfirmation \? await currentLocation\(\) : null/);
  assert.match(myDay, /job\.subjectLabel \|\| "Work"/);
  assert.match(myDay, /job\.subjectName \|\| job\.customerName/);
  assert.match(myDay, /Location proof is required only when the assignment or protocol needs it/);
});

test("staff navigation merges adaptive role operations", () => {
  assert.match(navigation, /resolveStaffOperationalSurface/);
  assert.match(navigation, /adaptiveOperational/);
  assert.match(navigation, /adaptive_role_context/);
});

test("server auth retries only retryable fetch failures once", () => {
  assert.match(auth, /AuthRetryableFetchError/);
  assert.match(auth, /setTimeout\(resolve, 150\)/);
  assert.match(auth, /const retry = await supabase\.auth\.getUser\(\)/);
});
