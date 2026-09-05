import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

const platformRoute = await readFile(
  `app/(system)/workspace/${PLATFORM_ORGANIZATION_ID}/page.jsx`,
  "utf8",
);
const platformHome = await readFile(
  "components/platform/PlatformOwnerHome.jsx",
  "utf8",
);
const customerHome = await readFile(
  "app/(system)/workspace/[organizationId]/page.jsx",
  "utf8",
);

test("Avantiqo Platform organization has a dedicated owner cockpit", () => {
  assert.match(platformRoute, /PlatformOwnerHome/);
  assert.match(platformHome, new RegExp(PLATFORM_ORGANIZATION_ID));
  assert.match(platformHome, /data-avantiqo-platform-home="true"/);
  assert.match(platformHome, /\/api\/platform\/admin\/control/);
  assert.match(platformHome, /\/api\/platform\/admin\/profit/);
  assert.match(platformHome, /Needs action now/);
  assert.match(platformHome, /Customer organizations/);
  assert.match(platformHome, /Platform economics/);
  assert.match(platformHome, /Module coverage/);
  assert.match(platformHome, /BusinessPartnerCodeMissionPanel/);
  assert.match(platformHome, /HomeAvantiqoIntelligenceDock/);
});

test("customer organization Home remains on the business workspace", () => {
  assert.doesNotMatch(customerHome, /PlatformOwnerHome/);
  assert.match(customerHome, /My Business/);
  assert.match(customerHome, /Everything Avantiqo can operate/);
});
