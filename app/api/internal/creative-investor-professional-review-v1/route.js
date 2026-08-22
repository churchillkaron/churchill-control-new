export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const ASSETS = Object.freeze({
  communication_preview: `${ORG}/${PROJECT}/scene-previews-20260822/communication-cinematic-professional-v1.mp4`,
  studio_preview: `${ORG}/${PROJECT}/scene-previews-20260822/studio-marketing-professional-v1.mp4`,
});

async function signed(path) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 900);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`SIGNED_URL_MISSING:${path}`);
  return data.signedUrl;
}

export async function GET(request) {
  const review = new URL(request.url).searchParams.get("review");
  if (review !== "cinematic-v1") return NextResponse.json({ success:false, error:"NOT_FOUND" }, { status:404 });
  const entries = await Promise.all(Object.entries(ASSETS).map(async ([key, path]) => [key, { signed_url: await signed(path) }]));
  return NextResponse.json({ success:true, contract:"AVANTIQO_INVESTOR_PROFESSIONAL_REVIEW_V1", expires_seconds:900, assets:Object.fromEntries(entries) });
}
