import { supabase } from "./supabase";

export async function getCurrentTenant() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // ✅ IF USER EXISTS → NORMAL FLOW
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        const { data: client } = await supabase
          .from("clients")
          .select("*")
          .eq("id", profile.client_id)
          .single();

        return { user, client };
      }
    }

    // 🔥 FALLBACK (DEV MODE)
    return {
      user: { id: "dev-user" },
      client: { id: "dev-client", name: "Dev Mode" },
    };

  } catch (err) {
    console.error("Tenant error:", err);

    // 🔥 FAIL SAFE
    return {
      user: { id: "dev-user" },
      client: { id: "dev-client", name: "Dev Mode" },
    };
  }
}