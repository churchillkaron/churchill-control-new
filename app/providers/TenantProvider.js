"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    async function loadTenant() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

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

        if (data?.success) {
          const nextTenant = {
            id: data.tenant_id,
            role: data.role,
            activeOrganization: data.active_organization_id,
            staff: data.staff,
          };

          setTenant(nextTenant);

          try {
            localStorage.setItem(
              "tenantRuntime",
              JSON.stringify(nextTenant)
            );
          } catch {}
        }

      } catch (err) {
        console.error("Tenant load failed", err);
      }
    }

    loadTenant();
  }, []);

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
