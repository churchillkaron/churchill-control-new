import { useEffect } from "react";
import { syncOfflineOrders } from "./syncEngine";

/**
 * AUTO SYNC WHEN INTERNET RETURNS
 */
export function useOfflineSync(organizationId) {

  useEffect(() => {

    if (!organizationId) return;

    const handleOnline = () => {
      syncOfflineOrders(organizationId);
    };

    window.addEventListener("online", handleOnline);

    // also attempt on load
    handleOnline();

    return () => {
      window.removeEventListener("online", handleOnline);
    };

  }, [organizationId]);
}
