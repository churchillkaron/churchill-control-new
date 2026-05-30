"use client";

import {
  useMemo,
  useState,
} from "react";

const CATEGORIES = [

  "ALL",
  "STARTER",
  "MAIN",
  "DESSERT",
  "BAR",
  "WINE",
  "BEER",
  "COCKTAIL",
  "COFFEE",
  "SOFT DRINK",

];

export default function POSMenuGrid({
  items = [],
  onAdd,
}) {

  const [
    activeCategory,
    setActiveCategory,
  ] = useState("ALL");

  console.log(
    "POS GRID ITEMS:",
    items
  );

  const filteredItems =
    useMemo(() => {

      if (
        activeCategory === "ALL"
      ) {

        return items;

      }

      return items.filter(
        item =>

          (
            item.category ||
            ""
          )
            .toUpperCase()
            .includes(
              activeCategory
            )
      );

    }, [
      items,
      activeCategory,
    ]);

  return (

    <div className="flex h-full flex-col overflow-hidden">

      {/* CATEGORY BAR */}

      <div className="mb-6 shrink-0 overflow-x-auto pb-3">

        <div className="flex min-w-max gap-3">

          {CATEGORIES.map(
            category => (

              <button
                key={category}
                onClick={() =>
                  setActiveCategory(
                    category
                  )
                }
                className={`
                  whitespace-nowrap rounded-2xl border px-5 py-3 text-sm transition-all

                  ${
                    activeCategory ===
                    category

                      ? "border-violet-500 bg-violet-500/20 text-white"

                      : "border-white/10 bg-black/20 text-white/50 hover:text-white"
                  }
                `}
              >

                {category}

              </button>

            )
          )}

        </div>

      </div>

      {/* MENU AREA */}

      <div className="flex-1 overflow-y-auto pr-2">

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">

          {filteredItems.map(item => (

            <button
              key={item.id}
              onClick={() =>
                onAdd(item)
              }
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-left transition-all hover:border-violet-500 hover:bg-violet-500/10"
            >

              <div className="mb-3 flex items-start justify-between gap-3">

                <div
                  className="line-clamp-2 text-xl"
                  style={{
                    fontWeight: 300,
                  }}
                >

                  {item.name}

                </div>

                <div className="shrink-0 rounded-full bg-violet-500/20 px-3 py-1 text-xs uppercase text-violet-300">

                  {
                    item.category ||
                    "MENU"
                  }

                </div>

              </div>

              <div className="mb-6 line-clamp-2 text-sm text-white/40">

                {
                  item.description ||
                  "No description"
                }

              </div>

              <div className="flex items-center justify-between">

                <div className="text-2xl font-light text-violet-300">

                  ฿{
                    Number(
                      item.price || 0
                    ).toFixed(0)
                  }

                </div>

                <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60">

                  ADD

                </div>

              </div>

            </button>

          ))}

        </div>

      </div>

    </div>

  );

}
