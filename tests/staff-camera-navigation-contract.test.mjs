import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const layout = fs.readFileSync("app/(system)/staff/layout.jsx", "utf8");
const quickUpload = fs.readFileSync("app/api/staff/quick-upload/route.js", "utf8");

test("real staff mobile dock keeps Camera as the center primary action", () => {
  assert.match(layout, /Staff mobile navigation/);
  assert.match(layout, /aria-label="Open camera and upload"/);
  assert.match(layout, /capture="environment"/);
  assert.match(layout, /accept="image\/\*,application\/pdf"/);
  assert.match(layout, /\/api\/staff\/quick-upload/);
});

test("real staff dock preserves Home Work Camera Requests More", () => {
  assert.match(layout, /Home/);
  assert.match(layout, /Work/);
  assert.match(layout, /Camera/);
  assert.match(layout, /Requests/);
  assert.match(layout, /More/);
});

test("quick camera upload stays governed and routed through staff intake", () => {
  assert.match(quickUpload, /resolveAuthenticatedStaffContext/);
  assert.match(quickUpload, /StaffUploadSecurity|classif|routing|destination/i);
});
