"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter }
from "next/navigation";

import POSShell
from "@/components/pos/POSShell";

import POSTableSelector
from "@/components/pos/POSTableSelector";

import POSMenuGrid
from "@/components/pos/POSMenuGrid";

import POSCart
from "@/components/pos/POSCart";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  getCurrentUser,
} from "@/lib/auth/getCurrentUser";

import {
  loadMenu as loadMenuData,
} from "@/lib/pos/loadMenu";

import {
  useTenant,
} from "@/app/providers/TenantProvider";




export default function POSContent() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const router =
    useRouter();

  const [
    tables,
    setTables,
  ] = useState([]);

  const [
    menu,
    setMenu,
  ] = useState([]);

  const [
    selectedTable,
    setSelectedTable,
  ] = useState(null);

  const [
    cart,
    setCart,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    posSettings,
    setPosSettings,
  ] = useState(null);


  const [
    currentStaff,
    setCurrentStaff,
  ] = useState(null);

  async function loadTables() {

    if (!tenantId) {
      return;
    }

    const {
      data: tablesData,
      error: tablesError,
    } = await supabase

      .from(
        "restaurant_tables"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "table_name"
      );

    if (tablesError) {

      console.error(
        tablesError
      );

      return;

    }

    const {
      data: sessions,
      error: sessionsError,
    } = await supabase

      .from(
        "table_sessions"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .in(
        "status",
        [
          "OPEN",
          "ACTIVE",
          "READY_FOR_PAYMENT",
          "PARTIAL",
        ]
      );

    if (sessionsError) {

      console.error(
        sessionsError
      );

    }

    const mappedTables =
      (tablesData || []).map(
        table => {

          const activeSession =
            (sessions || []).find(
              s =>
                s.table_number ===
                table.table_name
            );

          return {

            ...table,

            status:
              activeSession
                ? "OCCUPIED"
                : "AVAILABLE",

            active_session:
              activeSession || null,

          };

        }
      );

    setTables(
      mappedTables
    );

  }

  async function loadMenu() {

    try {

      console.log(
        "POS TENANT:",
        tenantId
      );

      if (!tenantId) {

        console.log(
          "NO TENANT ID"
        );

        return;

      }

      const menuData =
        await loadMenuData(
          tenantId
        );

      console.log(
        "MENU RESULT:",
        menuData
      );

      setMenu(
        menuData || []
      );

    } catch (error) {

      console.error(
        "LOAD MENU FAILED:",
        error
      );

    }

  }

  async function loadPOSSettings() {

    if (!tenantId) {
      return;
    }

    try {

      const response =
        await fetch(
          "/api/settings/operational",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              tenantId:
                tenantId,

              domain:
                "POS",

            }),

          }
        );

      const result =
        await response.json();

      if (!result.success) {

        throw new Error(
          result.error
        );

      }

      setPosSettings(
        result.settings
      );

    } catch (error) {

      console.error(
        error
      );

    }

  }


  async function loadCurrentStaff() {

    const user =
      await getCurrentUser();

    if (!user?.email) {
      return;
    }

    const {
      data,
      error,
    } = await supabase

      .from("staff_accounts")

      .select("*")

      .eq(
        "email",
        user.email
      )

      .single();

    if (error) {

      console.error(error);

      return;

    }

    setCurrentStaff(data);

  }

  useEffect(() => {

    console.log("POS EFFECT START");

    async function init() {

      try {

        console.log("INIT RUNNING");

        setLoading(true);

        console.log("BEFORE TABLES");
        await loadTables();

        console.log("BEFORE MENU");
        await loadMenu();

        console.log("AFTER MENU");

        setLoading(false);

      } catch (error) {

        console.error(
          "POS INIT ERROR",
          error
        );

        setLoading(false);

      }

    }

    init();

  }, [tenantId]);

  function addToCart(
    item
  ) {

    setCart(prev => {

      const existing =
        prev.find(
          i =>
            i.id === item.id
        );

      if (existing) {

        return prev.map(
          i =>

            i.id === item.id

              ? {
                  ...i,
                  quantity:
                    i.quantity + 1,
                }

              : i
        );

      }

      return [
        ...prev,
        {
          ...item,
          quantity: 1,
          status: "NEW",
          course: 1,
        },
      ];

    });

  }

  function updateQuantity(
    id,
    change
  ) {

    setCart(prev =>

      prev
        .map(item => {

          if (
            item.id !== id
          )
            return item;

          return {
            ...item,
            quantity:
              item.quantity +
              change,
          };

        })
        .filter(
          item =>
            item.quantity > 0
        )
    );

  }

  
async function sendOrder() {

    if (
      posSettings?.require_table_assignment &&
      !selectedTable
    ) {

      alert(
        "Select table"
      );

      return;

    }

    if (
      cart.length === 0
    ) {

      alert(
        "Cart empty"
      );

      return;

    }

    try {const subtotal =
        cart.reduce(
          (
            sum,
            item
          ) =>

            sum +

            (
              Number(
                item.price || 0
              ) *

              Number(
                item.quantity || 1
              )
            ),

          0
        );

      const serviceCharge =
        posSettings?.enable_service_charge

          ? Number(
              (
                subtotal *
                (
                  Number(
                    posSettings?.service_charge_percent || 0
                  ) / 100
                )
              ).toFixed(2)
            )

          : 0;

      const vat =
        Number(
          (
            (
              subtotal +
              serviceCharge
            ) * 0.07
          ).toFixed(2)
        );

      const totalAmount =
        Number(
          (
            subtotal +
            serviceCharge +
            vat
          ).toFixed(2)
        );

      const response =
        await fetch(
          "/api/pos/create",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              tenant_id:
                tenantId,

              table:
                selectedTable.table_name,

              items:
                cart,

              total:
                totalAmount,

              staff_name:
                currentStaff?.name || null,

              staff_id:
                currentStaff?.id || null,

            }),

          }
        );

      const result =
        await response.json();

      if (!response.ok) {

        throw new Error(
          result.error ||
          "ORDER CREATE FAILED"
        );

      }

      const order = {

        id:
          result.order_id,

      };
      await loadTables();

      alert(
        "Order sent to kitchen"
      );

      setCart([]);

      router.push(
        "/kitchen"
      );

    } catch (err) {

      console.error(
        err
      );

      alert(
        err.message
      );

    }

  }

const total =
    useMemo(() => {

      return cart.reduce(
        (
          sum,
          item
        ) =>

          sum +
          (
            Number(
              item.price || 0
            ) *
            Number(
              item.quantity || 0
            )
          ),

        0
      );

    }, [cart]);

  return (

    <POSShell

      tableSelector={

        <POSTableSelector
          tables={tables}
          selectedTable={
            selectedTable
          }
          setSelectedTable={
            setSelectedTable
          }
        />

      }

      menu={

        loading

          ? (
              <div className="p-10 text-white/40">
                Loading menu...
              </div>
            )

          : (

            <div className="h-full overflow-y-auto pr-2">

              <POSMenuGrid
                items={menu}
                onAdd={
                  addToCart
                }
              />

            </div>

          )

      }

      cart={

        <div className="flex h-full flex-col">

          <div className="flex-1 overflow-y-auto">

            <POSCart
              items={cart}
              total={total}
              onQuantityChange={
                updateQuantity
              }
              onSendOrder={
                sendOrder
              }
            />

          </div>

        </div>

      }

    />

  );

}
