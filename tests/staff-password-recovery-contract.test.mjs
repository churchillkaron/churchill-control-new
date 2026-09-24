import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const login = read("app/login/page.js");
const activation = read("app/api/auth/activate/route.js");

assert.match(login, /supabase\.auth\.resetPasswordForEmail/);
assert.match(login, /new URL\("\/login", window\.location\.origin\)/);
assert.doesNotMatch(login, /result\.eligible/);
assert.doesNotMatch(login, /hostBrand\?\.id !== brand\.id/);
assert.match(login, /PASSWORD_RECOVERY/);
assert.match(login, /supabase\.auth\.updateUser\(\{ password \}\)/);

assert.match(activation, /resolveRecoveryOrganizationId/);
assert.match(activation, /requestPlatformHostname/);
assert.match(activation, /resolveRegisteredPlatformHostContext/);
assert.match(activation, /organizationIds\.length !== 1/);
assert.match(activation, /genericRecoveryResponse/);
assert.match(activation, /If this email has active staff access, a password link will be sent/);
assert.match(activation, /const scopedStaff = staff\.filter/);
assert.match(activation, /normalizeId\(row\.active_organization_id\) === organizationId/);
assert.match(activation, /const unlinkedStaffIds = scopedStaff/);
assert.doesNotMatch(activation, /eligible:\s*false/);
assert.doesNotMatch(activation, /eligible:\s*true/);
assert.doesNotMatch(activation, /brandId:/);
assert.doesNotMatch(activation, /organizationId,/);
assert.doesNotMatch(activation, /body\?\.organizationId/);
assert.doesNotMatch(activation, /resetPasswordForEmail/);
assert.doesNotMatch(activation, /NEXT_PUBLIC_APP_URL/);
assert.doesNotMatch(activation, /resolveRedirectOrigin/);

console.log("STAFF_PASSWORD_RECOVERY_CONTRACT=PASS");
