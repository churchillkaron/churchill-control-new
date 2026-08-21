export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const TOKEN = "avq-investor-spatial-batch-20260821";
const UNIT_TOKEN = "avq-investor-spatial-master-v2-20260821";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const requested = String(url.searchParams.get("units") || "2,3,4,5,6,7,8,9,10,11,12")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12);
    const units = [...new Set(requested)];
    if (!units.length) return json({ success: false, error: "No valid units" }, 400);

    const results = await Promise.all(units.map(async (index) => {
      const child = new URL("/api/internal/creative-investor-spatial-master-v2", url.origin);
      child.searchParams.set("action", "render-unit");
      child.searchParams.set("index", String(index));
      child.searchParams.set("token", UNIT_TOKEN);
      try {
        const response = await fetch(child, {
          method: "GET",
          cache: "no-store",
          headers: { "x-avantiqo-batch-parent": "spatial-master-v2" },
        });
        const body = await response.text();
        return {
          index,
          status: response.status,
          ok: response.ok,
          body: body.slice(0, 1000),
        };
      } catch (error) {
        return {
          index,
          status: 0,
          ok: false,
          error: error?.message || String(error),
        };
      }
    }));

    return json({
      success: results.every((result) => result.ok),
      units,
      results,
    }, results.every((result) => result.ok) ? 200 : 207);
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}
