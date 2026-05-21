"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  Search,
  Plus,
  Minus,
  Send,
  Flame,
  PauseCircle,
  BellRing,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import { supabase } from "@/lib/supabase";

const TENANT_ID =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export default function POSContent() {

  const searchParams =
    useSearchParams();

  const queryTable =
    searchParams.get("table");

  const [tables, setTables] =
    useState([]);

  const [selectedTable, setSelectedTable] =
    useState(
      queryTable || ""
    );

  const [dishes, setDishes] =
    useState([]);

  const [cart, setCart] =
    useState([]);

  const [search, setSearch] =
    useState("");

  useEffect(() => {

    async function load() {

      const {
        data: tablesData,
      } = await supabase

        .from("restaurant_tables")

        .select("*")

        .order(
          "table_name",
          {
            ascending: true,
          }
        );

      const {
        data: dishesData,
      } = await supabase

        .from("dishes")

        .select("*")

        .eq(
          "tenant_id",
          TENANT_ID
        );

      setTables(
        tablesData || []
      );

      setDishes(
        dishesData || []
      );

    }

    load();

  }, []);

  const filteredDishes =
    useMemo(() => {

      return dishes.filter(
        dish =>

          dish.name
            ?.toLowerCase()
            .includes(
              search.toLowerCase()
            )
      );

    }, [
      dishes,
      search,
    ]);

  function addDish(dish) {

    const exists =
      cart.find(
        item =>
          item.id ===
          dish.id
      );

    if (exists) {

      setCart(
        cart.map(item =>

          item.id === dish.id

            ? {
                ...item,
                quantity:
                  item.quantity + 1,
              }

            : item
        )
      );

      return;

    }

    setCart([
      ...cart,

      {
        ...dish,

        quantity: 1,

        fire: false,

        hold: false,

        vip: false,

        rush: false,

        course: 1,

      },
    ]);

  }

  function increase(id) {

    setCart(
      cart.map(item =>

        item.id === id

          ? {
              ...item,
              quantity:
                item.quantity + 1,
            }

          : item
      )
    );

  }

  function decrease(id) {

    setCart(
      cart
        .map(item =>

          item.id === id

            ? {
                ...item,
                quantity:
                  item.quantity - 1,
              }

            : item
        )
        .filter(
          item =>
            item.quantity > 0
        )
    );

  }

  function updateCartItem(
    id,
    field,
    value
  ) {

    setCart(
      cart.map(item =>

        item.id === id

          ? {
              ...item,
              [field]: value,
            }

          : item
      )
    );

  }

  async function sendOrder() {

    if (!selectedTable) {

      alert(
        "Select table first"
      );

      return;

    }

    if (
      cart.length === 0
    ) {

      alert(
        "No items"
      );

      return;

    }

    try {

      let order = null;

      const {
        data: existingOrder,
      } = await supabase

        .from("orders")

        .select("*")

        .eq(
          "tenant_id",
          TENANT_ID
        )

        .eq(
          "table_number",
          selectedTable
        )

        .in(
          "status",
          [
            "OPEN",
            "READY",
            "BILLING",
          ]
        )

        .order(
          "created_at",
          {
            ascending: false,
          }
        )

        .limit(1)

        .maybeSingle();

      if (existingOrder) {

        order =
          existingOrder;

      } else {

        const total =
          cart.reduce(
            (
              sum,
              item
            ) =>

              sum +
              (
                Number(
                  item.price
                ) *
                item.quantity
              ),

            0
          );

        const {
          data: newOrder,
          error,
        } = await supabase

          .from("orders")

          .insert([
            {
              tenant_id:
                TENANT_ID,

              table_number:
                selectedTable,

              status:
                "OPEN",

              payment_status:
                "PENDING",

              pacing_status:
                "ACTIVE",

              current_course:
                1,

              total_amount:
                total,
            },
          ])

          .select()

          .single();

        if (error)
          throw error;

        order =
          newOrder;

      }

      const now =
        new Date().toISOString();

      const items =
        cart.map(item => ({

          tenant_id:
            TENANT_ID,

          order_id:
            order.id,

          dish_id:
            item.id,

          item_name:
            item.name,

          quantity:
            item.quantity,

          price:
            item.price,

          station:
            item.station ||
            "HOT",

          status:

            item.course > 1

              ? "HOLD"

              : "NEW",

          fire:
            item.fire,

          hold:

            item.course > 1

              ? true

              : item.hold,

          vip:
            item.vip,

          rush:
            item.rush,

          course:
            item.course,

          created_at:
            now,

          updated_at:
            now,

        }));

      const {
        error:
          itemError,
      } = await supabase

        .from(
          "order_items"
        )

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
          "table_name",
          selectedTable
        );

      alert(
        "Order sent successfully"
      );

      setCart([]);

    } catch (err) {

      console.error(
        err
      );

      alert(
        err.message
      );

    }

  }

  return (

    <PageWrapper
      title="POS"
      subtitle="Enterprise course & fire control"
    >

      <div className="grid grid-cols-3 gap-6">

        <div className="col-span-2">

          <div className="flex gap-4 mb-6">

            <select
              value={
                selectedTable
              }
              onChange={e =>
                setSelectedTable(
                  e.target.value
                )
              }
              className="h-14 px-5 rounded-2xl bg-white/5 border border-white/10 min-w-[220px]"
            >

              <option value="">
                Select Table
              </option>

              {tables.map(
                table => (

                  <option
                    key={
                      table.id
                    }
                    value={
                      table.table_name
                    }
                  >

                    {
                      table.table_name
                    }

                  </option>

                )
              )}

            </select>

            <div className="flex-1 relative">

              <Search className="absolute left-4 top-4 w-5 h-5 text-white/30" />

              <input
                value={search}
                onChange={e =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Search dishes..."
                className="w-full h-14 pl-12 rounded-2xl bg-white/5 border border-white/10"
              />

            </div>

          </div>

          <div className="grid grid-cols-3 gap-4">

            {filteredDishes.map(
              dish => (

                <button
                  key={dish.id}
                  onClick={() =>
                    addDish(
                      dish
                    )
                  }
                  className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 text-left hover:bg-white/[0.05]"
                >

                  <div className="text-2xl mb-3">
                    {
                      dish.name
                    }
                  </div>

                  <div className="text-sm text-white/40 uppercase mb-4">
                    {
                      dish.station ||
                      "HOT"
                    }
                  </div>

                  <div className="text-3xl text-violet-400">
                    ฿{
                      dish.price
                    }
                  </div>

                </button>

              )
            )}

          </div>

        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

          <div className="text-3xl mb-8">
            Course Control
          </div>

          <div className="space-y-4">

            {cart.map(item => (

              <div
                key={item.id}
                className="rounded-2xl border border-white/10 p-4"
              >

                <div className="flex justify-between mb-4">

                  <div>

                    <div className="text-xl">
                      {
                        item.name
                      }
                    </div>

                    <div className="text-sm text-white/40">
                      ฿{
                        item.price
                      }
                    </div>

                  </div>

                  <div className="text-xl">
                    ฿{
                      item.price *
                      item.quantity
                    }
                  </div>

                </div>

                <div className="flex items-center gap-3 mb-4">

                  <button
                    onClick={() =>
                      decrease(
                        item.id
                      )
                    }
                    className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"
                  >

                    <Minus className="w-4 h-4" />

                  </button>

                  <div className="w-10 text-center">
                    {
                      item.quantity
                    }
                  </div>

                  <button
                    onClick={() =>
                      increase(
                        item.id
                      )
                    }
                    className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"
                  >

                    <Plus className="w-4 h-4" />

                  </button>

                </div>

                <div className="mb-4">

                  <div className="text-xs uppercase text-white/40 mb-2">
                    Course
                  </div>

                  <select
                    value={
                      item.course
                    }
                    onChange={e =>
                      updateCartItem(
                        item.id,
                        "course",
                        Number(
                          e.target.value
                        )
                      )
                    }
                    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4"
                  >

                    <option value={1}>
                      Course 1
                    </option>

                    <option value={2}>
                      Course 2
                    </option>

                    <option value={3}>
                      Course 3
                    </option>

                    <option value={4}>
                      Course 4
                    </option>

                  </select>

                </div>

                <div className="grid grid-cols-2 gap-2">

                  <button
                    onClick={() =>
                      updateCartItem(
                        item.id,
                        "fire",
                        !item.fire
                      )
                    }
                    className={`h-10 rounded-xl ${
                      item.fire

                        ? "bg-red-500 text-black"

                        : "bg-white/10 text-white"
                    }`}
                  >

                    <Flame className="w-4 h-4 mx-auto" />

                  </button>

                  <button
                    onClick={() =>
                      updateCartItem(
                        item.id,
                        "hold",
                        !item.hold
                      )
                    }
                    className={`h-10 rounded-xl ${
                      item.hold

                        ? "bg-yellow-500 text-black"

                        : "bg-white/10 text-white"
                    }`}
                  >

                    <PauseCircle className="w-4 h-4 mx-auto" />

                  </button>

                  <button
                    onClick={() =>
                      updateCartItem(
                        item.id,
                        "vip",
                        !item.vip
                      )
                    }
                    className={`h-10 rounded-xl ${
                      item.vip

                        ? "bg-yellow-300 text-black"

                        : "bg-white/10 text-white"
                    }`}
                  >

                    VIP

                  </button>

                  <button
                    onClick={() =>
                      updateCartItem(
                        item.id,
                        "rush",
                        !item.rush
                      )
                    }
                    className={`h-10 rounded-xl ${
                      item.rush

                        ? "bg-orange-500 text-black"

                        : "bg-white/10 text-white"
                    }`}
                  >

                    <BellRing className="w-4 h-4 mx-auto" />

                  </button>

                </div>

              </div>

            ))}

          </div>

          <div className="mt-8 pt-6 border-t border-white/10">

            <div className="flex justify-between text-3xl mb-6">

              <div>Total</div>

              <div className="text-violet-400">

                ฿{
                  cart.reduce(
                    (
                      sum,
                      item
                    ) =>

                      sum +
                      (
                        item.price *
                        item.quantity
                      ),

                    0
                  )
                }

              </div>

            </div>

            <button
              onClick={
                sendOrder
              }
              className="w-full h-16 rounded-[24px] bg-violet-500 hover:bg-violet-400 transition-all text-xl flex items-center justify-center gap-3"
            >

              <Send className="w-5 h-5" />

              SEND ORDER

            </button>

          </div>

        </div>

      </div>

    </PageWrapper>

  );

}
