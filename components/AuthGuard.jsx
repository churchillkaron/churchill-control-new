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

  const router =
    useRouter();

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    allowed,
    setAllowed,
  ] = useState(false);

  useEffect(() => {

    async function validate() {

      try {

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {

          router.push("/");

          return;
        }

        const {
          data: staff,
        } = await supabase
          .from(
            "staff_accounts"
          )
          .select("*")
          .eq(
            "auth_user_id",
            user.id
          )
          .single();

        if (!staff) {

          router.push("/");

          return;
        }

        const hasPermission =
          await checkPermission({

            tenantId:
              staff.tenant_id,

            role:
              staff.role,

            module,

            action,
          });

        if (
          !hasPermission
        ) {

          router.push(
            "/dashboard"
          );

          return;
        }

        setAllowed(true);

      } catch (error) {

        console.error(
          error
        );

        router.push("/");

      } finally {

        setLoading(false);
      }
    }

    validate();

  }, [
    module,
    action,
    router,
  ]);

  if (loading) {

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050507] text-white/40">
        Validating access...
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return children;
}
