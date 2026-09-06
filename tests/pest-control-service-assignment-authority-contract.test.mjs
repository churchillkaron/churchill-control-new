import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const commandRoute = read("app/api/operations/[capabilityId]/commands/[command]/route.js");
const candidateRoute = read("app/api/service-management/assignment-candidates/route.js");
const preferredRuntime = read("lib/operations/workforce/ServicePreferredAssignmentRuntime.js");
const qualificationRuntime = read("lib/people/workforce/qualificationRuntime.js");
const serviceTemplate = read("lib/service-management/documents/ServiceExecutionTemplate.js");
const servicePlanRuntime = read("lib/service-management/runtime/ServicePlanRuntime.js");
const migration = read("supabase/migrations/20260906182500_people_service_qualification_authority.sql");

test("service assignment fails closed on People qualification and availability authority", () => {
  assert.match(commandRoute, /SERVICE_ASSIGNMENT_PERSON_UNQUALIFIED/);
  assert.match(commandRoute, /SERVICE_QUALIFICATION_REQUIREMENT_NOT_CONFIGURED/);
  assert.match(commandRoute, /SERVICE_ASSIGNMENT_PERSON_UNAVAILABLE/);
  assert.match(commandRoute, /SERVICE_ASSIGNMENT_OUTSIDE_PUBLISHED_SHIFT/);
  assert.match(commandRoute, /loadQualificationEvidence/);
  assert.match(commandRoute, /loadAvailabilityForScheduleRange/);
  assert.match(commandRoute, /assignment_workforce_evidence/);
});

test("candidate projection exposes the same hard constraints before a human assigns", () => {
  assert.match(candidateRoute, /BLOCKED_UNQUALIFIED/);
  assert.match(candidateRoute, /BLOCKED_QUALIFICATION_CONFIG/);
  assert.match(candidateRoute, /BLOCKED_UNAVAILABLE/);
  assert.match(candidateRoute, /BLOCKED_OUTSIDE_SHIFT/);
  assert.match(candidateRoute, /selectable: !dispatchReadiness\.startsWith\("BLOCKED_"\)/);
  assert.match(candidateRoute, /preferred/);
});

test("preferred technician automation cannot bypass qualification or workforce controls", () => {
  assert.match(preferredRuntime, /preferredAssignmentReadiness/);
  assert.match(preferredRuntime, /preferred-technician-unqualified/);
  assert.match(preferredRuntime, /preferred-technician-unavailable/);
  assert.match(preferredRuntime, /preferred-technician-outside-published-shift/);
  assert.match(preferredRuntime, /qualification-requirement-not-configured/);
  assert.match(preferredRuntime, /assignment_workforce_evidence/);
});

test("service protocol snapshots immutable qualification requirements into generated visits", () => {
  assert.match(serviceTemplate, /required_qualification_codes/);
  assert.match(servicePlanRuntime, /required_qualification_codes: Array\.isArray\(template\.required_qualification_codes\)/);
  assert.match(servicePlanRuntime, /execution_protocol: protocol/);
});

test("qualification authority is People-owned and validity-aware", () => {
  assert.match(migration, /create table if not exists public\.people_qualification_catalog/);
  assert.match(migration, /create table if not exists public\.staff_qualifications/);
  assert.match(migration, /valid_until date/);
  assert.match(migration, /revoke all on table public\.staff_qualifications from public, anon, authenticated/);
  assert.match(qualificationRuntime, /row\?\.valid_until/);
  assert.match(qualificationRuntime, /REQUIREMENT_NOT_CONFIGURED/);
  assert.match(qualificationRuntime, /MISSING/);
  assert.match(qualificationRuntime, /QUALIFIED/);
});
