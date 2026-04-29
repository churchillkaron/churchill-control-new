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

      // 🔥 DEV MODE (SAFE)
      if (process.env.NODE_ENV === "development" && DEV_MODE) {
        document.cookie = "role=Owner; path=/";
        document.cookie = "tenant_id=dev; path=/"; // optional test value
        document.cookie = "setup_complete=true; path=/";
        document.cookie = "subscription=active; path=/";

        router.push("/control");
        return;
      }

      // 🔥 REAL AUTH STARTS HERE
      const {
        data: { user },
      } = await supabase.auth.getUser();

       

        // 🔥 2. GET STAFF ACCOUNT (STRICT MATCH)
        const { data: staff, error: staffError } = await supabase
          .from("staff_accounts")
          .select("tenant_id, role")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        // ❌ USER EXISTS BUT NOT LINKED → THIS IS A REAL ERROR
        if (!staff || staffError) {
          console.error("User not linked to staff account:", user.id);
          router.push("/"); // back to landing
          return;
        }

        // ❌ STAFF WITHOUT TENANT → DATA ERROR
        if (!staff.tenant_id) {
          console.error("Staff missing tenant_id");
          router.push("/");
          return;
        }

        // 🔥 3. GET TENANT
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .select("subscription_status, setup_step, setup_complete")
          .eq("id", staff.tenant_id)
          .maybeSingle();

        if (!tenant || tenantError) {
          console.error("Tenant not found");
          router.push("/");
          return;
        }

        // 🔥 STORE SESSION STATE (for middleware / future use)
        document.cookie = `role=${staff.role}; path=/`;
        document.cookie = `setup_complete=${tenant.setup_complete}; path=/`;
        document.cookie = `subscription=${tenant.subscription_status}; path=/`;

        // 🔥 4. SUBSCRIPTION CONTROL (SAAS RULE)
        if (tenant.subscription_status !== "active") {
          router.push("/subscribe");
          return;
        }

        // 🔥 5. SETUP CONTROL (ONBOARDING FLOW)
        if (!tenant.setup_complete) {
          const step = tenant.setup_step || 1;
          router.push(`/system-setup/step-${step}`);
          return;
        }

        // 🔥 6. ROLE-BASED ACCESS (FINAL DESTINATION)
        switch (staff.role) {
          case "Owner":
          case "General Manager":
            router.push("/control");
            break;

          case "Manager":
            router.push("/dashboard");
            break;

          case "Production":
            router.push("/production");
            break;

          case "Staff":
          default:
            router.push("/staff");
            break;
        }

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