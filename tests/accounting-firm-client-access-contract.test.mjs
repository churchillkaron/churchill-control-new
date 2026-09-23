import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manage = fs.readFileSync("app/api/accounting-firm/client-invitations/route.js", "utf8");
const invite = fs.readFileSync("app/api/accounting-firm/client-invitations/[token]/route.js", "utf8");
const accept = fs.readFileSync("app/api/accounting-firm/client-invitations/[token]/accept/route.js", "utf8");
const page = fs.readFileSync("app/accounting-client-invite/[token]/page.jsx", "utf8");
const login = fs.readFileSync("app/login/page.js", "utf8");
const callback = fs.readFileSync("app/login/callback/page.js", "utf8");
const managedRuntime = fs.readFileSync("lib/accounting/managed-clients/AccountingManagedClientRuntime.js", "utf8");
const managedMigration = fs.readFileSync("supabase/migrations/20260922170000_accounting_managed_clients.sql", "utf8");
const portfolio = fs.readFileSync("components/workspace/finance/FinanceAccountingClientPortfolio.jsx", "utf8");
const managedClaimRoute = fs.readFileSync("app/api/accounting-firm/managed-client-claims/[token]/route.js", "utf8");
const managedClaimPage = fs.readFileSync("app/accounting-managed-client-claim/[token]/page.jsx", "utf8");
const invitationDelivery = fs.readFileSync("lib/access/InvitationEmailDeliveryRuntime.js", "utf8");

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
  assert.match(accept, /requireOrganizationAccess\(\{[\s\S]*organizationId:\s*clientOrganizationId,[\s\S]*request,[\s\S]*\}\)/);
  assert.match(accept, /ACCEPT_ROLES\.has/);
  assert.match(accept, /client\.organization_type\s*===\s*"accounting_firm"/);
});

