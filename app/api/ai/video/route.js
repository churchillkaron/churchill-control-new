export async function POST(req) {
  try {
    const { image } = await req.json();

    const response = await fetch("https://api.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: image,
        motion: "cinematic",
        duration: 5
      }),
    });

    const data = await response.json();

    return Response.json({
      url: data.video_url,
    });

  } catch (err) {
    console.error(err);

    return Response.json({
      url: null,
    });
  }
}