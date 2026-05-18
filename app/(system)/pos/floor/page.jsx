"use client";

import { useEffect, useState } from "react";

const TABLE_STATUS_COLORS = {

  AVAILABLE:
    "border-green-500",

  OCCUPIED:
    "border-red-500",

  RESERVED:
    "border-yellow-500",

  CLEANING:
    "border-blue-500",
};

export default function FloorPage() {

  const [
    tables,
    setTables,
  ] = useState([]);

  async function loadTables() {

    const res =
      await fetch(
        "/api/pos/tables?tenant_id=demo"
      );

    const json =
      await res.json();

    setTables(
      json.tables || []
    );
  }

  async function updateStatus(
    table_id,
    status
  ) {

    await fetch(
      "/api/pos/tables",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          table_id,
          status,
        }),
      }
    );

    loadTables();
  }

  useEffect(() => {

    loadTables();

    const interval =
      setInterval(
        loadTables,
        3000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <div className="mb-10">

          <h1 className="text-6xl font-bold">
            Floor Management
          </h1>

          <div className="text-zinc-500 mt-3">
            Restaurant Table & Live Floor Control
          </div>

        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">

          {tables.map(
            (
              table
            ) => (

              <div
                key={table.id}
                className={`border-2 rounded-3xl p-6 ${
                  TABLE_STATUS_COLORS[
                    table.status
                  ] ||
                  "border-zinc-800"
                }`}
              >

                <div className="text-4xl font-bold mb-3">
                  {
                    table.table_number
                  }
                </div>

                <div className="text-zinc-500 mb-2">
                  Seats:
                  {" "}
                  {table.seats}
                </div>

                <div className="mb-6">
                  {
                    table.status
                  }
                </div>

                <div className="space-y-2">

                  <button
                    onClick={() =>
                      updateStatus(
                        table.id,
                        "AVAILABLE"
                      )
                    }
                    className="w-full border border-green-500 rounded-xl py-2 text-sm"
                  >
                    AVAILABLE
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        table.id,
                        "OCCUPIED"
                      )
                    }
                    className="w-full border border-red-500 rounded-xl py-2 text-sm"
                  >
                    OCCUPIED
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        table.id,
                        "RESERVED"
                      )
                    }
                    className="w-full border border-yellow-500 rounded-xl py-2 text-sm"
                  >
                    RESERVED
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        table.id,
                        "CLEANING"
                      )
                    }
                    className="w-full border border-blue-500 rounded-xl py-2 text-sm"
                  >
                    CLEANING
                  </button>

                </div>

              </div>
            )
          )}

        </div>

      </div>

    </div>
  );
}
