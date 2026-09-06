"use client";

export const dynamic = "force-dynamic";

import RestaurantAvantiqoTheme from "@/components/workspace/operations/RestaurantAvantiqoTheme";
import ReceiptsPage from "../receipts/page";

export default function POSHistoryPage() {
  return (
    <RestaurantAvantiqoTheme mode="service">
      <div data-pos-history-canonical-receipts="true">
        <ReceiptsPage />
      </div>
    </RestaurantAvantiqoTheme>
  );
}
