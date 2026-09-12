function text(value) {
  return String(value ?? "").trim();
}

function normalizeHandle(value) {
  return text(value).replace(/^@+/, "").toLowerCase();
}

function validateHandle(value) {
  const handle = normalizeHandle(value);
  if (!handle) return null;
  if (handle.length > 30) {
    throw new Error("Instagram username must be 30 characters or fewer");
  }
  if (!/^[a-z0-9._]+$/.test(handle)) {
    throw new Error("Instagram username may only contain letters, numbers, periods and underscores");
  }
  return handle;
}

export function instagramAccountProvisioningCapability() {
  return {
    provider: "meta",
    channel: "instagram",
    capability: "channel.instagram.account.provision",
    mode: "PROVIDER_VERIFICATION_HANDOFF",
    provider_api_can_create_identity: false,
    provider_api_can_manage_professional_account: true,
    requires_provider_identity_verification: true,
    signup_url: "https://www.instagram.com/accounts/emailsignup/",
  };
}

export function prepareInstagramAccountProvisioning({
  organizationId,
  username,
  displayName,
  bio,
  website,
}) {
  const organization_id = text(organizationId);
  if (!organization_id) throw new Error("organization_id required");

  return {
    ...instagramAccountProvisioningCapability(),
    organization_id,
    status: "IDENTITY_VERIFICATION_REQUIRED",
    proposed_profile: {
      username: validateHandle(username),
      display_name: text(displayName) || null,
      bio: text(bio) || null,
      website: text(website) || null,
    },
    handoff: {
      url: "https://www.instagram.com/accounts/emailsignup/",
      purpose: "CREATE_INSTAGRAM_IDENTITY",
      returns_to_avantiqo: true,
    },
    continuation: {
      method: "META_REAUTHORIZATION_AND_ASSET_DISCOVERY",
      url: `/api/meta/auth?organizationId=${encodeURIComponent(organization_id)}`,
    },
  };
}
