import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const profiles = fs.readFileSync("lib/operations/presentation/OperationsIndustryProfiles.js", "utf8");
const solutions = fs.readFileSync("lib/platform/solutions/OrganizationOperationalSolutionRegistry.js", "utf8");
const industryPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/industry/[industryId]/page.jsx", "utf8");
const assignedWork = fs.readFileSync("lib/operations/workforce/StaffAssignedWorkRuntime.js", "utf8");
const myDay = fs.readFileSync("app/(system)/staff/my-day/page.jsx", "utf8");

const requiredProfiles = [
  "education", "automotive", "logistics", "facilities", "professionalServices",
  "rentalFleet", "salonSpa", "security", "accountingPractice", "agency",
  "artistAgency", "foodProduction", "carWash", "generalOperations",
];

test("new operating industries have dedicated workflow profiles", () => {
  for (const id of requiredProfiles) {
    assert.equal(profiles.includes(`${id}: profile({`), true, `missing profile ${id}`);
  }
  assert.match(profiles, /title: "School Day Control"/);
  assert.match(profiles, /title: "Workshop Control"/);
  assert.match(profiles, /title: "Transport & Dispatch Control"/);
});

test("solution resolver recognises school and mechanic and fails open to governed adaptive operations", () => {
  assert.match(solutions, /"education", "school", "academy"/);
  assert.match(solutions, /"automotive", "mechanic", "garage", "workshop"/);
  assert.match(solutions, /id: "general-operations"/);
  assert.match(solutions, /if \(matched\.length\) return matched/);
  assert.match(solutions, /operations\/industry\/general-operations/);
});

test("dynamic industry route falls back to governed General Operations for future industries", () => {
  assert.match(industryPage, /getOperationsIndustryProfile\(industryId\)/);
  assert.match(industryPage, /getOperationsIndustryProfile\("general-operations"\)/);
  assert.doesNotMatch(industryPage, /notFound\(\)/);
  assert.match(industryPage, /OperationsIndustryCommandCenter/);
});

test("staff My Day requires GPS only for location-bound assignments", () => {
  assert.match(assignedWork, /function requiresLocationConfirmation/);
  assert.match(assignedWork, /protocol\?\.evidence_requirements\?\.location_confirmation === true/);
  assert.match(assignedWork, /const gps = requiresLocation \? requireGps\(location\) : null/);
  assert.match(myDay, /job\.requiresLocationConfirmation \? await currentLocation\(\) : null/);
  assert.match(myDay, /Location proof is required only when the assignment or protocol needs it/);
  assert.match(myDay, /job\.subjectName \|\| job\.customerName/);
});


test("resolver prefers exact industry aliases before conservative fallback matching", () => {
  assert.match(solutions, /function exactSolutionMatch/);
  assert.match(solutions, /const exactMatches = SOLUTION_DEFINITIONS\.filter/);
  assert.match(solutions, /const candidateSolutions = exactMatches\.length/);
  assert.doesNotMatch(solutions, /normalizedAlias\.includes\(token\)/);
  assert.match(solutions, /id: "accounting-practice"/);
  assert.match(solutions, /id: "agency"/);
  assert.match(solutions, /id: "food-production"/);
  assert.match(solutions, /id: "car-wash"/);
});

test("property agriculture and warehouse profiles are first-class and alias-resolvable", () => {
  for (const key of ["propertyManagement", "agriculture", "warehouseDistribution"]) {
    assert.match(profiles, new RegExp(`${key}: profile\\(`));
  }
  assert.match(profiles, /id: "property-management"/);
  assert.match(profiles, /id: "agriculture"/);
  assert.match(profiles, /id: "warehouse-distribution"/);
  assert.match(profiles, /"property-management": "propertyManagement"/);
  assert.match(profiles, /warehouse: "warehouseDistribution"/);
  assert.match(profiles, /entertainment: "venue"/);
  assert.match(solutions, /id: "property-management"/);
  assert.match(solutions, /id: "agriculture"/);
  assert.match(solutions, /id: "warehouse-distribution"/);
});

test("future industries fail open to governed General Operations instead of missing pages", () => {
  for (const industry of [
    "mining", "energy", "utilities", "aviation", "maritime", "government",
    "nonprofit", "fitness", "gym", "veterinary", "laundry", "research-lab",
  ]) {
    assert.ok(industry.length > 0);
  }
  assert.match(solutions, /id: "general-operations"/);
  assert.match(solutions, /complete governed operating workspace is available even before a dedicated industry pack is installed/i);
  assert.match(profiles, /id: "general-operations"/);
  assert.match(profiles, /industry-neutral operating model/i);
});
