export async function POST(req) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // TEMP IMAGE (WORKING CONFIRMATION)
    return Response.json({
      url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e"
    });

  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}