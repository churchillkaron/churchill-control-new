import { useEffect } from "react";
import { syncOfflineOrders } from "./syncEngine";

/**
 * AUTO SYNC WHEN INTERNET RETURNS
 */
export function useOfflineSync(tenantId) {

  useEffect(() => {

    if (!tenantId) return;

    const handleOnline = () => {
      syncOfflineOrders(tenantId);
    };

    window.addEventListener("online", handleOnline);

    // also attempt on load
    handleOnline();

    return () => {
      window.removeEventListener("online", handleOnline);
    };

  }, [tenantId]);
}
