export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { GET as runOpening } from "../avantiqo-synthetic-intelligence-opening-v1/route";

const TOKEN = "avq-synthetic-intelligence-opening-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";

const RUNWAY_ENV_CANDIDATES = [
  "RUNWAY_API_KEY",
  "RUNWAYML_API_SECRET",
  "RUNWAY_API_SECRET",
  "RUNWAYML_API_KEY",
  "AVANTIQO_RUNWAY_API_KEY",
  "RUNWAY_TOKEN",
];

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function runtimeRunwayEnvironment() {
  const matching_names = Object.keys(process.env)
    .filter((key) => key.toUpperCase().includes("RUNWAY"))
    .sort();
  const selected_name = RUNWAY_ENV_CANDIDATES.find((key) => text(process.env[key])) || null;
  return {
    matching_names,
    selected_name,
    api_key: selected_name ? text(process.env[selected_name]) : null,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return json({ success: false }, 404);
  }

  const environment = runtimeRunwayEnvironment();

  if (url.searchParams.get("action") === "probe") {
    return json({
      success: true,
      runway_environment_names: environment.matching_names,
      selected_environment_name: environment.selected_name,
      secret_value_exposed: false,
    });
  }

  const credential = await resolveProviderCredential({
    organization_id: ORGANIZATION_ID,
    provider: "runway",
  });

  const apiKey = text(
    environment.api_key ||
    credential?.api_key ||
    credential?.apiKey ||
    credential?.secret_reference,
  );

  if (!apiKey) {
    return json({
      success: false,
      error: "RUNWAY_MANAGED_CREDENTIAL_UNRESOLVED",
      credential_object_present: Boolean(credential),
      runway_environment_names: environment.matching_names,
      selected_environment_name: environment.selected_name,
      secret_value_exposed: false,
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
