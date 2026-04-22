import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { message, imageUrl, pageId } = await req.json();

    const token = req.cookies.get("fb_token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Missing Facebook token" },
        { status: 401 }
      );
    }

    // get pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v23.0/me/accounts?access_token=${token}`
    );

    const pagesData = await pagesRes.json();

    const page = pagesData.data?.find((p) => p.id === pageId);

    if (!page) {
      return NextResponse.json(
        { error: "Page not found" },
        { status: 400 }
      );
    }

    // post
    const postRes = await fetch(
      `https://graph.facebook.com/${page.id}/photos`,
      {
        method: "POST",
        body: new URLSearchParams({
          url: imageUrl,
          caption: message,
          access_token: page.access_token,
        }),
      }
    );

    const postData = await postRes.json();

    return NextResponse.json({
      success: true,
      postId: postData.id,
    });

  } catch (err) {
    return NextResponse.json(
      { error: "Post failed" },
      { status: 500 }
    );
  }
}