import { supabaseAdmin } from "@/lib/supabase-admin";

function makeClientName(email) {
  if (!email) return "New Client";
  const base = email.split("@")[0] || "client";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function makeLogo(name) {
  if (!name) return "CL";
  return name.trim().slice(0, 2).toUpperCase();
}

export async function POST(req) {
  try {
    const { userId, email } = await req.json();

    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, client_id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile?.client_id) {
      return Response.json({ success: true, alreadyExists: true });
    }

    const clientName = makeClientName(email);
    const clientLogo = makeLogo(clientName);

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert([
        {
          name: clientName,
          logo: clientLogo,
          primary_color: "#f97316",
        },
      ])
      .select()
      .single();

    if (clientError) {
      console.error(clientError);
      return Response.json({ error: "Failed to create client" }, { status: 500 });
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert([
        {
          id: userId,
          client_id: client.id,
          plan: "free",
          usage: 0,
        },
      ]);

    if (profileError) {
      console.error(profileError);
      return Response.json({ error: "Failed to create profile" }, { status: 500 });
    }

    return Response.json({
      success: true,
      clientId: client.id,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Onboarding failed" }, { status: 500 });
  }
}