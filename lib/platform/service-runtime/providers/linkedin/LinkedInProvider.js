function text(value) {
  return String(value || "").trim();
}

function boundedError(value) {
  return text(value).slice(0, 500) || "LinkedIn publish failed";
}

function unsupportedMedia({ image_url, video_url, audio_url } = {}) {
  if (text(video_url)) return "VIDEO";
  if (text(image_url)) return "IMAGE";
  if (text(audio_url)) return "AUDIO";
  return null;
}

export const LinkedInProvider = {
  id: "linkedin",

  validateInput(input = {}) {
    const capability = text(input.capability);
    if (!["communication.linkedin.publish", "marketing.linkedin.publish"].includes(capability)) {
      throw new Error(`LinkedIn capability not supported: ${capability}`);
    }

    if (!text(input.access_token)) {
      throw new Error("LINKEDIN_ACCESS_TOKEN_REQUIRED");
    }
    if (!text(input.author_urn)) {
      throw new Error("LINKEDIN_AUTHOR_URN_REQUIRED");
    }

    const mediaKind = unsupportedMedia(input);
    if (mediaKind) {
      throw new Error(`LINKEDIN_${mediaKind}_PUBLISH_NOT_IMPLEMENTED`);
    }
    if (!text(input.text)) {
      throw new Error("LINKEDIN_POST_TEXT_REQUIRED");
    }

    return {
      capability,
      access_token: text(input.access_token),
      author_urn: text(input.author_urn),
      text: text(input.text),
      request_identity: text(input.idempotency_key || input.client_request_id) || null,
    };
  },

  async execute(input = {}) {
    const validated = this.validateInput(input);
    return publishTextPost(validated);
  },
};

async function publishTextPost({
  access_token,
  author_urn,
  text: postText,
  request_identity,
}) {
  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: author_urn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: postText,
          },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new Error(boundedError(result?.message || result?.error?.message));
  }

  const publicationId =
    text(response.headers.get("x-restli-id")) ||
    text(result?.id || result?.post_id) ||
    null;
  if (!publicationId) {
    throw new Error("LINKEDIN_PUBLICATION_ID_REQUIRED");
  }

  return {
    success: true,
    provider: "linkedin",
    output: {
      id: publicationId,
      post_id: publicationId,
      media_kind: "text",
      request_identity,
      provider_idempotency_supported: false,
    },
  };
}
