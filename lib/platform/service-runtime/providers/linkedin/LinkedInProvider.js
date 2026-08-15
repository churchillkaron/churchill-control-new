import "./LinkedInCredentialRegistration.js";

function text(value) {
  return String(value ?? "").trim();
}

function linkedInVersion() {
  return text(process.env.LINKEDIN_API_VERSION) || "202607";
}

function resolvedAuthorUrn({ author_urn, member_urn, external_account_id }) {
  const explicit = text(author_urn) || text(member_urn);
  if (explicit) return explicit;

  const accountId = text(external_account_id);
  return accountId ? `urn:li:person:${accountId}` : null;
}

export const LinkedInProvider = {
  id: "linkedin",

  async execute({
    capability,
    access_token,
    author_urn,
    member_urn,
    external_account_id,
    text: postText,
    image_url,
  } = {}) {
    if (!access_token) {
      throw new Error("LINKEDIN_ACCESS_TOKEN_REQUIRED");
    }

    const authorUrn = resolvedAuthorUrn({
      author_urn,
      member_urn,
      external_account_id,
    });

    switch (capability) {
      case "communication.linkedin.publish":
      case "marketing.linkedin.publish":
        return publishPost({
          access_token,
          author_urn: authorUrn,
          text: postText,
          image_url,
        });
      default:
        throw new Error(`LinkedIn capability not supported: ${capability}`);
    }
  },
};

async function publishPost({
  access_token,
  author_urn,
  text: postText,
  image_url,
}) {
  if (!author_urn) {
    throw new Error("LINKEDIN_AUTHOR_URN_REQUIRED");
  }

  if (image_url) {
    throw new Error("LINKEDIN_IMAGE_PUBLISH_REQUIRES_MEDIA_UPLOAD_FLOW");
  }

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      "Linkedin-Version": linkedInVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: author_urn,
      commentary: postText || "",
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
    cache: "no-store",
  });

  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = { raw };
    }
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
        result?.error?.message ||
        `LinkedIn publish failed (${response.status})`,
    );
  }

  return {
    success: true,
    provider: "linkedin",
    output: {
      ...result,
      id: response.headers.get("x-restli-id") || result?.id || null,
    },
  };
}
