export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = "churchill-night-changes-v3-repair-qc-20260821";
const QC_URL = "https://avantiqo.ai/api/internal/creative-churchill-night-changes-v3-repair-qc";
const SHOTS = new Set(["shuffleboard_to_dart", "electric_dart_flight"]);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const shot = String(url.searchParams.get("shot") || "").trim();
    if (!SHOTS.has(shot)) return json({ success: false, error: "Invalid shot" }, 400);

    const qc = new URL(QC_URL);
    qc.searchParams.set("token", TOKEN);
    qc.searchParams.set("shot", shot);
    const response = await fetch(qc, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload?.success || !payload?.jpeg_base64) {
      throw new Error(payload?.error || `QC sheet failed ${response.status}`);
    }
    const buffer = Buffer.from(payload.jpeg_base64, "base64");
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store, private",
        "X-Churchill-QC-Shot": shot,
      },
    });
  } catch (error) {
    console.error("CHURCHILL_V3_REPAIR_QC_IMAGE_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
