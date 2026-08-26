import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { ingestSecretaryMeetingAudio } from "@/lib/operator/secretary/SecretaryMeetingAudioRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function clean(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit) || null;
}

function response(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function statusFor(message) {
  if (/REQUIRED|INVALID|EMPTY|AUTHORIZATION/i.test(message)) return 400;
  if (/NOT_FOUND/i.test(message)) return 404;
  if (/NOT_CAPTURING/i.test(message)) return 409;
  return 500;
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const organizationId = clean(form.get("organization_id") || form.get("organizationId"), 120);
    const meetingId = clean(form.get("meeting_id") || form.get("meetingId"), 120);
    const audio = form.get("audio");
    if (!organizationId || !meetingId || !audio || typeof audio.arrayBuffer !== "function") {
      return response("organization_id, meeting_id and audio required", 400);
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return response(access.error, access.status);

    const result = await ingestSecretaryMeetingAudio({
      context: {
        organizationId: access.organizationId,
        entityId: clean(form.get("entity_id") || form.get("entityId"), 120),
        actor: { partyId: clean(access.partyId || access.party_id, 120) },
      },
      meetingId,
      audio,
      mimeType: clean(form.get("mime_type") || form.get("mimeType"), 120) || audio.type || "audio/webm",
      fileName: clean(form.get("file_name") || form.get("fileName"), 500) || audio.name || "meeting-chunk.webm",
      language: clean(form.get("language"), 80),
      chunkNumber: form.get("chunk_number") ?? form.get("chunkNumber"),
      chunkStartedOffsetMs: form.get("chunk_started_offset_ms") ?? form.get("chunkStartedOffsetMs") ?? 0,
    });

    return NextResponse.json(
      { success: true, organization_id: access.organizationId, ...result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error?.message || "Secretary meeting audio ingestion failed";
    console.error("SECRETARY_MEETING_AUDIO_INGEST_FAILED", message);
    return response(message, statusFor(message));
  }
}
