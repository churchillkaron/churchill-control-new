export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

import crypto from "node:crypto";

import {
  getAvantiqoInvestorUiIngestionStatus,
  getAvantiqoInvestorUiSlots,
  ingestAvantiqoInvestorUiFrame,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorUiIngestionRuntime";

const TOKEN_SHA256 = "b01a390b5221135fdc7a68fa22af5404438c020d97cde0339b64bbbb69abd50c";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function tokenFrom(request, url) {
  return text(
    request.headers.get("x-avantiqo-investor-ui-token") ||
      url.searchParams.get("token"),
  );
}

function validToken(value) {
  if (!value) return false;
  const digest = crypto.createHash("sha256").update(value).digest("hex");
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(TOKEN_SHA256, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCrop(form) {
  const values = {
    left: form.get("crop_left"),
    top: form.get("crop_top"),
    width: form.get("crop_width"),
    height: form.get("crop_height"),
  };
  const present = Object.values(values).some((value) => text(value));
  if (!present) return null;
  return values;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (!validToken(tokenFrom(request, url))) {
      return json({ success: false }, 404);
    }

    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "slots") {
      return json({
        success: true,
        contract: "AVANTIQO_INVESTOR_AUTHENTIC_UI_INGESTION_V1",
        source_policy: "USER_SUPPLIED_AUTHENTIC_AVANTIQO_UI_ONLY",
        synthetic_ui_allowed: false,
        slots: getAvantiqoInvestorUiSlots(),
      });
    }

    if (action === "status") {
      return json(await getAvantiqoInvestorUiIngestionStatus());
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      { success: false, error: error?.message || String(error) },
      500,
    );
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    if (!validToken(tokenFrom(request, url))) {
      return json({ success: false }, 404);
    }

    const contentType = text(request.headers.get("content-type")).toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
      return json({ success: false, error: "multipart/form-data required" }, 415);
    }

    const form = await request.formData();
    const slot = text(form.get("slot"));
    const file = form.get("file");
    if (!slot) return json({ success: false, error: "slot required" }, 400);
    if (!file || typeof file.arrayBuffer !== "function") {
      return json({ success: false, error: "file required" }, 400);
    }

    const result = await ingestAvantiqoInvestorUiFrame({
      slot,
      file,
      crop: parseCrop(form),
      approvedBy: text(form.get("approved_by")) || "user",
    });

    return json(result);
  } catch (error) {
    return json(
      { success: false, error: error?.message || String(error) },
      500,
    );
  }
}
