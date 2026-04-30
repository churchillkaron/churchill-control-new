"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function LoginCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleLoginFlow = async () => {
      try {
        // DEV MODE
        if (DEV_MODE) {
          document.cookie = "role=Owner; path=/";
          document.cookie = "setup_complete=true; path=/";
          document.cookie = "subscription=active; path=/";
          setTimeout(() => {
  router.push("/dashboard");
}, 100);
          return;
        }

        // 1. AUTH USER
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
          return;
        }

        // 2. STAFF
        const { data: staff } = await supabase
          .from("staff_accounts")
          .select("tenant_id, role")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!staff) {
          console.warn("No staff row → fallback");
          router.push("/staff");
          return;
        }

        // 🔥 NORMALIZE ROLE (THIS FIXES YOUR ISSUE)
        const role = (staff.role || "staff").toLowerCase().trim();

        // 3. TENANT
        let tenant = null;

        if (staff.tenant_id) {
          const { data } = await supabase
            .from("tenants")
            .select("subscription_status, setup_step, setup_complete")
            .eq("id", staff.tenant_id)
            .maybeSingle();

          tenant = data;
        }

        // STORE STATE
        document.cookie = `role=${role}; path=/`;
        document.cookie = `setup_complete=${tenant?.setup_complete ?? false}; path=/`;
        document.cookie = `subscription=${tenant?.subscription_status ?? "inactive"}; path=/`;

        // 4. SUBSCRIPTION
        if (tenant && tenant.subscription_status !== "active") {
          router.push("/subscribe");
          return;
        }

        // 5. SETUP
        if (tenant && !tenant.setup_complete) {
          const step = tenant.setup_step || 1;
          router.push(`/system-setup/step-${step}`);
          return;
        }

        // 6. ROLE ROUTING (NOW BULLETPROOF)
        if (role === "owner" || role === "general manager") {
          router.push("/control");
          return;
        }

        if (role === "manager") {
          router.push("/dashboard");
          return;
        }

        if (role === "production") {
          router.push("/production");
          return;
        }

        // DEFAULT
        router.push("/staff");

      } catch (err) {
        console.error("Login callback fatal error:", err);
        router.push("/");
      }
    };

    handleLoginFlow();
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-black text-white">
      <p className="text-white/60">Loading your system...</p>
    </div>
  );
}