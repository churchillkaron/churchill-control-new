import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/developer/DeveloperPortalRuntime.js", "utf8");
const invite = fs.readFileSync("app/api/developers/access/invitations/route.js", "utf8");
const accept = fs.readFileSync("app/api/developers/access/invitations/[token]/accept/route.js", "utf8");
const orgs = fs.readFileSync("app/api/developers/access/organizations/route.js", "utf8");
const shell = fs.readFileSync("components/platform/PlatformShell.jsx", "utf8");
const portalShell = fs.readFileSync("components/workspace/developer/DeveloperPortalShell.jsx", "utf8");
const login = fs.readFileSync("app/login/page.js", "utf8");
const callback = fs.readFileSync("app/login/callback/page.js", "utf8");

test("external developer access is a separate authority from staff membership", () => {
  assert.match(runtime, /from\("developer_portal_access"\)/);
  assert.match(runtime, /externalDeveloper:true/);
  assert.match(runtime, /staff:null/);
  assert.match(runtime, /membership:null/);
});

test("developer invite acceptance never creates staff, employee or organization membership", () => {
  assert.match(accept, /from\("developer_portal_access"\)/);
  assert.doesNotMatch(accept, /staff_accounts/);
  assert.doesNotMatch(accept, /organization_users/);
  assert.doesNotMatch(accept, /party_relationships/);
});

test("external developer invitations are hashed, expiring, email-bound and least privilege by default", () => {
  assert.match(invite, /randomBytes\(32\)/);
  assert.match(invite, /token_hash:hash\(token\)/);
  assert.match(invite, /\["operations\.view"\]/);
  assert.match(accept, /invite\.status\s*!==\s*"PENDING"/);
  assert.match(accept, /new Date\(invite\.expires_at\)/);
  assert.match(accept, /user\.email.*invite\.email/s);
});

test("developer invitation management requires developer security authority", () => {
  assert.match(invite, /canManageDeveloperSecurity\(access\)/);
});

test("external developer organization chooser only returns active access", () => {
  assert.match(orgs, /from\("developer_portal_access"\)/);
  assert.match(orgs, /eq\("auth_user_id",user\.id\)/);
  assert.match(orgs, /eq\("status","ACTIVE"\)/);
});

test("developer workspace bypasses staff business-context gating", () => {
  assert.match(shell, /developerWorkspace/);
  assert.match(shell, /if \(developerWorkspace\)/);
});

test("external developer shell hides business-only navigation", () => {
  assert.match(portalShell, /externalDeveloper/);
  assert.match(portalShell, /\["\/integrations","\/compute"\]/);
  assert.match(portalShell, /suffix==="\/access"\)return canManageSecurity/);
  assert.match(portalShell, /suffix==="\/webhooks"\)return canManageWebhooks/);
  assert.match(portalShell, /Developer organizations/);
});

test("developer invitation and portal login return paths are allow-listed", () => {
  assert.match(login, /next\.startsWith\("\/developer-invite\/"\)/);
  assert.match(callback, /next\.startsWith\("\/developer-invite\/"\)/);
  assert.match(callback, /\/api\/developers\/access\/organizations/);
  assert.match(callback, /\/developer-access/);
});

test("developer invitation UI blocks acceptance for a signed-in email mismatch", () => {
  const page = fs.readFileSync("app/developer-invite/[token]/page.jsx", "utf8");
  assert.match(page, /const emailMatches=/);
  assert.match(page, /This invitation belongs to/);
  assert.match(page, /Sign out and use invited email/);
  assert.match(page, /emailMatches\?<>/);
});

test("public developer access page turns unauthenticated access into a login explanation", () => {
  const page = fs.readFileSync("app/developer-access/page.jsx", "utf8");
  assert.match(page, /response\.status===401/);
  assert.match(page, /HOW EXTERNAL ACCESS WORKS/);
  assert.match(page, /Developer Login/);
  assert.match(page, /No access yet\? Ask the organization owner\/admin/);
});

test("external developer invitations support only governed portal delegation permissions", () => {
  const invitations = fs.readFileSync("app/api/developers/access/invitations/route.js", "utf8");
  const manager = fs.readFileSync("components/workspace/developer/DeveloperAccessManager.jsx", "utf8");
  assert.match(invitations, /developer\.webhooks\.manage/);
  assert.match(invitations, /developer\.security\.manage/);
  assert.match(invitations, /PORTAL_PERMISSIONS\.has\(permission\)/);
  assert.match(invitations, /Unsupported Developer Portal permission/);
  assert.match(manager, /Read-only integration/);
  assert.match(manager, /Webhook operator/);
  assert.match(manager, /Developer administrator/);
  assert.match(manager, /High authority/);
});

