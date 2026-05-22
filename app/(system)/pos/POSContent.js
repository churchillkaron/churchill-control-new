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

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function POSContent() {

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

  async function loadTables() {

    const {
      data,
      error,
    } = await supabase

      .from(
        "restaurant_tables"
      )

      .select("*")

      .eq(
        "tenant_id",
        TENANT_ID
      )

      .order(
        "table_name"
      );

    if (error) {

      console.error(
        error
      );

      return;

    }

    setTables(
      data || []
    );

  }

  async function loadMenu() {

    const {
      data,
      error,
    } = await supabase

      .from("dishes")

      .select("*")

      .eq(
        "tenant_id",
        TENANT_ID
      )

      .order("name");

    if (error) {

      console.error(
        error
      );

      return;

    }

    setMenu(
      data || []
    );

  }

  async function loadPOSSettings() {

    try {

      const settings =
        await loadOperationalSettings({

          tenantId:
            TENANT_ID,

          domain:
            "POS",

        });

      setPosSettings(
        settings
      );

    } catch (error) {

      console.error(
        error
      );

    }

  }

  useEffect(() => {

    async function init() {

      setLoading(true);

      await Promise.all([
        loadTables(),
        loadMenu(),
        loadPOSSettings(),
      ]);

      setLoading(false);

    }

    init();

  }, []);

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

      const {
        data: order,
        error: orderError,
      } = await supabase

        .from("orders")

        .insert({

          tenant_id:
            TENANT_ID,

          table_number:
            selectedTable.table_name,




          total:
            totalAmount,

          total_amount:
            totalAmount,

          amount_paid:
            0,

          status:
            "OPEN",

          payment_status:
            "UNPAID",

        })

        .select()

        .single();

      if (orderError)
        throw orderError;

      const items =
        cart.map(item => ({

          tenant_id:
            TENANT_ID,

          order_id:
            order.id,

          dish_id:
            item.id,

          item_name:
            item.name || item.item_name || "Unnamed Item",

          quantity:
            Number(
              item.quantity || 1
            ),

          price:
            Number(
              item.price || 0
            ),

          status:
            "NEW",

          course:
            item.category || "MAIN",

          station:

            (
              item.category || ""
            ).toUpperCase().includes("BAR")

              ? "BAR"

              : "HOT",

        }));

      console.log(
        "INSERTING ITEMS",
        items
      );

      const {
        error: itemError,
      } = await supabase

        .from("order_items")

        .insert(items);

      if (itemError)
        throw itemError;

      await supabase

        .from(
          "restaurant_tables"
        )

        .update({

          status:
            "OCCUPIED",

        })

        .eq(
          "id",
          selectedTable.id
        );

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
          onSelect={
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
