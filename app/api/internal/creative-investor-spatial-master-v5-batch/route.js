export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const TOKEN = "avq-investor-spatial-master-v5-batch-20260821";
const UNIT_TOKEN = "avq-investor-spatial-master-v5-20260821";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const units = [...new Set(String(url.searchParams.get("units") || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12))];
    if (!units.length || units.length > 3) return json({ success: false, error: "Use 1 to 3 units per batch" }, 400);

    const results = await Promise.all(units.map(async (index) => {
      const child = new URL("/api/internal/creative-investor-spatial-master-v5", url.origin);
      child.searchParams.set("action", "render-unit");
      child.searchParams.set("index", String(index));
      child.searchParams.set("token", UNIT_TOKEN);
      try {
        const response = await fetch(child, {
          method: "GET",
          cache: "no-store",
          headers: { "x-avantiqo-v5-batch": "ai-hero" },
        });
        return { index, ok: response.ok, status: response.status, body: (await response.text()).slice(0, 700) };
      } catch (error) {
        return { index, ok: false, status: 0, error: error?.message || String(error) };
      }
    }));

    return json({ success: results.every((result) => result.ok), units, results }, results.every((result) => result.ok) ? 200 : 207);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
