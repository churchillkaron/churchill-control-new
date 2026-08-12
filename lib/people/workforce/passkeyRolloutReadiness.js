import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadStaffPasskeyStatus } from "@/lib/people/workforce/passkeyClockInVerification";

const RECENT_VERIFICATION_WINDOW_MS = 30 * 60 * 1000;

export async function loadOrganizationPasskeyReadiness({
  organizationId,
  now = new Date(),
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id,status")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (membershipError) throw membershipError;

  const activeMemberships = Array.isArray(memberships) ? memberships : [];
  const staffAccountIds = Array.from(
    new Set(activeMemberships.map((row) => row?.staff_account_id).filter(Boolean))
  );

  let staffAccounts = [];
  if (staffAccountIds.length) {
    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,auth_user_id,active")
      .in("id", staffAccountIds);

    if (error) throw error;
    staffAccounts = Array.isArray(data) ? data : [];
  }

  const accountById = new Map(staffAccounts.map((account) => [account.id, account]));
  const activeMembers = activeMemberships.filter((membership) => {
    const account = accountById.get(membership?.staff_account_id);
    return !account || account.active !== false;
  });

  const linkedMembers = activeMembers
    .map((membership) => accountById.get(membership?.staff_account_id) || null)
    .filter((account) => account?.auth_user_id);

  let providerAvailable = true;
  let providerError = null;
  let enrolledMembers = 0;
  let recentlyVerifiedMembers = 0;
  let latestVerifiedAt = null;

  for (const account of linkedMembers) {
    try {
      const status = await loadStaffPasskeyStatus({ userId: account.auth_user_id });
      if (status.enrolled) enrolledMembers += 1;

      if (status.lastUsedAt) {
        const usedAt = new Date(status.lastUsedAt);
        if (!Number.isNaN(usedAt.getTime())) {
          if (!latestVerifiedAt || usedAt > latestVerifiedAt) {
            latestVerifiedAt = usedAt;
          }

          const ageMs = now.getTime() - usedAt.getTime();
          if (ageMs >= -60 * 1000 && ageMs <= RECENT_VERIFICATION_WINDOW_MS) {
            recentlyVerifiedMembers += 1;
          }
        }
      }
    } catch (error) {
      providerAvailable = false;
      providerError =
        error?.message || "Unable to verify Supabase Passkey configuration";
      break;
    }
  }

  const activeMemberCount = activeMembers.length;
  const authLinkedMemberCount = linkedMembers.length;
  const missingAuthMemberCount = Math.max(
    0,
    activeMemberCount - authLinkedMemberCount
  );
  const missingEnrollmentCount = Math.max(
    0,
    activeMemberCount - enrolledMembers
  );
  const fullAuthCoverage =
    activeMemberCount > 0 && authLinkedMemberCount === activeMemberCount;
  const fullEnrollmentCoverage =
    activeMemberCount > 0 && enrolledMembers === activeMemberCount;
  const recentVerificationProven = recentlyVerifiedMembers > 0;
  const activationReady =
    providerAvailable &&
    fullAuthCoverage &&
    fullEnrollmentCoverage &&
    recentVerificationProven;

  const blockers = [];
  if (!providerAvailable) {
    blockers.push(
      "Supabase Passkey configuration could not be verified. Hosted Passkeys must be enabled for the canonical Workforce origin before rollout."
    );
  }
  if (activeMemberCount === 0) {
    blockers.push("No active organization members are available for rollout verification.");
  }
  if (missingAuthMemberCount > 0) {
    blockers.push(
      `${missingAuthMemberCount} active member${missingAuthMemberCount === 1 ? " is" : "s are"} not linked to a Supabase Auth identity.`
    );
  }
  if (missingEnrollmentCount > 0) {
    blockers.push(
      `${missingEnrollmentCount} active member${missingEnrollmentCount === 1 ? " still needs" : "s still need"} a registered passkey.`
    );
  }
  if (!recentVerificationProven) {
    blockers.push(
      "No successful passkey verification has been recorded in the last 30 minutes."
    );
  }

  return {
    canonicalOrigin: "https://avantiqo.ai",
    verificationWindowMinutes: Math.round(
      RECENT_VERIFICATION_WINDOW_MS / 60000
    ),
    providerAvailable,
    providerError,
    activeMemberCount,
    authLinkedMemberCount,
    enrolledMemberCount: enrolledMembers,
    recentlyVerifiedMemberCount: recentlyVerifiedMembers,
    missingAuthMemberCount,
    missingEnrollmentCount,
    fullAuthCoverage,
    fullEnrollmentCoverage,
    recentVerificationProven,
    latestVerifiedAt: latestVerifiedAt?.toISOString() || null,
    activationReady,
    blockers,
  };
}

export { RECENT_VERIFICATION_WINDOW_MS };

export default loadOrganizationPasskeyReadiness;
