"use client";

import { useEffect, useState } from "react";
import {
  loadKitchenSettings,
} from "@/lib/restaurant/settings/KitchenSettingsRepository";
import {
  getTicketPriority,
} from "@/lib/restaurant/kitchen/capabilities/getTicketPriority";

import {
  getKitchenTimer,
} from "@/lib/restaurant/kitchen/capabilities/getKitchenTimer";

import {
  canStart,
  canReady,
  canComplete,
} from "@/lib/restaurant/kitchen/objects/KitchenStatus";

export default function KitchenPage() {

  const [tickets,setTickets]=useState([]);
  const [loading,setLoading]=useState(true);
const [settings,setSettings]=useState(null);

  
  async function loadQueue(){

    setLoading(true);

    try {

      const res = await fetch(
        "/api/restaurant/kitchen/queue",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
          },
          body:JSON.stringify({
            organizationId:
              localStorage.getItem("organizationId"),
          }),
        }
      );

      const json = await res.json();

      setTickets(json.result || []);

    } finally {

      setLoading(false);

    }

  }


  
  async function runCapability(
    capability,
    ticket
  ){

    const endpoint = {
      StartPreparation:
        "/api/restaurant/kitchen/start",

      MarkReady:
        "/api/restaurant/kitchen/ready",

      Complete:
        "/api/restaurant/kitchen/complete",
    }[capability];

    await fetch(
      endpoint,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
        },
        body:JSON.stringify({
          organizationId:
            localStorage.getItem("organizationId"),
          ticketId:
            ticket.id,
        }),
      }
    );
    await loadQueue();

  }


    useEffect(() => {

    let cancelled = false;

    async function initialize() {

      const cfg =
        await loadKitchenSettings(
          localStorage.getItem(
            "organizationId"
          )
        );

      if (!cancelled) {
        setSettings(cfg);
      }

      await loadQueue();

    }

    initialize();

    let timer;

    initialize().then(() => {
      timer = setInterval(
        loadQueue,
        cfg?.refresh_interval_ms || 3000
      );
    });

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };

  }, []);

  return (

    <main className="min-h-screen bg-[#090909] text-white p-8">

      <div className="flex items-center justify-between mb-8">

        <h1 className="text-3xl font-semibold">
          Kitchen Queue
        </h1>

        <button
          onClick={loadQueue}
          className="rounded-xl border border-white/10 px-4 py-2"
        >
          Refresh
        </button>

      </div>

      {loading && (
        <div>
          Loading...
        </div>
      )}

      <div className="grid gap-5">

        {tickets
.sort((a,b)=>{

const pa=getTicketPriority(a).minutes;
const pb=getTicketPriority(b).minutes;

return pb-pa;

})
.map(ticket=>{

const priority =
getTicketPriority(ticket);

const timer =
getKitchenTimer(ticket);

return(

          <div
            key={ticket.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
          >

            <div className="flex justify-between">

              <div>

                <div className="text-2xl font-bold">

                  Table {ticket.table_number}

                </div>

                <div className="text-white/50">

                  {ticket.orders?.order_number}

                </div>

              </div>

              <div className="text-right">

                <div className="font-semibold">

                  {ticket.status}
<br/>
<span className="text-xs">
{priority.priority}
 ·
{priority.minutes} min

<br/>

<span className={timer.color}>
{timer.display}
</span>
</span>

                </div>

                <div className="text-sm text-white/40">

                  {ticket.station}

                </div>

              </div>

            </div>

            <div className="my-6 border-t border-white/10"/>

            <div className="space-y-3">

              {(ticket.items||[]).map(item=>(

                <div
                  key={item.id}
                  className="flex justify-between rounded-xl bg-white/5 px-4 py-3"
                >

                  <div>

                    {item.quantity} × {item.name}

                  </div>

                  <div className="text-white/50">

                    {item.status}

                  </div>

                </div>

              ))}

            </div>

            <div className="mt-8 flex gap-3">

              <button
                onClick={()=>
                  runCapability(
                    "StartPreparation",
                    ticket
                  )
                }
                className="flex-1 rounded-xl bg-blue-600 py-3 disabled:opacity-30" disabled={!canStart(ticket.status)}
              >
                START
              </button>

              <button
                onClick={()=>
                  runCapability(
                    "MarkReady",
                    ticket
                  )
                }
                className="flex-1 rounded-xl bg-yellow-600 py-3 disabled:opacity-30" disabled={!canReady(ticket.status)}
              >
                READY
              </button>

              <button
                onClick={()=>
                  runCapability(
                    "Complete",
                    ticket
                  )
                }
                className="flex-1 rounded-xl bg-green-600 py-3 disabled:opacity-30" disabled={!canComplete(ticket.status)}
              >
                COMPLETE
              </button>

            </div>

          </div>

        );
})}

      </div>

    </main>

  );

}
