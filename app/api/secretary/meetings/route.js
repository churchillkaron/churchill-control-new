import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  finalizeSecretaryMeeting,
  getSecretaryMeeting,
  startSecretaryMeeting,
} from "@/lib/operator/secretary/SecretaryMeetingRuntime";
import { mapSecretaryMeetingSpeaker } from "@/lib/operator/secretary/SecretaryMeetingSpeakerRuntime";

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
  if (/REQUIRED|INVALID|AUTHORIZATION/i.test(message)) return 400;
  if (/NOT_FOUND/i.test(message)) return 404;
  if (/NOT_CAPTURING|NOT_FINALIZABLE|ALREADY_MAPPED/i.test(message)) return 409;
  return 500;
}

function context(access, body = {}) {
  return {
    organizationId: access.organizationId,
    entityId: clean(body.entity_id || body.entityId, 120),
    timezone: clean(body.timezone, 120) || "UTC",
    actor: { partyId: clean(access.partyId || access.party_id, 120) },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organization_id") || url.searchParams.get("organizationId"), 120);
    const meetingId = clean(url.searchParams.get("meeting_id") || url.searchParams.get("meetingId"), 120);
    if (!organizationId || !meetingId) return response("organization_id and meeting_id required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return response(access.error, access.status);

    const result = await getSecretaryMeeting({
      context: context(access),
      payload: { meeting_id: meetingId },
    });
    return NextResponse.json({ success: true, organization_id: access.organizationId, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error?.message || "Secretary meeting lookup failed";
    return response(message, statusFor(message));
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organization_id || body.organizationId, 120);
    if (!organizationId) return response("organization_id required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return response(access.error, access.status);

    const action = clean(body.action, 40)?.toUpperCase() || "START";
    if (action === "START") {
      const result = await startSecretaryMeeting({
        context: context(access, body),
        payload: {
          title: body.title,
          calendar_event_id: body.calendar_event_id || body.calendarEventId,
          started_at: body.started_at || body.startedAt,
          timezone: body.timezone,
          primary_language: body.primary_language || body.primaryLanguage,
          capture_authorized: body.capture_authorized === true || body.captureAuthorized === true,
          participants: Array.isArray(body.participants) ? body.participants : [],
          metadata: {
            ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
            approval_policy: body.approval_policy && typeof body.approval_policy === "object" ? body.approval_policy : {},
            capture_authorization_source: "AUTHENTICATED_ORGANIZATION_USER",
          },
        },
      });
      return NextResponse.json({ success: true, organization_id: access.organizationId, ...result }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (action === "MAP_SPEAKER") {
      const meetingId = clean(body.meeting_id || body.meetingId, 120);
      const speakerKey = clean(body.speaker_key || body.speakerKey, 300);
      const participantId = clean(body.participant_id || body.participantId, 120);
      const partyId = clean(body.party_id || body.partyId, 120);
      if (!meetingId || !speakerKey || (!participantId && !partyId)) {
        return response("meeting_id, speaker_key and participant_id or party_id required", 400);
      }
      const result = await mapSecretaryMeetingSpeaker({
        context: context(access, body),
        payload: {
          meeting_id: meetingId,
          speaker_key: speakerKey,
          participant_id: participantId,
          party_id: partyId,
        },
      });
      return NextResponse.json({ success: true, organization_id: access.organizationId, ...result }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "FINALIZE") {
      const meetingId = clean(body.meeting_id || body.meetingId, 120);
      if (!meetingId) return response("meeting_id required", 400);
      const result = await finalizeSecretaryMeeting({
        context: context(access, body),
        payload: { meeting_id: meetingId, ended_at: body.ended_at || body.endedAt },
      });
      return NextResponse.json({ success: true, organization_id: access.organizationId, ...result }, { headers: { "Cache-Control": "no-store" } });
    }

    return response("SECRETARY_MEETING_ACTION_INVALID", 400);
  } catch (error) {
    const message = error?.message || "Secretary meeting operation failed";
    console.error("SECRETARY_MEETING_OPERATION_FAILED", message);
    return response(message, statusFor(message));
  }
}
