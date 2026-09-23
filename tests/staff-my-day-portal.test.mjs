import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/(system)/staff/my-day/page.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/staff/my-day/route.js", import.meta.url), "utf8");
const evidence = fs.readFileSync(new URL("../app/api/staff/my-day/evidence/route.js", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../lib/operations/workforce/StaffAssignedWorkRuntime.js", import.meta.url), "utf8");
const nav = fs.readFileSync(new URL("../lib/people/portal/StaffPortalNavigationRuntime.js", import.meta.url), "utf8");

test("staff My Day exposes only assigned work in the standard portal navigation", () => {
  assert.match(nav, /key: "my-day"/);
  assert.match(nav, /href: "\/staff\/my-day"/);
  assert.match(route, /listAssignedWorkForStaff/);
  assert.match(runtime, /\.eq\("assigned_to", staffId\)/);
});

test("staff My Day requires active shift and GPS before assigned-work mutations", () => {
  assert.match(route, /if \(!workday\.openShift\)/);
  assert.match(runtime, /requireGps/);
  assert.match(page, /navigator\.geolocation/);
  assert.match(page, /Start your shift before starting or completing assigned work/);
});

test("staff My Day browser response excludes raw staff and workday rows", () => {
  assert.match(route, /shiftActive: Boolean\(workday\.openShift\)/);
  assert.doesNotMatch(route, /staff: context\.staff/);
  assert.doesNotMatch(route, /activeShift: workday\.openShift/);
  assert.doesNotMatch(route, /schedule: workday\.schedule/);
  assert.doesNotMatch(route, /partyId: context\.staff\.party_id/);
  assert.doesNotMatch(route, /success: true,\s*\.\.\.result/);
});

test("staff My Day renders and submits governed completion protocols and evidence", () => {
  assert.match(page, /executionProtocol/);
  assert.match(page, /field_schema/);
  assert.match(page, /before_photos/);
  assert.match(page, /after_photos/);
  assert.match(page, /customer_signature/);
  assert.match(page, /technician_signature/);
  assert.match(page, /\/api\/staff\/my-day\/evidence/);
  assert.match(evidence, /\.eq\("assigned_to", context\.staff\.id\)/);
  assert.match(runtime, /recordStaffCompletionEvidence/);
});


test("staff completion evidence is stored privately instead of exposing public upload URLs", () => {
  const evidence = fs.readFileSync(new URL("../app/api/staff/my-day/evidence/route.js", import.meta.url), "utf8");
  assert.match(evidence, /const BUCKET = "service-evidence"/);
  assert.match(evidence, /storage:\/\//);
  assert.match(evidence, /private: true/);
  assert.doesNotMatch(evidence, /getPublicUrl/);
  assert.match(evidence, /ALLOWED_TYPES/);
  assert.match(evidence, /assertStaffUploadSignature/);
  assert.doesNotMatch(evidence, /bucket: BUCKET/);
  assert.doesNotMatch(evidence, /storage_path: storagePath/);
});