test("shared developer environment mutation requires security authority", () => {
  const environments = fs.readFileSync("app/api/developers/environments/route.js", "utf8");
  assert.match(environments, /Developer security authority required to create environments/);
  assert.match(environments, /Developer security authority required to change environments/);
  const client = fs.readFileSync("components/workspace/developer/DeveloperControlPlaneClient.jsx", "utf8");
  assert.match(client, /An organization Developer administrator creates shared environments/);
  assert.match(client, /canManageSecurity\?<button/);
});

test("developer navigation mirrors delegated external authority", () => {
  const shell = fs.readFileSync("components/workspace/developer/DeveloperPortalShell.jsx", "utf8");
  assert.match(shell, /developer\.security\.manage/);
  assert.match(shell, /developer\.webhooks\.manage/);
  assert.match(shell, /suffix==="\/access"\)return canManageSecurity/);
  assert.match(shell, /suffix==="\/webhooks"\)return canManageWebhooks/);
  assert.match(shell, /\["\/integrations","\/compute"\]/);
});

test("webhook page enforces delegated webhook authority before rendering management UI", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/developers/webhooks/page.jsx", "utf8");
  assert.match(page, /canManageDeveloperWebhooks/);
  assert.match(page, /Webhook authority required/);
  assert.match(page, /developer\.webhooks\.manage/);
});

test("non-security credential UI excludes Production while preserving Development and Staging", () => {
  const client = fs.readFileSync("components/workspace/developer/DeveloperControlPlaneClient.jsx", "utf8");
  assert.match(client, /canManageSecurity\|\|row\.environment_key!=="production"/);
  assert.match(client, /Development and Staging credentials are read-only/);
});

