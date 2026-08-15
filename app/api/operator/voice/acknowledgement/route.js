import {
  generateOperatorVoiceAcknowledgement,
} from "@/lib/operator/runtime/OperatorVoiceAcknowledgementRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await generateOperatorVoiceAcknowledgement({
      locale: text(body.locale) || null,
      previousAcknowledgement:
        text(body.previousAcknowledgement) ||
        text(body.previous_acknowledgement) ||
        null,
    });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("OPERATOR_VOICE_ACKNOWLEDGEMENT_ERROR", error);
    return errorResponse(
      error?.message || "Avantiqo voice acknowledgement failed",
      error?.status || 500,
    );
  }
}
