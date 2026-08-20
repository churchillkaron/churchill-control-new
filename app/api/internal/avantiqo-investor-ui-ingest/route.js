export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  getAvantiqoInvestorUiIngestionStatus,
  getAvantiqoInvestorUiSlots,
  ingestAvantiqoInvestorUiFrame,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorUiIngestionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN_SHA256 = "b01a390b5221135fdc7a68fa22af5404438c020d97cde0339b64bbbb69abd50c";
const MAX_BOOTSTRAP_BYTES = 300 * 1024;
const MAX_PACK_BYTES = 600 * 1024;
const MAX_PACK_ITEMS = 6;

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

function decodeBase64Url(value, maxBytes = MAX_BOOTSTRAP_BYTES) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Buffer.from(padded, "base64");
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error("INVESTOR_UI_BOOTSTRAP_PAYLOAD_INVALID");
  }
  return bytes;
}

function decodeBase64(value, maxBytes = MAX_BOOTSTRAP_BYTES) {
  const bytes = Buffer.from(text(value), "base64");
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error("INVESTOR_UI_STAGED_PAYLOAD_INVALID");
  }
  return bytes;
}

function bootstrapFile(bytes, slot) {
  return {
    name: `${slot}.jpg`,
    type: "image/jpeg",
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

async function ingestBootstrapItem(item) {
  const slot = text(item?.slot);
  const encoded = text(item?.data);
  if (!slot) throw new Error("INVESTOR_UI_SLOT_REQUIRED");
  if (!encoded) throw new Error(`INVESTOR_UI_DATA_REQUIRED:${slot}`);
  const bytes = decodeBase64Url(encoded);
  return ingestAvantiqoInvestorUiFrame({
    slot,
    file: bootstrapFile(bytes, slot),
    crop: null,
    approvedBy: "user",
  });
}

async function ingestStagedRows() {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id, file_name, metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>investor_ui_staging", "true")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return {
      success: true,
      staged_ingestion: true,
      staged_count: 0,
      ingested_count: 0,
      results: [],
    };
  }

  const allowedSlots = new Set(getAvantiqoInvestorUiSlots().map((slot) => slot.key));
  const results = [];
  const completedIds = [];

  for (const row of rows) {
    const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const slot = text(metadata.ui_slot);
    if (!allowedSlots.has(slot)) {
      throw new Error(`INVESTOR_UI_STAGED_SLOT_NOT_ALLOWED:${slot || "missing"}`);
    }
    const encoded = text(metadata.bootstrap_base64);
    if (!encoded) throw new Error(`INVESTOR_UI_STAGED_DATA_REQUIRED:${slot}`);
    const mime = text(metadata.bootstrap_mime_type || "image/jpeg").toLowerCase();
    if (mime !== "image/jpeg") {
      throw new Error(`INVESTOR_UI_STAGED_MIME_NOT_ALLOWED:${slot}`);
    }

    const bytes = decodeBase64(encoded);
    const result = await ingestAvantiqoInvestorUiFrame({
      slot,
      file: {
        name: text(row.file_name) || `${slot}.jpg`,
        type: mime,
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      },
      crop: null,
      approvedBy: "user",
    });
    results.push(result);
    completedIds.push(row.id);
  }

  if (completedIds.length) {
    const { error: deleteError } = await supabaseAdmin
      .from("creative_assets")
      .delete()
      .in("id", completedIds);
    if (deleteError) throw deleteError;
  }

  return {
    success: true,
    staged_ingestion: true,
    staged_count: rows.length,
    ingested_count: results.length,
    deleted_staging_rows: completedIds.length,
    results,
  };
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

    if (action === "bootstrap-staged") {
      return json(await ingestStagedRows());
    }

    if (action === "bootstrap") {
      const result = await ingestBootstrapItem({
        slot: url.searchParams.get("slot"),
        data: url.searchParams.get("data"),
      });
      return json({ ...result, bootstrap_transfer: true });
    }

    if (action === "bootstrap-pack") {
      const encoded = text(url.searchParams.get("pack"));
      if (!encoded) return json({ success: false, error: "pack required" }, 400);
      const packBytes = decodeBase64Url(encoded, MAX_PACK_BYTES);
      const pack = JSON.parse(packBytes.toString("utf8"));
      const items = Array.isArray(pack?.items) ? pack.items : [];
      if (!items.length || items.length > MAX_PACK_ITEMS) {
        return json({ success: false, error: "pack items invalid" }, 400);
      }
      const results = [];
      for (const item of items) {
        results.push(await ingestBootstrapItem(item));
      }
      return json({
        success: true,
        bootstrap_pack_transfer: true,
        item_count: results.length,
        results,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
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
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}
