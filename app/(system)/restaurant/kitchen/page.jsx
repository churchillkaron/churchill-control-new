"use client";

import { useEffect, useState } from "react";

export default function KitchenPage() {

  const [tickets,setTickets]=useState([]);
  const [loading,setLoading]=useState(true);

  async function loadQueue(){

    setLoading(true);

    try{

      const res=
        await fetch(
          "/api/restaurant/kitchen/queue",
          {
            method:"POST",
            headers:{
              "Content-Type":"application/json",
            },
            body:JSON.stringify({
              organizationId:
                localStorage.getItem(
                  "organizationId"
                ),
            }),
          }
        );

      const json=
        await res.json();

      setTickets(
        json.result || []
      );

    }finally{

      setLoading(false);

    }

  }

  useEffect(()=>{

    loadQueue();

    const timer=
      setInterval(
        loadQueue,
        5000
      );

    return ()=>clearInterval(timer);

  },[]);

  return (

    <main className="min-h-screen bg-[#0A0A0A] text-white p-8">

      <h1 className="text-3xl font-semibold mb-8">
        Kitchen Queue
      </h1>

      {loading && (
        <div>
          Loading...
        </div>
      )}

      <div className="grid gap-5">

        {tickets.map(ticket=>(

          <div
            key={ticket.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-6"
          >

            <div className="flex justify-between">

              <div>

                <div className="text-xl font-bold">
                  Table {ticket.table_number}
                </div>

                <div className="text-white/60">
                  {ticket.orders?.order_number}
                </div>

              </div>

              <div className="text-right">

                <div>
                  {ticket.status}
                </div>

                <div className="text-sm text-white/50">
                  {ticket.station}
                </div>

              </div>

            </div>

            <div className="mt-5 space-y-2">

              {(ticket.items||[]).map(item=>(

                <div
                  key={item.id}
                  className="flex justify-between"
                >

                  <span>
                    {item.quantity} × {item.name}
                  </span>

                  <span>
                    {item.status}
                  </span>

                </div>

              ))}

            </div>

            <div className="mt-6 flex gap-3">

              <button
                className="rounded-lg bg-blue-600 px-4 py-2"
              >
                Start
              </button>

              <button
                className="rounded-lg bg-yellow-600 px-4 py-2"
              >
                Ready
              </button>

              <button
                className="rounded-lg bg-green-600 px-4 py-2"
              >
                Complete
              </button>

            </div>

          </div>

        ))}

      </div>

    </main>

  );

}
