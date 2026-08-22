export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TOKEN = "churchill-night-changes-v3-repair-qc-20260821";
const R1_SHOTS = new Set(["shuffleboard_to_dart", "electric_dart_flight"]);
const R2_SHOTS = new Set(["shuffleboard_exit_r2", "dart_entry_r2", "dart_midflight_r2", "dart_impact_r2"]);
const WIDTH = 660;
const HEIGHT = 248;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function pdfFromJpeg(jpeg) {
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const push = (value) => {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "binary");
    chunks.push(buffer);
    length += buffer.length;
  };
  const object = (number, bodyParts) => {
    offsets[number] = length;
    push(`${number} 0 obj\n`);
    for (const part of bodyParts) push(part);
    push("\nendobj\n");
  };

  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary"));
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  object(4, [
    `<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    "\nendstream",
  ]);
  const content = Buffer.from(`q\n${WIDTH} 0 0 ${HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`, "ascii");
  object(5, [`<< /Length ${content.length} >>\nstream\n`, content, "endstream"]);

  const xrefOffset = length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) {
    push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const shot = String(url.searchParams.get("shot") || "").trim();
    const version = String(url.searchParams.get("version") || "r1").trim().toLowerCase() === "r2" ? "r2" : "r1";
    const allowed = version === "r2" ? R2_SHOTS : R1_SHOTS;
    if (!allowed.has(shot)) return json({ success: false, error: "Invalid shot" }, 400);

    const imageUrl = new URL("/api/internal/creative-churchill-night-changes-v3-repair-qc-image", url.origin);
    imageUrl.searchParams.set("token", TOKEN);
    imageUrl.searchParams.set("shot", shot);
    imageUrl.searchParams.set("version", version);
    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`QC image failed ${response.status}`);
    const jpeg = Buffer.from(await response.arrayBuffer());
    if (!jpeg.length) throw new Error("QC image empty");
    const pdf = pdfFromJpeg(jpeg);
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename=churchill-${shot}-${version}-qc.pdf`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    console.error("CHURCHILL_V3_REPAIR_QC_PDF_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
