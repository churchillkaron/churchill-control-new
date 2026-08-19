export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Production recovery endpoint for the existing Avantiqo investor-film interaction.
import "@/lib/platform/service-runtime/providers/gemini/ManagedGeminiCredentialRegistration.js";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { uploadCreativeAsset } from "@/lib/creative/assets/storage/uploadCreativeAsset";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

function text(value) {
  return String(value || "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function videoCandidate(value) {
  const content = object(value);
  return text(content.type).toLowerCase() === "video" && (content.data || content.uri)
    ? content
    : null;
}

function findVideoContent(payload) {
  const root = object(payload);

  if (object(root.output_video).data || object(root.output_video).uri) {
    return root.output_video;
  }

  for (const step of Array.isArray(root.steps) ? root.steps : []) {
    const stepObject = object(step);
    const candidates = [
      ...(Array.isArray(stepObject.content) ? stepObject.content : []),
      ...(Array.isArray(stepObject.output) ? stepObject.output : []),
    ];

    for (const candidate of candidates) {
      const video = videoCandidate(candidate);
      if (video) return video;
    }
  }

  for (const candidate of Array.isArray(root.outputs) ? root.outputs : []) {
    const video = videoCandidate(candidate);
    if (video) return video;
  }

  return null;
}

function stepTypes(payload) {
  return (Array.isArray(object(payload).steps) ? object(payload).steps : [])
    .map((step) => text(object(step).type))
    .filter(Boolean)
    .slice(0, 20);
}

async function videoBytes(video, apiKey) {
  if (video?.data) {
    return Buffer.from(String(video.data), "base64");
  }

  const uri = text(video?.uri);
  if (!uri) return Buffer.alloc(0);

  const response = await fetch(uri, {
    method: "GET",
    headers: {
      "x-goog-api-key": apiKey,
      Accept: "video/mp4,application/octet-stream,*/*",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GEMINI_VIDEO_DOWNLOAD_FAILED:${response.status}:${body.slice(0, 240)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = text(url.searchParams.get("token"));
    const interactionId = text(url.searchParams.get("interaction_id"));
    const usageId = text(url.searchParams.get("usage_id"));

    if (token !== TOKEN) {
      return Response.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    if (!interactionId || !usageId) {
      return Response.json(
        { success: false, error: "interaction_id and usage_id required" },
        { status: 400 },
      );
    }

    const credential = await resolveProviderCredential({
      organization_id: ORGANIZATION_ID,
      provider: "gemini",
    });

    if (!credential?.api_key) {
      throw new Error("GEMINI_CREDENTIAL_UNAVAILABLE");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(interactionId)}`,
      {
        method: "GET",
        headers: {
          "x-goog-api-key": credential.api_key,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    const bodyText = await response.text();
    let payload = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          error: "GEMINI_INTERACTION_RECOVERY_FAILED",
          status: response.status,
          provider_message: text(payload?.error?.message) || bodyText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const video = findVideoContent(payload);
    if (!video) {
      return Response.json(
        {
          success: false,
          pending: text(payload?.status).toLowerCase() !== "completed",
          error: "VIDEO_OUTPUT_NOT_AVAILABLE",
          interaction_status: text(payload?.status) || null,
          interaction_model: text(payload?.model) || null,
          step_types: stepTypes(payload),
          interaction_id: interactionId,
          usage_id: usageId,
        },
        { status: text(payload?.status).toLowerCase() === "completed" ? 502 : 202 },
      );
    }

    const bytes = await videoBytes(video, credential.api_key);
    if (!bytes.length) throw new Error("RECOVERED_VIDEO_EMPTY");

    const mimeType = text(video.mime_type || video.mimeType) || "video/mp4";
    const upload = await uploadCreativeAsset({
      file: {
        buffer: bytes,
        name: `avantiqo-investor-manager-${usageId}.mp4`,
        type: mimeType,
      },
      organizationId: ORGANIZATION_ID,
    });

    return Response.json({
      success: true,
      recovered: true,
      recovery_source: video.data ? "inline" : "uri",
      interaction_status: text(payload?.status) || null,
      interaction_id: interactionId,
      usage_id: usageId,
      file_url: upload.file_url,
      inspection_url: upload.inspection_url,
      inspection_url_expires_in_seconds: upload.inspection_url_expires_in_seconds,
      mime_type: upload.mime_type,
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "RECOVERY_FAILED",
      },
      { status: 500 },
    );
  }
}