test("external developer Usage is scoped to credentials created by that identity", () => {
  const runtime = fs.readFileSync("lib/developer/DeveloperPortalRuntime.js", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/developers/usage/page.jsx", "utf8");
  assert.match(runtime, /developerUsageSummary\(organizationId, \{ externalDeveloper = false, userId = null \}/);
  assert.match(runtime, /eq\("created_by", actor\)/);
  assert.match(runtime, /OWN_DEVELOPER_API/);
  assert.match(runtime, /access_scope: externalDeveloper \? "OWN_DEVELOPER_IDENTITY" : "ORGANIZATION"/);
  assert.match(page, /externalDeveloper: access\.externalDeveloper === true/);
  assert.match(page, /Organization-wide service costs and other developers/);
  assert.match(page, /Own credential/);
});

test("external developer environment GET passes identity-scoped quota context", () => {
  const environments = fs.readFileSync("app/api/developers/environments/route.js", "utf8");
  assert.match(environments, /developerEnvironmentQuotaSummary\(access\.organizationId, \{ externalDeveloper: access\.externalDeveloper === true, userId:/);
});

test("server-rendered Logs summary does not expose organization-wide health to ordinary external developers", () => {
  const runtime = fs.readFileSync("lib/developer/DeveloperPortalRuntime.js", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/developers/logs/page.jsx", "utf8");
  assert.match(runtime, /developerApiRequestSummary\(organizationId, \{ externalDeveloper = false, userId = null \}/);
  assert.match(runtime, /credentialIds/);
  assert.match(page, /HIDDEN_FOR_EXTERNAL_DEVELOPER/);
  assert.match(page, /HIDDEN_ORGANIZATION_HEALTH/);
  assert.match(page, /Organization-wide security, webhook and idempotency health remains visible only/);
  assert.match(page, /!access\.externalDeveloper \? <div/);
});

test("Developer Integrations and Compute hand off intentionally to canonical Administration workspaces", () => {
  const shell = fs.readFileSync("components/workspace/developer/DeveloperPortalShell.jsx", "utf8");
  const compute = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/compute/page.jsx", "utf8");
  const integrations = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/integrations/page.jsx", "utf8");
  assert.match(shell, /suffix === "\/integrations" \? `\/workspace\/\$\{organizationId\}\/administration\/integrations`/);
  assert.match(shell, /suffix === "\/compute" \? `\/workspace\/\$\{organizationId\}\/administration\/compute`/);
  assert.match(shell, /\["Integrations", "\/integrations", "Administration"\]/);
  assert.match(shell, /\["Compute", "\/compute", "Administration"\]/);
  assert.match(shell, /opens the canonical Administration workspace/);
  assert.match(shell, />Admin<\/span>/);
  assert.match(compute, /← Developer Portal/);
  assert.match(integrations, /← Developer Portal/);
  assert.match(compute, /Current Node01 production workload only/);
  assert.match(compute, /Historical cloud audit · retired/);
  assert.doesNotMatch(compute, /\[\.\.\.localRows, \.\.\.modalRows\]/);
});

test("Developer Overview is scoped for external identities before any subpage navigation", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/developers/page.jsx", "utf8");
  assert.match(page, /developerUsageSummary\(access\.organizationId, \{ externalDeveloper: access\.externalDeveloper === true/);
  assert.match(page, /access\.externalDeveloper\s*\? \[null, null\]/);
  assert.match(page, /External developer authority/);
  assert.match(page, /Organization-scoped\. Never employee access/);
  assert.match(page, /Only API traffic tied to credentials created by your developer identity/);
  assert.match(page, /visibleSurfaces = surfaces\.filter/);
  assert.match(page, /suffix !== "\/webhooks" \|\| canManageWebhooks/);
  assert.match(page, /scoped Developer authority/);
});

test("external Developer API Explorer never offers staff session-read authority", () => {
  const client = fs.readFileSync("components/workspace/developer/DeveloperApiExplorer.jsx", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/developers/api-explorer/page.jsx", "utf8");
  assert.match(client, /externalDeveloper \? "machine-read" : "session-read"/);
  assert.match(client, /!externalDeveloper \? \[\["session-read","Session read"\]\] : \[\]/);
  assert.match(client, /!externalDeveloper \? \[\["Session read"/);
  assert.match(page, /External Developer Portal identities use machine credentials only/);
  assert.match(page, /externalDeveloper=\{access\.externalDeveloper === true\}/);
});

test("access invitations use canonical organization email delivery without invalidating the invite on mail failure", () => {
  const runtime = fs.readFileSync("lib/access/InvitationEmailDeliveryRuntime.js", "utf8");
  const developer = fs.readFileSync("app/api/developers/access/invitations/route.js", "utf8");
  const supplier = fs.readFileSync("app/api/supplier-portal/invitations/route.js", "utf8");
  const accounting = fs.readFileSync("app/api/accounting-firm/client-invitations/route.js", "utf8");
  assert.match(runtime, /resolveProviderCredential/);
  assert.match(runtime, /loadProviderRuntime/);
  assert.match(runtime, /communication\.email\.send/);
  assert.match(runtime, /ACCESS_INVITATION_TRANSACTIONAL_EMAIL/);
  assert.match(runtime, /MANUAL_REQUIRED/);
  assert.match(runtime, /DELIVERY_FAILED/);
  assert.match(runtime, /SKIPPED_TEST_ADDRESS/);
  assert.match(runtime, /example\.invalid/);
  for (const route of [developer,supplier,accounting]) {
    assert.match(route, /deliverInvitationEmail/);
    assert.match(route, /delivery/);
    assert.match(route, /inviteUrl/);
  }
});

test("invitation issuer UIs always preserve the secure link and display delivery state", () => {
  const developer = fs.readFileSync("components/workspace/developer/DeveloperAccessManager.jsx", "utf8");
  const supplier = fs.readFileSync("components/workspace/supply-chain/SupplierPortalAccessWorkCenter.jsx", "utf8");
  const accounting = fs.readFileSync("components/workspace/finance/FinanceAccountingClientPortfolio.jsx", "utf8");
  for (const ui of [developer,supplier,accounting]) {
    assert.match(ui, /Email sent/);
    assert.match(ui, /Email not connected · copy link/);
    assert.match(ui, /Email delivery failed · invitation still valid/);
    assert.match(ui, /Test address · email skipped/);
  }
});

test("developer invitation acceptance claims the pending invite before granting access", () => {
  assert.match(accept, /\.eq\("status", "PENDING"\)/);
  assert.match(accept, /\.gt\("expires_at", acceptedAt\)/);
  assert.match(accept, /\.select\("\*"\)\s*\.maybeSingle\(\)/s);
  assert.match(accept, /Invitation was already accepted, revoked or expired/);
  assert.match(accept, /claimedInvite\.organization_id/);
  assert.match(accept, /claimedInvite\.permissions/);
});

test("developer invitation acceptance compensates a failed access write", () => {
  assert.match(accept, /if \(accessError \|\| !access\)/);
  assert.match(accept, /status: "PENDING"/);
  assert.match(accept, /accepted_by_auth_user_id: null/);
  assert.match(accept, /accepted_at: null/);
  assert.match(accept, /\.eq\("accepted_at", acceptedAt\)/);
});

test("developer invitation rejects malformed email before replacing pending invitations", () => {
  const invalidIndex = invite.indexOf("Developer email is invalid");
  const revokeIndex = invite.indexOf('from("developer_portal_invitations").update');
  assert.ok(invalidIndex >= 0 && revokeIndex > invalidIndex);
  assert.match(invite, /validEmail/);
});
