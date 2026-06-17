"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/shared/supabase/client";

export default function LoginCallback() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
          return;
        }

        const res = await fetch("/api/session/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
          }),
        });

        const data = await res.json();

        if (!data.success) {
          router.push("/onboarding");
          return;
        }

        document.cookie = `tenant_id=${data.tenant_id}; path=/`;
        document.cookie = `role=${data.role}; path=/`;

        const org = data.active_organization_id;

        if (org) {
          router.push(`/workspace/${org}`);
          return;
        }

        router.push("/workspace");

      } catch (err) {
        console.error(err);
        router.push("/");
      }
    };

    run();
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-black text-white">
      Loading system...
    </div>
  );
}
