import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schedule = fs.readFileSync("app/(system)/staff/schedule/page.jsx", "utf8");
const documents = fs.readFileSync("app/(system)/staff/documents/page.jsx", "utf8");
const training = fs.readFileSync("app/(system)/staff/training/page.jsx", "utf8");
const trainingApi = fs.readFileSync("app/api/staff/training/route.js", "utf8");
const navigation = fs.readFileSync("lib/people/portal/StaffPortalNavigationRuntime.js", "utf8");

test("staff Schedule is backed by profile-overview upcoming roster", () => {
  assert.match(schedule, /fetch\("\/api\/staff\/profile-overview"/);
  assert.match(schedule, /profile\?\.upcomingSchedules \|\| \[\]/);
  assert.match(schedule, /My Schedule/);
});

test("staff Documents is a real governed personal-record surface", () => {
  assert.match(documents, /My Documents/);
  assert.match(documents, /\/api\/staff\/documents/);
  assert.match(documents, /Only documents owned by you/i);
});

test("staff Training reads People-owned qualifications and remains read only", () => {
  assert.match(training, /fetch\("\/api\/staff\/training"/);
  assert.match(training, /People authority/i);
  assert.match(training, /cannot self-verify credentials/i);
  assert.match(trainingApi, /from\("staff_qualifications"\)/);
  assert.match(trainingApi, /from\("people_qualification_catalog"\)/);
  assert.match(trainingApi, /eq\("staff_id", staff\.id\)/);
  assert.doesNotMatch(trainingApi, /export async function POST/);
});

test("Schedule and Training are part of standard Staff navigation", () => {
  assert.match(navigation, /key: "schedule".*href: "\/staff\/schedule"/);
  assert.match(navigation, /key: "training".*href: "\/staff\/training"/);
});

test("Training fails safe when qualification authority migration is not provisioned", () => {
  assert.match(trainingApi, /relationMissing/);
  assert.match(trainingApi, /PGRST205/);
  assert.match(trainingApi, /configured: false/);
  assert.match(trainingApi, /20260906182500_people_service_qualification_authority/);
  assert.match(training, /Qualification authority is not provisioned in this environment yet/);
  assert.doesNotMatch(training, /schema cache/i);
});
