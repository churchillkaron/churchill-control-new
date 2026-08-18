export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-filmreview-20260818-63f0c92a";

const SHOTS = Object.freeze({
  field: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/bf710577-3c52-4d22-b695-f6242c8d0caa-gemini-by1086blb68c.mp4",
  restaurant: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4",
  manager: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4",
  hotel: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4",
  kitchen: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4",
  bar: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/316fafe1-6521-4879-8431-4c4fd428a821-gemini-mxcowg69gr1f.mp4",
  hospital: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/9b34b515-b9e4-4772-b142-c4ab375ed5ba-gemini-zzz5upejcnut.mp4",
  warehouse: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4",
  finance: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4",
  people: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4",
  compliance: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/a9568908-d7d6-402c-83ff-cf4376c2f9d8-gemini-qztxkgp5yet3.mp4",
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
