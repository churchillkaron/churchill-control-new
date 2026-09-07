import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const login = read("app/login/page.js");
const activation = read("app/api/auth/activate/route.js");

assert.match(login, /supabase\.auth\.resetPasswordForEmail/);
assert.match(login, /new URL\("\/login", window\.location\.origin\)/);
assert.match(login, /if \(!result\.eligible\)/);
assert.match(login, /hostBrand\?\.id !== brand\.id/);
assert.match(login, /PASSWORD_RECOVERY/);
assert.match(login, /supabase\.auth\.updateUser\(\{ password \}\)/);

assert.match(activation, /resolveRecoveryOrganizationId/);
assert.match(activation, /requestPlatformHostname/);
assert.match(activation, /resolvePlatformHostContext/);
assert.match(activation, /organizationIds\.length !== 1/);
assert.match(activation, /organizationId,/);
assert.match(activation, /brandId:\s*recoveryBrandId\(organizationId\)/);
assert.match(activation, /eligible:\s*false/);
assert.match(activation, /eligible:\s*true/);
assert.doesNotMatch(activation, /body\?\.organizationId/);
assert.doesNotMatch(activation, /resetPasswordForEmail/);
assert.doesNotMatch(activation, /NEXT_PUBLIC_APP_URL/);
assert.doesNotMatch(activation, /resolveRedirectOrigin/);

console.log("STAFF_PASSWORD_RECOVERY_CONTRACT=PASS");
