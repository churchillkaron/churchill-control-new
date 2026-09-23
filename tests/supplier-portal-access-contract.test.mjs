import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const invite = fs.readFileSync("app/api/supplier-portal/invitations/route.js", "utf8");
const accept = fs.readFileSync("app/api/supplier-portal/invitations/[token]/accept/route.js", "utf8");
const context = fs.readFileSync("app/api/supplier-portal/context/route.js", "utf8");
const login = fs.readFileSync("app/login/page.js", "utf8");
const callback = fs.readFileSync("app/login/callback/page.js", "utf8");
const registry = fs.readFileSync("lib/platform/registry/erpRegistry.base.js", "utf8");

test("supplier invitations use opaque tokens and persist only token hashes", () => {
  assert.match(invite, /randomBytes\(32\)/);
  assert.match(invite, /token_hash:hash\(token\)/);
  assert.doesNotMatch(invite, /token:\s*token[,}]/);
});

test("supplier acceptance is email-bound, expiring and one-time", () => {
  assert.match(accept, /invite\.status!=="PENDING"/);
  assert.match(accept, /new Date\(invite\.expires_at\)/);
  assert.match(accept, /user\.email.*invite\.email/s);
  assert.match(accept, /status:"ACCEPTED"/);
});

test("supplier acceptance writes supplier_portal_access and never organization_users", () => {
  assert.match(accept, /from\("supplier_portal_access"\)/);
  assert.doesNotMatch(accept, /organization_users/);
  assert.doesNotMatch(accept, /staff_accounts/);
});

test("supplier portal reads only access rows for authenticated supplier identity", () => {
  assert.match(context, /getServerCurrentUser/);
  assert.match(context, /from\("supplier_portal_access"\)/);
  assert.match(context, /eq\("auth_user_id", user\.id\)/);
  assert.match(context, /eq\("status", "ACTIVE"\)/);
});

test("supplier login return path is explicitly allow-listed", () => {
  assert.match(login, /next\.startsWith\("\/supplier-invite\/"\)/);
  assert.match(callback, /next\.startsWith\("\/supplier-invite\/"\)/);
  assert.match(callback, /router\.push\("\/supplier-portal"\)/);
});

test("supplier portal access is a first-class Supply Chain capability", () => {
  assert.match(registry, /id:\s*"supplier_portal_access"/);
  assert.match(registry, /route:\s*"\/procurement\/supplier-access"/);
});

test("supplier invitation creation resolves Party explicitly instead of relying on embedded schema-cache relationships", () => {
  const invitations = fs.readFileSync("app/api/supplier-portal/invitations/route.js", "utf8");
  assert.match(invitations, /from\("supplier_profiles"\)\.select\("id,organization_id,party_id,is_active,is_blocked"\)/);
  assert.match(invitations, /from\("parties"\)\.select\("id,organization_id,display_name,legal_name,email,status"\)/);
  assert.doesNotMatch(invitations, /supplier_profiles.*parties\(/s);
});

test("supplier access manager can repair canonical supplier email before inviting", () => {
  const invitations = fs.readFileSync("app/api/supplier-portal/invitations/route.js", "utf8");
  const workCenter = fs.readFileSync("components/workspace/supply-chain/SupplierPortalAccessWorkCenter.jsx", "utf8");
  assert.match(invitations, /action === "update_supplier_email"/);
  assert.match(invitations, /Enter a valid supplier email/);
  assert.match(workCenter, /Save email/);
  assert.match(workCenter, /update_supplier_email/);
});

test("supplier invitation UI blocks acceptance for a signed-in email mismatch", () => {
  const page = fs.readFileSync("app/supplier-invite/[token]/page.jsx", "utf8");
  assert.match(page, /const emailMatches=/);
  assert.match(page, /This invitation belongs to/);
  assert.match(page, /Sign out and use invited email/);
  assert.match(page, /emailMatches\?<>/);
});

test("public Supplier Portal supports invited, free-shop and business entry paths", () => {
  const page = fs.readFileSync("app/supplier-portal/page.jsx", "utf8");
  const workspace = fs.readFileSync("components/supplier/SupplierPortalWorkspace.jsx", "utf8");
  assert.match(page, /SupplierPortalWorkspace section="home"/);
  assert.match(workspace, /Sell through Avantiqo your way/);
  assert.match(workspace, /01 · Invited/);
  assert.match(workspace, /02 · Free Shop/);
  assert.match(workspace, /03 · Business/);
  assert.match(workspace, /Sign in or create account/);
});

test("supplier invitation rejects malformed canonical email before replacing pending invitations", () => {
  const invalidIndex = invite.indexOf("Supplier email is invalid");
  const revokeIndex = invite.indexOf('from("supplier_portal_invitations").update');
  assert.ok(invalidIndex >= 0 && revokeIndex > invalidIndex);
  assert.match(invite, /validEmail/);
});

test("supplier invitation is atomically claimed before access is created", () => {
  const acceptedAtIndex = accept.indexOf("const acceptedAt=");
  const claimIndex = accept.indexOf('.from("supplier_portal_invitations")', acceptedAtIndex);
  const accessIndex = accept.indexOf('.from("supplier_portal_access")', claimIndex);
  assert.ok(acceptedAtIndex >= 0 && claimIndex > acceptedAtIndex && accessIndex > claimIndex);
  assert.match(accept, /\.eq\("status","PENDING"\)/);
  assert.match(accept, /\.gt\("expires_at",acceptedAt\)/);
  assert.match(accept, /Invitation was already accepted, revoked or expired/);
});

test("supplier invitation acceptance compensates only its exact failed access attempt", () => {
  assert.match(accept, /status:"PENDING"/);
  assert.match(accept, /accepted_by_auth_user_id:null/);
  assert.match(accept, /accepted_at:null/);
  assert.match(accept, /\.eq\("accepted_by_auth_user_id",user\.id\)/);
  assert.match(accept, /\.eq\("accepted_at",acceptedAt\)/);
});
