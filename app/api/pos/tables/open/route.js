export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json();
  const context = body.context && typeof body.context === "object"
    ? body.context
    : {
        type: "service_location",
        id: body.tableId || body.table_id || null,
        reference:
          body.tableNumber ||
          body.table_number ||
          body.table ||
          null,
      };
  const translatedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      context,
    }),
  });
  const { POST: openContext } = await import("@/app/api/pos/contexts/open/route");
  return openContext(translatedRequest);
}
