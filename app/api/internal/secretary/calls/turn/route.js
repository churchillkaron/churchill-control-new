export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  authorizeSecretaryCallIngress,
  secretaryCallIngressUnauthorized,
} from "@/lib/operator/secretary/SecretaryCallIngressAuth";
import { runSecretaryVoiceCallChunk } from "@/lib/operator/secretary/SecretaryVoiceCallGatewayRuntime";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export async function POST(request) {
  if (!authorizeSecretaryCallIngress(request)) {
    return secretaryCallIngressUnauthorized();
  }

  try {
    const contentType = text(request.headers.get("content-type"), 200).toLowerCase();
    let callId = null;
    let audio = null;
    let mimeType = "audio/wav";
    let fileName = "secretary-call.wav";
    let language = null;
    let durationSeconds = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      callId = text(form.get("callId") || form.get("call_id"), 120);
      audio = form.get("audio");
      language = text(form.get("language"), 80) || null;
      durationSeconds = positive(form.get("durationSeconds") || form.get("duration_seconds"));
      if (audio && typeof audio === "object") {
        mimeType = text(audio.type, 120) || mimeType;
        fileName = text(audio.name, 500) || fileName;
      }
    } else {
      const body = await request.json();
      callId = text(body?.callId || body?.call_id, 120);
      language = text(body?.language, 80) || null;
      durationSeconds = positive(body?.durationSeconds || body?.duration_seconds);
      mimeType = text(body?.mimeType || body?.mime_type, 120) || mimeType;
      fileName = text(body?.fileName || body?.file_name, 500) || fileName;
      const encoded = text(body?.audioBase64 || body?.audio_base64, 100000000);
      if (encoded) audio = Buffer.from(encoded, "base64");
    }

    if (!callId || !audio) {
      return Response.json(
        { success: false, error: "callId and audio required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await runSecretaryVoiceCallChunk({
      callId,
      audio,
      mimeType,
      fileName,
      language,
      durationSeconds,
    });

    return Response.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("SECRETARY_CALL_TURN_INGRESS_FAILED", error?.message || error);
    return Response.json(
      { success: false, error: error?.message || "Secretary call turn failed" },
      { status: error?.status || 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
