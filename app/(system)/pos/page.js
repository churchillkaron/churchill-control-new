"use client";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { supabase } from "@/lib/shared/supabase/client";

import { loadMenu } from "@/lib/pos/loadMenu";
import { loadTableSessions } from "@/lib/pos/loadTableSessions";

export default function POSPage() {

  const store =
    usePOSStore();

  console.log(
    supabase,
    loadMenu,
    loadTableSessions
  );

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

      TABLESESSIONS SAFE

    </div>
  );
}
