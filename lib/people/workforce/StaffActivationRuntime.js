import { loadStaffIdentityVerification } from "@/lib/people/workforce/StaffIdentityVerificationRuntime";
import { loadStaffPasskeyStatus } from "@/lib/people/workforce/passkeyClockInVerification";
import { loadStaffPhoneVerification } from "@/lib/people/workforce/StaffPhoneVerificationRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { localDateString, resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";

const ACTIVATION_BYPASS_ROLES = new Set(["SUPER_ADMIN"]);
const EMPLOYMENT_BYPASS_ROLES = new Set(["OWNER", "ORGANIZATION_OWNER", "PLATFORM_OWNER"]);

function normalizedRole(value) {
  return String(value ?? "").trim().toUpperCase();
}

async function loadCurrentEmployment({ organizationId, staff }) {
  if (!staff?.party_id) {
    return { complete: false, status: "MISSING", assignment: null, legalEntity: null };
  }

  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const businessDate = localDateString(new Date(), timeContext.timezone);

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from("employee_employment_assignments")
    .select("id,organization_id,entity_id,staff_account_id,party_id,effective_from,effective_to,status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staff.id)
    .eq("party_id", staff.party_id)
    .lte("effective_from", businessDate)
    .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assignmentError) throw assignmentError;

  if (!assignment?.entity_id) {
    return { complete: false, status: "MISSING", assignment: null, legalEntity: null };
  }

  const { data: legalEntity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id,organization_id,legal_name,display_name,is_active")
    .eq("organization_id", organizationId)
    .eq("id", assignment.entity_id)
    .maybeSingle();
  if (entityError) throw entityError;

  const complete = Boolean(legalEntity?.id && legalEntity?.is_active === true);
  return {
    complete,
    status: complete ? "ASSIGNED" : "INVALID",
    assignment,
    legalEntity: legalEntity || null,
  };
}

export async function loadStaffActivationStatus({ organizationId, staff, user, role: accessRole = null } = {}) {
  if (!organizationId || !staff?.id || !user?.id) throw new Error("Authenticated staff activation context required");

  const role = normalizedRole(accessRole || staff?.role);
  if (ACTIVATION_BYPASS_ROLES.has(role)) {
    return {
      complete: true,
      status: "ACTIVE",
      bypass: {
        applied: true,
        reason: "SUPER_ADMIN",
      },
      steps: {
        employment: {
          complete: true,
          status: "ADMIN_BYPASS",
          assignmentId: null,
          entityId: null,
          legalEntityName: null,
          effectiveFrom: null,
        },
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

  const [employment, phone, identity, passkey] = await Promise.all([
    loadCurrentEmployment({ organizationId, staff }),
    loadStaffPhoneVerification({ organizationId, staff }),
    loadStaffIdentityVerification({ organizationId, staffId: staff.id }),
    loadStaffPasskeyStatus({ userId: user.id }),
  ]);

  const employmentBypass = EMPLOYMENT_BYPASS_ROLES.has(role);
  const employmentAssigned = employmentBypass || employment.complete === true;
  const emailVerified = Boolean(user.email_confirmed_at || user.confirmed_at);
  const phoneVerified = phone.verified === true;
  const identityVerified = identity.verified === true;
  const passkeyEnrolled = passkey.enrolled === true;
  const passkeyVerified = passkeyEnrolled && Boolean(passkey.lastUsedAt);
  const complete = employmentAssigned && emailVerified && phoneVerified && identityVerified && passkeyVerified;

  return {
    complete,
    status: complete ? "ACTIVE" : "SETUP_REQUIRED",
    steps: {
      employment: {
        complete: employmentAssigned,
        status: employmentBypass ? "OWNER_BYPASS" : employment.status,
        assignmentId: employment.assignment?.id || null,
        entityId: employment.legalEntity?.id || null,
        legalEntityName:
          employment.legalEntity?.display_name ||
          employment.legalEntity?.legal_name ||
          null,
        effectiveFrom: employment.assignment?.effective_from || null,
      },
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
