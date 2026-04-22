export async function GET(request) {
  const token = request.cookies.get("fb_token")?.value;

  if (!token) {
    return Response.json({ error: "No token" }, { status: 401 });
  }

  const res = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email&access_token=${token}`
  );

  const data = await res.json();

  return Response.json(data);
}