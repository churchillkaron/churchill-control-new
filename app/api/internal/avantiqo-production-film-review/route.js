export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-filmreview-20260818-63f0c92a";

const ASSETS = Object.freeze({
  field: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/bf710577-3c52-4d22-b695-f6242c8d0caa-gemini-by1086blb68c.mp4" },
  restaurant: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4" },
  manager: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4" },
  hotel: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4" },
  kitchen: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4" },
  bar: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/316fafe1-6521-4879-8431-4c4fd428a821-gemini-mxcowg69gr1f.mp4" },
  hospital: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/9b34b515-b9e4-4772-b142-c4ab375ed5ba-gemini-zzz5upejcnut.mp4" },
  warehouse: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4" },
  finance: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4" },
  people: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4" },
  compliance: { type: "video/mp4", path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/a9568908-d7d6-402c-83ff-cf4376c2f9d8-gemini-qztxkgp5yet3.mp4" },
  voice: { type: "audio/mpeg", path: "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar.mp3" },
});

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return Response.json({ success: false }, { status: 404 });
    }

    const assetName = url.searchParams.get("shot") || url.searchParams.get("asset") || "field";
    const asset = ASSETS[assetName];
    if (!asset) {
      return Response.json({ success: false, error: "Unknown asset" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("creative-assets")
      .download(asset.path);
    if (error) throw error;

    const bytes = Buffer.from(await data.arrayBuffer());
    const mode = url.searchParams.get("mode") || "raw";

    if (mode === "meta") {
      return Response.json({
        success: true,
        asset: assetName,
        content_type: asset.type,
        bytes: bytes.length,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (mode === "chunk") {
      const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
      const requestedLength = Math.max(1, Math.min(262144, Number.parseInt(url.searchParams.get("length") || "196608", 10) || 196608));
      const end = Math.min(bytes.length, offset + requestedLength);
      const chunk = bytes.subarray(offset, end);
      return Response.json({
        success: true,
        asset: assetName,
        offset,
        next_offset: end,
        total_bytes: bytes.length,
        done: end >= bytes.length,
        base64: chunk.toString("base64"),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    return new Response(bytes, {
      headers: {
        "Content-Type": asset.type,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="avantiqo-${assetName}.${asset.type === "audio/mpeg" ? "mp3" : "mp4"}`,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
