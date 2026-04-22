export async function POST(req) {
  try {
    const { imageUrl, caption } = await req.json();

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igUserId = process.env.INSTAGRAM_USER_ID;

    // Create media
    const createRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption,
          access_token: accessToken,
        }),
      }
    );

    const createData = await createRes.json();

    // Publish
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: accessToken,
        }),
      }
    );

    const publishData = await publishRes.json();

    return Response.json({
      success: true,
      postId: publishData.id,
    });

  } catch (err) {
    console.error(err);

    return Response.json({
      success: false,
    });
  }
}