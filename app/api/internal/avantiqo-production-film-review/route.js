export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-filmreview-20260818-63f0c92a";

const SHOTS = Object.freeze({
  field: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/903afddf-a4ea-45e4-9669-9dcafaf83865-gemini-vj2dt1zg82ua.mp4",
  restaurant: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/a5732282-d1c0-4847-bda8-d02e6b43b861-gemini-hfp3imzq2r6w.mp4",
  manager: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/ab5caa4a-0713-4598-a0d0-c82e6a2f34b0-gemini-66eagegcn0f2.mp4",
});

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return Response.json({ success: false }, { status: 404 });
    }

    const shot = url.searchParams.get("shot") || "field";
    const path = SHOTS[shot];
    if (!path) {
      return Response.json({ success: false, error: "Unknown shot" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("creative-assets")
      .download(path);
    if (error) throw error;

    const bytes = Buffer.from(await data.arrayBuffer());
    return new Response(bytes, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="avantiqo-${shot}.mp4"`,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
