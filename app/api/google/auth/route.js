export const dynamic = "force-dynamic";

import { getOAuthClient } from "@/lib/integrations/googleAuth";

export async function GET() {
  try {
    const oauth2Client = getOAuthClient();

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });

    console.log("AUTH URL:", url);
    console.log("Redirect URI:", oauth2Client.redirectUri);

    return Response.redirect(url);

  } catch (err) {
    console.error("AUTH ERROR:", err);
    return new Response("Auth failed", { status: 500 });
  }
}