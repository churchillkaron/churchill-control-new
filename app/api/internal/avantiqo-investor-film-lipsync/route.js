export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = "avq-investor-lipsync-20260819-v1";

const IDENTITY_CONTRACT = Object.freeze({
  status: "BLOCKED",
  reason: "FOUNDER_IDENTITY_NOT_VERIFIED",
  rule: "Investor-film lip sync is forbidden until every founder-visible source is verified as the same approved founder identity.",
  approved_reference_asset_id: "052e10e2-432e-4cf9-82bd-65cb5bb7441a",
  approved_reference_path:
    "33336a72-acb5-474e-856b-8be0269360e2/unassigned/ca19f771-e2ad-4e62-ac50-19ff8efed996-avantiqo-founder-speaking-keyframe.jpg",
  requirements: [
    "Use only the approved founder reference as identity source of truth.",
    "All founder shots must depict the same person as the approved reference.",
    "Identity must be visually verified before lip sync is allowed.",
    "No generated substitute person is allowed.",
    "No founder clip may enter the final master with identity drift.",
  ],
});

const FOUNDER_SOURCES = Object.freeze({
  f01: {
    source_path:
      "33336a72-acb5-474e-856b-8be0269360e2/unassigned/a6089db7-57fd-47f8-b138-b63e92e40698-gemini-knata2wctqhk.mp4",
    identity_verified: false,
    usable_for_lipsync: false,
  },
  f02: {
    source_path:
      "33336a72-acb5-474e-856b-8be0269360e2/unassigned/3a8d8e19-eee4-491d-8923-8d253c60548a-gemini-ekhiyo7vyyqe.mp4",
    identity_verified: false,
    usable_for_lipsync: false,
  },
  f03: {
    source_path:
      "33336a72-acb5-474e-856b-8be0269360e2/unassigned/b94181b3-310e-4f47-9c50-6c9d1890611d-gemini-0m182edqz2p9.mp4",
    identity_verified: false,
    usable_for_lipsync: false,
  },
  f04: {
    source_path:
      "33336a72-acb5-474e-856b-8be0269360e2/unassigned/a8e8ca28-f5b9-463c-b408-5e923d7da4d0-gemini-p57cwqrvz4f2.mp4",
    identity_verified: false,
    usable_for_lipsync: false,
  },
  f05: {
    source_path:
      "33336a72-acb5-474e-856b-8be0269360e2/unassigned/48f07dd4-349a-435d-8d50-cfd1cbb55f55-gemini-5ofkbhixuv67.mp4",
    identity_verified: false,
    usable_for_lipsync: false,
  },
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  const url = new URL(request.url);

  if (url.searchParams.get("token") !== TOKEN) {
    return json({ success: false }, 404);
  }

  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    return json({
      success: true,
      lip_sync_enabled: false,
      identity_contract: IDENTITY_CONTRACT,
      founder_sources: FOUNDER_SOURCES,
      next_required_gate: "REGENERATE_OR_REPLACE_FOUNDER_SHOTS_WITH_VERIFIED_APPROVED_IDENTITY",
    });
  }

  return json(
    {
      success: false,
      error: "FOUNDER_IDENTITY_NOT_VERIFIED",
      lip_sync_enabled: false,
      identity_contract: IDENTITY_CONTRACT,
      requested_action: action,
    },
    409,
  );
}
