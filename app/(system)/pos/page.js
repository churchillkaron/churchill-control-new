"use client";

import PageWrapper from "@/components/PageWrapper";

import POSShell from "@/components/pos/POSShell";
import POSMenuGrid from "@/components/pos/POSMenuGrid";
import POSCart from "@/components/pos/POSCart";
import POSTableSelector from "@/components/pos/POSTableSelector";

import { usePOSStore } from "@/store/pos/usePOSStore";

export default function POSPage() {

  const store =
    usePOSStore();

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

      STORE SAFE

    </div>
  );
}
