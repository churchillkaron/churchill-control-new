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

function linkedInHeaders(accessToken, includeContentType = true) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Linkedin-Version": linkedInVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
  };
}

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function uploadImage({ accessToken, ownerUrn, imageUrl }) {
  const initializeResponse = await fetch(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: linkedInHeaders(accessToken),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: ownerUrn,
        },
      }),
      cache: "no-store",
    },
  );

  const initialized = await parseResponse(initializeResponse);
  if (!initializeResponse.ok) {
    throw new Error(
      initialized?.message ||
        initialized?.error?.message ||
        `LinkedIn image upload initialization failed (${initializeResponse.status})`,
    );
  }

  const uploadUrl = text(initialized?.value?.uploadUrl);
  const imageUrn = text(initialized?.value?.image);
  if (!uploadUrl || !imageUrn) {
    throw new Error("LINKEDIN_IMAGE_UPLOAD_TARGET_MISSING");
  }

  const sourceResponse = await fetch(imageUrl, { cache: "no-store" });
  if (!sourceResponse.ok) {
    throw new Error(`LinkedIn source image fetch failed (${sourceResponse.status})`);
  }

  const imageBytes = await sourceResponse.arrayBuffer();
  const contentType =
    text(sourceResponse.headers.get("content-type")) || "application/octet-stream";

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body: imageBytes,
    cache: "no-store",
  });

  if (!uploadResponse.ok) {
    const payload = await parseResponse(uploadResponse);
    throw new Error(
      payload?.message ||
        payload?.error?.message ||
        `LinkedIn image upload failed (${uploadResponse.status})`,
    );
  }

  return imageUrn;
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
    message,
    image_url,
    alt_text,
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
          text: postText || message,
          image_url,
          alt_text,
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
  alt_text,
}) {
  if (!author_urn) {
    throw new Error("LINKEDIN_AUTHOR_URN_REQUIRED");
  }

  const imageUrn = text(image_url)
    ? await uploadImage({
        accessToken: access_token,
        ownerUrn: author_urn,
        imageUrl: text(image_url),
      })
    : null;

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(access_token),
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
      ...(imageUrn
        ? {
            content: {
              media: {
                id: imageUrn,
                ...(text(alt_text) ? { altText: text(alt_text) } : {}),
              },
            },
          }
        : {}),
    }),
    cache: "no-store",
  });

  const result = await parseResponse(response);
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
      author_urn,
      image_urn: imageUrn,
      api_version: linkedInVersion(),
    },
  };
}
