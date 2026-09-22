import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manage = fs.readFileSync("app/api/accounting-firm/client-invitations/route.js", "utf8");
const invite = fs.readFileSync("app/api/accounting-firm/client-invitations/[token]/route.js", "utf8");
const accept = fs.readFileSync("app/api/accounting-firm/client-invitations/[token]/accept/route.js", "utf8");
const page = fs.readFileSync("app/accounting-client-invite/[token]/page.jsx", "utf8");
const login = fs.readFileSync("app/login/page.js", "utf8");
const callback = fs.readFileSync("app/login/callback/page.js", "utf8");

test("only an accounting-firm organization can issue client invitations", () => {
  assert.match(manage, /organization_type !== "accounting_firm"/);
  assert.match(manage, /Accounting firm organization required/);
});

test("accounting client invitations use opaque hashed expiring tokens", () => {
  assert.match(manage, /randomBytes\(32\)/);
  assert.match(manage, /token_hash:hash\(token\)/);
  assert.match(manage, /14\*24\*60\*60\*1000/);
});

test("client invitation eligibility is restricted to owner or admin memberships", () => {
  assert.match(invite, /ACCEPT_ROLES/);
  assert.match(invite, /organization_users/);
  assert.match(invite, /ACCEPT_ROLES\.has/);
  assert.match(invite, /organization_type!=="accounting_firm"/);
});

test("acceptance requires invited email and authority on the chosen client organization", () => {
  assert.match(accept, /user\.email.*invite\.client_email/s);
  assert.match(accept, /requireOrganizationAccess\(\{organizationId:clientOrganizationId,request\}\)/);
  assert.match(accept, /ACCEPT_ROLES\.has/);
  assert.match(accept, /client\.organization_type==="accounting_firm"/);
});

test("acceptance creates only the canonical organization_clients relationship", () => {
  assert.match(accept, /from\("organization_clients"\)\.upsert/);
  assert.doesNotMatch(accept, /staff_accounts/);
  assert.doesNotMatch(accept, /organization_users.*insert/s);
  assert.doesNotMatch(accept, /party_relationships/);
});

test("client owner chooses the organization in the acceptance UI", () => {
  assert.match(page, /eligibleOrganizations/);
  assert.match(page, /clientOrganizationId:selected/);
  assert.match(page, /Select your organization/);
});

test("accounting client invite return path is explicitly allow-listed", () => {
  assert.match(login, /next\.startsWith\("\/accounting-client-invite\/"\)/);
  assert.match(callback, /next\.startsWith\("\/accounting-client-invite\/"\)/);
});
