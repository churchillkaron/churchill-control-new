"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/shared/supabase/client";
import { checkPermission } from "@/lib/auth/checkPermission";

export default function AuthGuard({
  module,
  action = "can_view",
  children,
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    async function validate() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user || null;

        if (!user) {
          router.push("/");
          return;
        }

        const { data: staff, error: staffError } = await supabase
          .from("staff_accounts")
          .select("id,role,active_organization_id")
          .eq("auth_user_id", user.id)
          .eq("active", true)
          .limit(1)
          .maybeSingle();

        if (staffError || !staff?.active_organization_id) {
          router.push("/");
          return;
        }

        const hasPermission = await checkPermission({
          organizationId: staff.active_organization_id,
          role: staff.role,
          module,
          action,
        });

        if (!hasPermission) {
          router.push("/dashboard");
          return;
        }

        setAllowed(true);
      } catch (error) {
        console.error("AUTH_GUARD_ERROR", error);
        router.push("/");
      } finally {
        setLoading(false);
      }
    }

    validate();
  }, [module, action, router]);

  if (loading || !allowed) {
    return null;
  }

  return children;
}
