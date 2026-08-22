export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { GET as runOpening } from "../avantiqo-synthetic-intelligence-opening-v1/route";

const TOKEN = "avq-synthetic-intelligence-opening-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return json({ success: false }, 404);
  }

  const credential = await resolveProviderCredential({
    organization_id: ORGANIZATION_ID,
    provider: "runway",
  });
  const apiKey = String(
    credential?.api_key ||
    credential?.apiKey ||
    credential?.secret_reference ||
    "",
  ).trim();

  if (!apiKey) {
    return json({
      success: false,
      error: "RUNWAY_MANAGED_CREDENTIAL_UNRESOLVED",
      credential_object_present: Boolean(credential),
    }, 500);
  }

  const previous = process.env.RUNWAY_API_KEY;
  process.env.RUNWAY_API_KEY = apiKey;
  try {
    return await runOpening(request);
  } finally {
    if (previous === undefined) delete process.env.RUNWAY_API_KEY;
    else process.env.RUNWAY_API_KEY = previous;
  }
}
