import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const helper = fs.readFileSync(new URL("../lib/people/portal/StaffApiError.js", import.meta.url), "utf8");
const activation = fs.readFileSync(new URL("../app/api/staff/activation/route.js", import.meta.url), "utf8");
const identity = fs.readFileSync(new URL("../app/api/staff/identity-verification/route.js", import.meta.url), "utf8");
const permit = fs.readFileSync(new URL("../app/api/staff/work-permit/route.js", import.meta.url), "utf8");
const phone = fs.readFileSync(new URL("../app/api/staff/phone-verification/route.js", import.meta.url), "utf8");
const camera = fs.readFileSync(new URL("../app/api/staff/quick-upload/route.js", import.meta.url), "utf8");

test("staff API error boundary preserves bounded client errors but hides unexpected backend messages", () => {
  assert.match(helper, /status >= 400 && status < 500/);
  assert.match(helper, /String\(error\?\.message \|\| fallback\).*slice\(0, 300\)/s);
  assert.match(helper, /: fallback;/);
  assert.match(helper, /status: status \|\| 500/);
  assert.match(helper, /code: status \? safeCode\(error\?\.code\) : null/);
});

test("sensitive Staff onboarding and upload routes use the shared public error boundary", () => {
  for (const source of [activation, identity, permit, phone, camera]) {
    assert.match(source, /staffApiErrorResponse/);
  }
  assert.doesNotMatch(activation, /error:\s*error\?\.message/);
  assert.doesNotMatch(identity, /error:\s*error\?\.message/);
  assert.doesNotMatch(permit, /error:\s*error\?\.message/);
  assert.doesNotMatch(phone, /error:\s*error\?\.message/);
  assert.doesNotMatch(camera, /return NextResponse\.json\(\{ success: false, error: error\?\.message/);
});
