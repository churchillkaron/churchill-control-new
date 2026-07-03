"use client";

import { useState } from "react";

const MODES = [
  { id:"ask",label:"Ask AI" },
  { id:"create",label:"Create" },
  { id:"clean",label:"Clean Data" },
  { id:"categorize",label:"Categorize" },
  { id:"duplicates",label:"Duplicates" },
  { id:"validate",label:"Validate" },
  { id:"translate",label:"Translate" },
  { id:"summarize",label:"Summarize" },
];

export default function AIEngine({
  action,
  moduleKey,
  organizationId,
  entityId,
  periodId,
  context={},
  onComplete,
  className="",
  label="AI",
}){

  const [open,setOpen]=useState(false);
  const endpoint = action?.endpoint || "/api/workspace/ai";
  const [mode,setMode]=useState("ask");
  const [prompt,setPrompt]=useState("");
  const [busy,setBusy]=useState(false);

  async function execute(){

    if(!endpoint){
      alert("AI endpoint not configured.");
      return;
    }

    setBusy(true);

    try{

      const res=await fetch(endpoint,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
        },
        body:JSON.stringify({

          module:moduleKey,
          capability: action?.capability,
          action,

          mode,

          prompt,

          organization_id:organizationId,
          entity_id:entityId,
          period_id:periodId,

          context,

        }),
      });

      const json=await res.json();

      if(!json.success){
        alert(json.error);
        return;
      }

      onComplete?.(json);

      setOpen(false);

    }finally{

      setBusy(false);

    }

  }

  return(
    <>
      <button
        className={className}
        onClick={()=>setOpen(true)}
      >
        {label}
      </button>

      {open&&(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-xl">

          <div className="w-full max-w-4xl rounded-3xl bg-zinc-950 border border-zinc-800 p-6">

            <div className="flex justify-between items-center">

              <h2 className="text-2xl font-semibold">
                AI Workspace
              </h2>

              <button onClick={()=>setOpen(false)}>
                Close
              </button>

            </div>

            <div className="flex flex-wrap gap-2 mt-6">

              {MODES.map(item=>(

                <button
                  key={item.id}
                  onClick={()=>setMode(item.id)}
                  className={
                    mode===item.id
                    ? "px-4 py-2 rounded-xl bg-amber-500 text-black"
                    : "px-4 py-2 rounded-xl border border-zinc-700"
                  }
                >
                  {item.label}
                </button>

              ))}

            </div>

            <textarea

              value={prompt}

              onChange={e=>setPrompt(e.target.value)}

              placeholder="Ask AI anything about this workspace..."

              className="mt-6 w-full h-56 rounded-2xl bg-black border border-zinc-800 p-4"

            />

            <div className="flex justify-end mt-6">

              <button

                onClick={execute}

                disabled={busy}

                className="rounded-xl bg-amber-500 px-6 py-3 text-black"

              >

                {busy?"Running...":"Execute"}

              </button>

            </div>

          </div>

        </div>
      )}

    </>
  );

}
