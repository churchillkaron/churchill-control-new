"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function LoginCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleLoginFlow = async () => {
      try {
        // DEV MODE
        if (DEV_MODE) {
          document.cookie = "role=Owner; path=/";
          document.cookie = "tenant_id=76e2caa6-dd78-49e5-b0f5-1ff94185c2d4; path=/";
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
          router.push("/workforce");
          return;
        }

        // 🔥 NORMALIZE ROLE (THIS FIXES YOUR ISSUE)
        const role = (staff.role || "staff").toLowerCase().trim();

        // ORGANIZATION ROUTING ONLY

        // 6. ORGANIZATION ROUTING

        const { data: currentUser } =
          await supabase
            .from("staff_accounts")
            .select(
              "active_organization_id"
            )
            .eq(
              "auth_user_id",
              user.id
            )
            .maybeSingle();

        const activeOrganizationId =
          currentUser?.active_organization_id;

        if (
          activeOrganizationId ===
          "9a148429-b6a0-4bc6-ac83-a35c64fb7045"
        ) {

          router.push("/platform");
          return;

        }

        if (
          activeOrganizationId
        ) {

          router.push(
            `/workspace/${activeOrganizationId}`
          );

          return;

        }

        router.push("/workspace");

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