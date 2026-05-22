"use client";

import {
  useMemo,
  useState,
} from "react";

const SECTIONS = [

  "ALL",
  "MAIN FLOOR",
  "TERRACE",
  "VIP",
  "BAR",
  "OUTSIDE",

];

export default function POSTableSelector({
  tables = [],
  selectedTable = null,
  onSelect,
}) {

  const [
    activeSection,
    setActiveSection,
  ] = useState("ALL");

  const filteredTables =
    useMemo(() => {

      if (
        activeSection === "ALL"
      ) {

        return tables;

      }

      return tables.filter(
        table =>

          (
            table.section ||
            "MAIN FLOOR"
          ) === activeSection
      );

    }, [
      tables,
      activeSection,
    ]);

  return (

    <div className="flex h-full flex-col">

      {/* SECTION BAR */}

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">

        {SECTIONS.map(
          section => (

            <button
              key={section}
              onClick={() =>
                setActiveSection(
                  section
                )
              }
              className={`
                whitespace-nowrap rounded-2xl border px-4 py-2 text-xs transition-all

                ${
                  activeSection ===
                  section

                    ? "border-violet-500 bg-violet-500/20 text-white"

                    : "border-white/10 bg-black/20 text-white/50 hover:text-white"
                }
              `}
            >

              {section}

            </button>

          )
        )}

      </div>

      {/* TABLE LIST */}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">

        {filteredTables.map(table => {

          const active =
            selectedTable?.id ===
            table.id;

          return (

            <button
              key={table.id}
              onClick={() =>
                onSelect(table)
              }
              className={`
                w-full rounded-[22px] border p-4 text-left transition-all

                ${
                  active

                    ? "border-violet-500 bg-violet-500/20"

                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }
              `}
            >

              <div className="mb-3 flex items-center justify-between">

                <div
                  className="text-xl"
                  style={{
                    fontWeight: 300,
                  }}
                >

                  {
                    table.table_name
                  }

                </div>

                <div
                  className={`
                    rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]

                    ${
                      table.status === "AVAILABLE"

                        ? "bg-emerald-500/20 text-emerald-300"

                        : "bg-orange-500/20 text-orange-300"
                    }
                  `}
                >

                  {
                    table.status
                  }

                </div>

              </div>

              <div className="flex items-center justify-between text-sm text-white/40">

                <div>

                  Capacity:
                  {" "}
                  {
                    table.capacity || 0
                  }

                </div>

                <div>

                  {
                    table.section ||
                    "MAIN FLOOR"
                  }

                </div>

              </div>

            </button>

          );

        })}

      </div>

    </div>

  );

}
