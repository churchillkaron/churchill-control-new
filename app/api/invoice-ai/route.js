export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file" }, { status: 400 });
    }

    // 🔥 MOCK AI RESPONSE (so UI works NOW)
    return Response.json({
      vendor: "Makro",
      date: "2026-04-19",
      total: 1230,
      items: [
        { name: "Chicken", price: 500 },
        { name: "Vegetables", price: 300 },
        { name: "Sauce", price: 430 },
      ],
    });

  } catch (err) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}