"use client";

import { useEffect } from "react";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { supabase } from "@/lib/shared/supabase/client";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { loadMenu } from "@/lib/pos/loadMenu";
import { loadTableSessions } from "@/lib/pos/loadTableSessions";

import { validateStock } from "@/lib/pos/validateStock";

import { createOrder } from "@/lib/pos/createOrder";
import { clearTable as clearTableService } from "@/lib/pos/clearTable";

import {
  addItemToCart,
  removeItemFromCart,
  getSelectedQuantity,
} from "@/store/pos/cartActions";

export default function POSPage() {

  return (

    <div style={{
      background: "black",
      color: "white",
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "48px",
      fontWeight: "bold",
    }}>

      IMPORTS SAFE

    </div>
  );
}
