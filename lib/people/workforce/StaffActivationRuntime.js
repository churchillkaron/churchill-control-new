import { loadStaffIdentityVerification } from "@/lib/people/workforce/StaffIdentityVerificationRuntime";
import { loadStaffPasskeyStatus } from "@/lib/people/workforce/passkeyClockInVerification";
import { loadStaffPhoneVerification } from "@/lib/people/workforce/StaffPhoneVerificationRuntime";

const ACTIVATION_BYPASS_ROLES = new Set(["SUPER_ADMIN"]);

function normalizedRole(value) {
  return String(value ?? "").trim().toUpperCase();
}

export async function loadStaffActivationStatus({ organizationId, staff, user } = {}) {
  if (!organizationId || !staff?.id || !user?.id) throw new Error("Authenticated staff activation context required");

  const role = normalizedRole(staff?.role);
  if (ACTIVATION_BYPASS_ROLES.has(role)) {
    return {
      complete: true,
      status: "ACTIVE",
      bypass: {
        applied: true,
        reason: "SUPER_ADMIN",
      },
      steps: {
        email: {
          complete: true,
          status: "ADMIN_BYPASS",
          email: user.email || staff.email || null,
          verifiedAt: user.email_confirmed_at || user.confirmed_at || null,
        },
        phone: {
          complete: true,
          status: "ADMIN_BYPASS",
          verified: false,
          phoneMasked: null,
          channel: null,
          verifiedAt: null,
        },
        identity: {
          complete: true,
          status: "ADMIN_BYPASS",
          verified: false,
          documentId: null,
          documentType: null,
          documentNumberMasked: null,
          submittedAt: null,
          verifiedAt: null,
          rejectedAt: null,
          rejectedReason: null,
          expiryDate: null,
        },
        passkey: {
          complete: true,
          status: "ADMIN_BYPASS",
          enrolled: false,
          count: 0,
          lastUsedAt: null,
        },
      },
    };
  }

  const [phone, identity, passkey] = await Promise.all([
    loadStaffPhoneVerification({ organizationId, staff }),
    loadStaffIdentityVerification({ organizationId, staffId: staff.id }),
    loadStaffPasskeyStatus({ userId: user.id }),
  ]);

  const emailVerified = Boolean(user.email_confirmed_at || user.confirmed_at);
  const phoneVerified = phone.verified === true;
  const identityVerified = identity.verified === true;
  const passkeyEnrolled = passkey.enrolled === true;
  const passkeyVerified = passkeyEnrolled && Boolean(passkey.lastUsedAt);
  const complete = emailVerified && phoneVerified && identityVerified && passkeyVerified;

  return {
    complete,
    status: complete ? "ACTIVE" : "SETUP_REQUIRED",
    steps: {
      email: {
        complete: emailVerified,
        status: emailVerified ? "VERIFIED" : "UNVERIFIED",
        email: user.email || staff.email || null,
        verifiedAt: user.email_confirmed_at || user.confirmed_at || null,
      },
      phone: {
        complete: phoneVerified,
        ...phone,
      },
      identity: {
        complete: identityVerified,
        ...identity,
      },
      passkey: {
        complete: passkeyVerified,
        status: passkeyVerified ? "VERIFIED" : passkeyEnrolled ? "ENROLLED_NOT_VERIFIED" : "NOT_ENROLLED",
        enrolled: passkeyEnrolled,
        count: passkey.count || 0,
        lastUsedAt: passkey.lastUsedAt || null,
      },
    },
  };
}

export async function requireStaffActivation({ organizationId, staff, user } = {}) {
  const activation = await loadStaffActivationStatus({ organizationId, staff, user });
  if (activation.complete) return activation;
  const error = new Error("Complete staff identity setup before using the Staff Portal");
  error.status = 403;
  error.code = "STAFF_ACTIVATION_REQUIRED";
  error.activation = activation;
  throw error;
}