test("acceptance creates only the canonical organization_clients relationship", () => {
  assert.match(accept, /from\("organization_clients"\)[\s\S]*\.upsert\(/);
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

test("accounting client invitation is claimed before the firm relationship is created", () => {
  assert.match(accept, /\.eq\("status", "PENDING"\)/);
  assert.match(accept, /\.gt\("expires_at", acceptedAt\)/);
  assert.match(accept, /Invitation was already accepted, revoked or expired/);
  assert.match(accept, /claimedInvite\.firm_organization_id/);
  assert.match(accept, /claimedInvite\.billing_model/);
});

test("accounting client acceptance compensates a failed relationship write", () => {
  assert.match(accept, /if \(relationshipError \|\| !relationship\)/);
  assert.match(accept, /status: "PENDING"/);
  assert.match(accept, /accepted_by_auth_user_id: null/);
  assert.match(accept, /accepted_client_organization_id: null/);
  assert.match(accept, /accepted_at: null/);
  assert.match(accept, /\.eq\("accepted_at", acceptedAt\)/);
});

test("managed accounting clients create independent organizations without staff membership", () => {
  assert.match(managedRuntime, /organizationType:\s*"client_company"/);
  assert.match(managedRuntime, /accountingMode:\s*"managed_accounting_client"/);
  assert.match(managedRuntime, /from\("organization_clients"\)/);
  assert.doesNotMatch(managedRuntime, /staff_accounts/);
  assert.doesNotMatch(managedRuntime, /organization_users/);
  assert.doesNotMatch(managedRuntime, /buildWorkspaceFromTemplate/);
});

test("managed client metadata is server-only and explicitly claimable", () => {
  assert.match(managedMigration, /management_status text not null default 'UNCLAIMED'/);
  assert.match(managedMigration, /'CLAIM_PENDING','CLAIMING','CLAIMED'/);
  assert.match(managedMigration, /enable row level security/);
  assert.match(managedMigration, /revoke all on table public\.accounting_managed_clients from public, anon, authenticated/);
});

test("accounting firm client portfolio exposes managed client without replacing invitation onboarding", () => {
  assert.match(portfolio, /MANAGED CLIENT · NO AVANTIQO ACCOUNT REQUIRED/);
  assert.match(portfolio, /action:"create_managed_client"/);
  assert.match(portfolio, /Invite client/);
  assert.match(manage, /createManagedAccountingClient/);
  assert.match(manage, /managedClients:managedClients\|\|\[\]/);
});

test("managed client claim preserves the existing organization and adds owner authority only after validation", () => {
  assert.match(managedClaimRoute, /claim\.client_organization_id/);
  assert.match(managedClaimRoute, /Sign in with the email address that received this claim invitation/);
  assert.match(managedClaimRoute, /requireOnboardingIndustry\(industry\)/);
  assert.match(managedClaimRoute, /finalize_accounting_managed_client_claim/);
  assert.match(managedMigration, /organization_users/);
  assert.match(managedMigration, /role = 'OWNER'/);
  assert.doesNotMatch(managedClaimRoute, /createOrganization\(/);
  assert.doesNotMatch(managedClaimRoute, /provisionOrganization\(/);
});

test("managed client claim installs a governed workspace without duplicating accounting history", () => {
  assert.match(managedClaimRoute, /requireWorkspaceTemplate\(industry\)/);
  assert.match(managedClaimRoute, /organization_template_assignments/);
  assert.match(managedClaimRoute, /organization_modules/);
  assert.match(managedClaimRoute, /organization_workspace_settings/);
  assert.match(managedClaimRoute, /WalletRuntime\.getOrCreate/);
  assert.match(managedClaimRoute, /bootstrapOrganizationServices/);
  assert.match(managedClaimRoute, /management_status:"CLAIMING"/);
  assert.match(managedMigration, /management_status = 'CLAIMED'/);
});

test("managed client claim has a dedicated invitation and safe login return path", () => {
  assert.match(manage, /invite_managed_client_claim/);
  assert.match(manage, /accounting-managed-client-claim/);
  assert.match(invitationDelivery, /accounting_managed_client_claim/);
  assert.match(managedClaimPage, /Claim your existing company/);
  assert.match(login, /accounting-managed-client-claim/);
  assert.match(callback, /accounting-managed-client-claim/);
  assert.match(portfolio, /Invite to claim/);
  assert.match(portfolio, /Reissue claim/);
});

test("claiming a managed client preserves the accounting-firm relationship", () => {
  assert.doesNotMatch(managedClaimRoute, /from\("organization_clients"\)\.update/);
  assert.doesNotMatch(managedClaimRoute, /from\("organization_clients"\)\.delete/);
  assert.match(managedClaimRoute, /client_organization_id/);
});

test("managed client claim reserves before side effects and finalizes owner authority atomically", () => {
  assert.match(managedMigration, /'CLAIMING'/);
  assert.match(managedClaimRoute, /management_status:"CLAIMING"/);
  assert.match(managedClaimRoute, /finalize_accounting_managed_client_claim/);
  assert.match(managedMigration, /language plpgsql/);
  assert.match(managedMigration, /security invoker/);
  assert.match(managedMigration, /revoke all on function public\.finalize_accounting_managed_client_claim/);
  assert.match(managedMigration, /grant execute on function public\.finalize_accounting_managed_client_claim[\s\S]*to service_role/);
  assert.match(managedMigration, /update public\.staff_accounts[\s\S]*active_organization_id = p_organization_id/);
  assert.match(managedMigration, /insert into public\.organization_users/);
  assert.match(managedMigration, /update public\.accounting_managed_clients[\s\S]*management_status = 'CLAIMED'/);
});

test("failed managed client activation releases only its own CLAIMING reservation", () => {
  assert.match(managedClaimRoute, /management_status:"CLAIM_PENDING"/);
  assert.match(managedClaimRoute, /\.eq\("management_status","CLAIMING"\)\.eq\("claiming_by_auth_user_id",reservedUserId\)/);
});

test("managed client claim uses an attempt-specific reservation so stale retries cannot finalize newer work", () => {
  assert.match(managedMigration, /claiming_attempt_id uuid/);
  assert.match(managedClaimRoute, /randomUUID\(\)/);
  assert.match(managedClaimRoute, /claiming_attempt_id:claimingAttemptId/);
  assert.match(managedClaimRoute, /p_claiming_attempt_id:reservedAttemptId/);
  assert.match(managedMigration, /amc\.claiming_attempt_id = p_claiming_attempt_id/);
  assert.match(managedMigration, /claiming_attempt_id = p_claiming_attempt_id/);
  assert.match(managedClaimRoute, /\.eq\("claiming_attempt_id",reservedAttemptId\)/);
});

test("claimed managed client adopts the governed organization type without changing organization id", () => {
  assert.match(managedClaimRoute, /p_organization_type:governed\.organizationType/);
  assert.match(managedMigration, /organization_type = p_organization_type/);
  assert.doesNotMatch(managedClaimRoute, /createOrganization\(/);
});

test("existing-client invitation avoids steering managed clients into duplicate organizations", () => {
  assert.match(page, /managed-client claim invitation instead of creating a second company/);
});

test("stale managed-client CLAIMING state is retryable from the claim page", () => {
  assert.match(managedClaimRoute, /retryableClaiming/);
  assert.match(managedClaimRoute, /15\*60\*1000/);
  assert.match(managedClaimRoute, /retryable:retryableClaiming/);
  assert.match(managedClaimPage, /d\.claim\?\.status==="CLAIM_PENDING"\|\|d\.claim\?\.retryable/);
  assert.match(managedClaimPage, /The previous activation attempt did not finish/);
  assert.match(managedClaimPage, /claimData\.status !== "CLAIM_PENDING" && !claimData\.retryable/);
});

test("managed client legal identity is normalized and duplicate-safe within each accounting firm", () => {
  assert.match(managedRuntime, /function identityKey/);
  assert.match(managedRuntime, /normalize\("NFKC"\)/);
  assert.match(managedRuntime, /\\p\{L\}/);
  assert.match(managedRuntime, /\\p\{N\}/);
  assert.match(managedRuntime, /registration_number_key: registrationKey/);
  assert.match(managedRuntime, /tax_number_key: taxKey/);
  assert.match(managedMigration, /accounting_managed_clients_firm_registration_uidx/);
  assert.match(managedMigration, /accounting_managed_clients_firm_tax_uidx/);
  assert.match(managedMigration, /firm_organization_id, registration_number_key/);
  assert.match(managedMigration, /firm_organization_id, tax_number_key/);
  assert.match(managedMigration, /management_status <> 'ARCHIVED'/);
});

test("managed client duplicate checks cover both preflight and concurrent database races", () => {
  assert.match(managedRuntime, /\.neq\("management_status", "ARCHIVED"\)/);
  assert.match(managedRuntime, /duplicateManagedClientError\("registration number"\)/);
  assert.match(managedRuntime, /duplicateManagedClientError\("tax\/VAT number"\)/);
  assert.match(managedRuntime, /managedResult\.error\.code === "23505"/);
});
test("managed-client creation fails before organization creation when its schema is unavailable", () => {
  const probeIndex = managedRuntime.indexOf('.from("accounting_managed_clients")');
  const createIndex = managedRuntime.indexOf("organization = await createOrganization");
  assert.ok(probeIndex >= 0 && createIndex > probeIndex);
  assert.match(managedRuntime, /Managed-client database migration is not installed/);
});

test("managed client legal identity keys include normalized jurisdiction", () => {
  assert.match(managedRuntime, /function countryIdentityKey/);
  assert.match(managedRuntime, /identityKey\(registrationNumber, countryCode\)/);
  assert.match(managedRuntime, /identityKey\(taxNumber, countryCode\)/);
  assert.match(managedRuntime, /jurisdiction/);
});

test("managed-client claim requires an active accounting relationship at issue load accept and finalization", () => {
  assert.match(manage, /Accounting relationship is no longer active/);
  assert.match(managedClaimRoute, /relationship_status!==\"active\"/);
  assert.match(managedMigration, /oc\.relationship_status = 'active'/);
  assert.match(managedMigration, /for update of amc, oc/);
});

test("ending an unclaimed managed relationship revokes outstanding claim authority", () => {
  assert.match(manage, /management_status:"ARCHIVED"/);
  assert.match(manage, /claim_token_hash:null/);
  assert.match(manage, /claim_expires_at:null/);
  assert.match(manage, /claiming_attempt_id:null/);
  assert.match(manage, /\["UNCLAIMED","CLAIM_PENDING","CLAIMING"\]/);
});
test("managed-client legal identity is reserved before organization provisioning", () => {
  const reserveIndex = managedRuntime.indexOf("await reserveIdentity");
  const createIndex = managedRuntime.indexOf("organization = await createOrganization");
  assert.ok(reserveIndex >= 0 && createIndex > reserveIndex);
  assert.match(managedRuntime, /accounting_managed_client_identity_reservations/);
  assert.match(managedRuntime, /reservation_token: reservationToken/);
  assert.match(managedRuntime, /15 \* 60 \* 1000/);
  assert.match(managedMigration, /unique \(firm_organization_id, identity_kind, identity_key\)/);
});

test("managed-client identity reservations are private recoverable and always released", () => {
  assert.match(managedMigration, /accounting_managed_client_identity_reservations enable row level security/);
  assert.match(managedMigration, /revoke all on table public\.accounting_managed_client_identity_reservations from public, anon, authenticated/);
  assert.match(managedRuntime, /\.lte\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(managedRuntime, /releaseIdentityReservations\(reservationToken\)\.catch/);
});
test("managed-client provisioning rejects malformed setup data before reservations or organization creation", () => {
  assert.match(managedRuntime, /Country must be a recognized country name or two-letter ISO code/);
  assert.match(managedRuntime, /Base currency must be a valid three-letter ISO currency code/);
  assert.match(managedRuntime, /Unsupported accounting standard/);
  assert.match(managedRuntime, /Fiscal year start month must be an integer from 1 to 12/);
  assert.match(managedRuntime, /Client contact email is invalid/);
  const validationIndex = managedRuntime.indexOf("Country must be a recognized country name or two-letter ISO code");
  const reserveIndex = managedRuntime.indexOf("await reserveIdentity");
  const createIndex = managedRuntime.indexOf("organization = await createOrganization");
  assert.ok(validationIndex >= 0 && reserveIndex > validationIndex && createIndex > reserveIndex);
});

test("managed-client finance setup uses canonical accepted standards and real currency validation", () => {
  assert.match(managedRuntime, /"TFRS"/);
  assert.match(managedRuntime, /"IFRS"/);
  assert.match(managedRuntime, /"IFRS_FOR_SMES"/);
  assert.match(managedRuntime, /"US_GAAP"/);
  assert.match(managedRuntime, /"LOCAL_GAAP"/);
  assert.match(managedRuntime, /Intl\.supportedValuesOf\("currency"\)/);
  assert.match(managedRuntime, /countryCode === "TH" \? "THAILAND" : "UNCONFIGURED"/);
});

test("accounting invitation emails are validated before pending invitation or claim state changes", () => {
  const clientInvalidIndex = manage.indexOf("clientEmail is invalid");
  const clientRevokeIndex = manage.indexOf('from("organization_client_invitations").update');
  const claimInvalidIndex = manage.indexOf("Client claim email is invalid");
  const claimUpdateIndex = manage.indexOf('.from("accounting_managed_clients")\n        .update({management_status:"CLAIM_PENDING"');
  assert.ok(clientInvalidIndex >= 0 && clientRevokeIndex > clientInvalidIndex);
  assert.ok(claimInvalidIndex >= 0 && claimUpdateIndex > claimInvalidIndex);
  assert.match(manage, /validEmail/);
});

test("managed-client schema enforces claim evidence and defense-in-depth grants", () => {
  assert.match(managedMigration, /claim_token_hash is null or char_length\(claim_token_hash\) = 64/);
  assert.match(managedMigration, /management_status not in \('CLAIM_PENDING','CLAIMING'\)/);
  assert.match(managedMigration, /management_status <> 'CLAIMING'/);
  assert.match(managedMigration, /management_status <> 'CLAIMED'/);
  assert.match(managedMigration, /check \(expires_at > created_at\)/);
  assert.match(managedMigration, /accounting_managed_clients from public, anon, authenticated/);
  assert.match(managedMigration, /accounting_managed_client_identity_reservations from public, anon, authenticated/);
});

test("managed-client claim expiry is enforced at reservation and atomic finalization", () => {
  assert.match(managedClaimRoute, /\.gt\("claim_expires_at",claimingAt\)/);
  assert.match(managedMigration, /amc\.claim_expires_at > now\(\)/);
  assert.match(managedMigration, /for update of amc, oc/);
  assert.match(managedMigration, /and claim_expires_at > now\(\);/);
});

test("managed-client finalizer binds owner email to the stored claim email", () => {
  assert.match(managedMigration, /lower\(amc\.claim_email\) = lower\(p_owner_email\)/);
  assert.match(managedMigration, /lower\(claim_email\) = lower\(p_owner_email\)/);
});

test("managed-client claim never creates active owner authority before atomic finalization", () => {
  assert.match(managedClaimRoute, /ensureOwnerStaffCandidate/);
  assert.match(managedClaimRoute, /role:null/);
  assert.match(managedClaimRoute, /active:false/);
  assert.match(managedClaimRoute, /active_organization_id:null/);
  assert.doesNotMatch(managedClaimRoute, /role:"OWNER"[\s\S]{0,160}active:true/);
});

test("managed-client owner candidate reuse is neutral-only and race-safe", () => {
  assert.match(managedClaimRoute, /Inactive Staff identity cannot be reused for a managed company claim/);
  assert.match(managedClaimRoute, /Concurrent Staff identity is not a neutral claim candidate/);
  assert.match(managedClaimRoute, /Staff identity email is already linked to another account/);
  assert.match(managedClaimRoute, /inserted\.error\?\.code==="23505"/);
});

test("managed-client finalizer independently permits only active owners or neutral inactive candidates", () => {
  assert.match(managedMigration, /lower\(coalesce\(email,''\)\) = lower\(p_owner_email\)/);
  assert.match(managedMigration, /upper\(coalesce\(role,''\)\) in \('OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN'\)/);
  assert.match(managedMigration, /coalesce\(active,false\) = false/);
  assert.match(managedMigration, /role is null/);
  assert.match(managedMigration, /party_id is null/);
  assert.match(managedMigration, /active_organization_id is null/);
});
