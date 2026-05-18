"use client";

import { useEffect, useState } from "react";

import PageWrapper from "@/components/PageWrapper";

import { usePOSStore } from "@/store/pos/usePOSStore";

import { supabase } from "@/lib/shared/supabase/client";

import { loadMenu } from "@/lib/pos/loadMenu";
import { loadTableSessions } from "@/lib/pos/loadTableSessions";

import { createOrder } from "@/lib/pos/createOrder";

import {
  addItemToCart,
  removeItemFromCart,
  getSelectedQuantity,
} from "@/store/pos/cartActions";

export default function POSPage() {

  return (
    <PageWrapper
      title="POS"
      subtitle="Operational order system"
    >

      <div className="flex items-center justify-center h-[70vh] text-white text-5xl">
        POS RESTORED
      </div>

    </PageWrapper>
  );
}
