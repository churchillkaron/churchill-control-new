import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const commandCenter = await readFile(
  new URL("../components/workspace/operations/OperationsIndustryCommandCenter.jsx", import.meta.url),
  "utf8",
);
const profile = await readFile(
  new URL("../lib/operations/presentation/PestControlOperationsProfile.js", import.meta.url),
  "utf8",
);
const people = await readFile(
  new URL("../components/workspace/people/PeopleCommandCenter.jsx", import.meta.url),
  "utf8",
);

test("industry command center uses profile-owned capability routing for live rows", () => {
  assert.match(commandCenter, /profile\?\.capabilityRoutes\?\.\[capabilityId\]/);
  assert.match(commandCenter, /capabilityHref\(organizationId, profile, item\.capability_id\)/);
});

test("Pest Control live capabilities route to governed Pest workspaces", () => {
  assert.match(profile, /"work-orders": "\/operations\/field-service\/work-control"/);
  assert.match(profile, /equipment: "\/operations\/field-service\/monitoring-points"/);
  assert.match(profile, /activities: "\/operations\/field-service\/monitoring-rounds"/);
  assert.match(profile, /"completion-evidence": "\/operations\/completion-evidence"/);
  assert.match(profile, /"corrective-actions": "\/operations\/field-service\/corrective-control"/);
});

test("People command center keeps qualifications one click away", () => {
  assert.match(people, /label: "Qualifications", route: "\/people\/qualifications"/);
});
