export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createRecordedVoiceProfile,
  deleteVoiceProfile,
  listVoiceProfiles,
  updateVoiceProfile,
} from "@/lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceLibrary";

const CONTRACT = "AVANTIQO_VOICE_LIBRARY_API_V1";

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      contract: CONTRACT,
      error,
    },
    { status },
  );
}

async function authorized(request, organizationId) {
  if (!organizationId) {
    return { response: errorResponse("Organization required", 400) };
  }
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return { response: errorResponse(access.error, access.status || 403) };
  }
  return {
    access,
    organizationId: access.organizationId || organizationId,
    partyId: access.staff?.party_id || access.staff?.partyId || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const entityId = text(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    ) || null;
    const auth = await authorized(request, organizationId);
    if (auth.response) return auth.response;

    const library = await listVoiceProfiles({
      organizationId: auth.organizationId,
      entityId,
      includePreviewUrls: bool(url.searchParams.get("preview")),
    });

    return Response.json({
      success: true,
      contract: CONTRACT,
      ...library,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("AVANTIQO_VOICE_LIBRARY_GET_FAILED", {
      message: error?.message || String(error),
    });
    return errorResponse(error?.message || "Voice Library failed", 500);
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const organizationId = text(form.get("organizationId") || form.get("organization_id"));
    const entityId = text(form.get("entityId") || form.get("entity_id")) || null;
    const audio = form.get("audio");
    const auth = await authorized(request, organizationId);
    if (auth.response) return auth.response;

    if (!audio || typeof audio.arrayBuffer !== "function") {
      return errorResponse("Voice recording required", 400);
    }
    if (!bool(form.get("consentConfirmed") || form.get("consent_confirmed"))) {
      return errorResponse("Voice owner consent required", 400);
    }

    const result = await createRecordedVoiceProfile({
      organizationId: auth.organizationId,
      entityId,
      partyId: auth.partyId,
      name: form.get("name"),
      audio,
      mimeType: form.get("mimeType") || form.get("mime_type") || audio.type,
      consentBasis: form.get("consentBasis") || form.get("consent_basis"),
      consentEvidenceId: form.get("consentEvidenceId") || form.get("consent_evidence_id"),
      deliveryProfile:
        form.get("deliveryProfile") ||
        form.get("delivery_profile") ||
        "avantiqo-secretary-v1",
      referenceDurationSeconds:
        form.get("referenceDurationSeconds") || form.get("reference_duration_seconds"),
    });

    return Response.json({
      success: true,
      contract: CONTRACT,
      ...result,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error?.message || "Voice recording could not be saved";
    console.error("AVANTIQO_VOICE_LIBRARY_POST_FAILED", { message });
    const status = /REQUIRED|INVALID|TOO_|MIME_|CONSENT_/.test(message) ? 400 : 500;
    return errorResponse(message, status);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    const entityId = text(body.entityId || body.entity_id) || null;
    const profileId = text(body.profileId || body.profile_id);
    const auth = await authorized(request, organizationId);
    if (auth.response) return auth.response;
    if (!profileId) return errorResponse("Voice profile required", 400);

    const result = await updateVoiceProfile({
      organizationId: auth.organizationId,
      entityId,
      profileId,
      name: Object.prototype.hasOwnProperty.call(body, "name") ? body.name : null,
      deliveryProfile: Object.prototype.hasOwnProperty.call(body, "deliveryProfile")
        ? body.deliveryProfile
        : Object.prototype.hasOwnProperty.call(body, "delivery_profile")
          ? body.delivery_profile
          : null,
      setDefault: body.setDefault === true || body.set_default === true,
    });

    return Response.json({
      success: true,
      contract: CONTRACT,
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error?.message || "Voice profile could not be updated";
    console.error("AVANTIQO_VOICE_LIBRARY_PATCH_FAILED", { message });
    const status = message.includes("NOT_FOUND") ? 404 : 400;
    return errorResponse(message, status);
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );
    const entityId = text(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    ) || null;
    const profileId = text(
      url.searchParams.get("profileId") || url.searchParams.get("profile_id"),
    );
    const auth = await authorized(request, organizationId);
    if (auth.response) return auth.response;
    if (!profileId) return errorResponse("Voice profile required", 400);

    const result = await deleteVoiceProfile({
      organizationId: auth.organizationId,
      entityId,
      profileId,
    });

    return Response.json({
      success: true,
      contract: CONTRACT,
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error?.message || "Voice profile could not be deleted";
    console.error("AVANTIQO_VOICE_LIBRARY_DELETE_FAILED", { message });
    const status = message.includes("NOT_FOUND") ? 404 : 500;
    return errorResponse(message, status);
  }
}
