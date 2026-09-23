import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { supplierMediaUploadContext } from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp"]);

function respond(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function POST(request) {
  try {
    const context = await supplierMediaUploadContext();
    if (!context.success) return respond(context);

    const formData = await request.formData();
    const file = formData.get("file");
    const kind = String(formData.get("kind") || "product").trim().toLowerCase();
    if (!["logo","product"].includes(kind)) return respond({ success:false, status:400, error:"kind must be logo or product" });
    if (!file || typeof file.arrayBuffer !== "function" || Number(file.size || 0) <= 0) {
      return respond({ success:false, status:400, error:"Image file is required" });
    }
    if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
      return respond({ success:false, status:400, error:"Image must be 8 MB or smaller" });
    }
    if (!ALLOWED.has(String(file.type || ""))) {
      return respond({ success:false, status:400, error:"Image must be JPG, PNG or WEBP" });
    }

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `supplier-storefronts/${context.account.id}/${kind}/${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from("uploads").upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data } = supabaseAdmin.storage.from("uploads").getPublicUrl(path);
    return respond({ success:true, kind, url:data.publicUrl, path });
  } catch (error) {
    return respond({ success:false, error:error?.message || "Unable to upload supplier image" });
  }
}
