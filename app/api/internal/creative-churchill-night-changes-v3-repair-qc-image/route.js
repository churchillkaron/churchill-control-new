export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = "churchill-night-changes-v3-repair-qc-20260821";
const QC_URL = "https://avantiqo.ai/api/internal/creative-churchill-night-changes-v3-repair-qc";
const R1_SHOTS = new Set(["shuffleboard_to_dart", "electric_dart_flight"]);
const R2_SHOTS = new Set(["shuffleboard_exit_r2", "dart_entry_r2", "dart_midflight_r2", "dart_impact_r2"]);
const R2B_SHOTS = new Set(["dart_entry_r2b", "dart_midflight_r2b", "dart_impact_r2b"]);

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const shot = String(url.searchParams.get("shot") || "").trim();
    const requestedVersion = String(url.searchParams.get("version") || "r1").trim().toLowerCase();
    const version = requestedVersion === "r2b" ? "r2b" : requestedVersion === "r2" ? "r2" : "r1";
    const allowed = version === "r2b" ? R2B_SHOTS : version === "r2" ? R2_SHOTS : R1_SHOTS;
    if (!allowed.has(shot)) return json({ success: false, error: "Invalid shot" }, 400);

    const qc = new URL(QC_URL);
    qc.searchParams.set("token", TOKEN);
    qc.searchParams.set("shot", shot);
    qc.searchParams.set("version", version);
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
        "X-Churchill-QC-Version": version,
      },
    });
  } catch (error) {
    console.error("CHURCHILL_V3_REPAIR_QC_IMAGE_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
