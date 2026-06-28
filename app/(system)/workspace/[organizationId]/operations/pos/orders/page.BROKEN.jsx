"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

import { supabase } from "@/lib/shared/supabase/client";


import { loadOrderItems } from "@/lib/pos/loadOrderItems";



export default function POSOrdersPage() {

  const tenant =
    useTenant();

  const organizationId =
    tenant?.id;

  const [
    orders,
    setOrders,
  ] = useState([]);

  const [
    orderItems,
    setOrderItems,
  ] = useState({});

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD ORDERS =====
