export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { GET as executeOneTimeReview } from "../route";

export async function GET(request, { params }) {
  const key = String(params?.key || "").trim();
  if (!key) return executeOneTimeReview(request);

  const url = new URL(request.url);
  url.searchParams.set("token", key);

  return executeOneTimeReview(
    new Request(url, {
      method: "GET",
      headers: request.headers,
      cache: "no-store",
    }),
  );
}
