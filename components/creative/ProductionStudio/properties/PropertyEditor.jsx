"use client";

import { useState,useEffect } from "react";

function Field({
  label,
  value,
  onChange,
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">
        {label}
      </div>

      <input
        value={value ?? ""}
        onChange={e=>onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-[#c8a96a]/40"
      />
    </div>
  );
}

export default function PropertyEditor({

  item,

  onSave,

}) {

  const [state,setState] =
    useState(item || {});

  useEffect(()=>{

    setState(item || {});

  },[item]);

  if(!item){

    return (

      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-white/35">

        Select a Scene or Shot

      </div>

    );

  }

  return (

    <div className="space-y-5">

      <Field
        label="Title"
        value={state.title}
        onChange={v=>
          setState({
            ...state,
            title:v,
          })
        }
      />

      <Field
        label="Status"
        value={state.status}
        onChange={v=>
          setState({
            ...state,
            status:v,
          })
        }
      />

      <Field
        label="Duration"
        value={state.duration_seconds}
        onChange={v=>
          setState({
            ...state,
            duration_seconds:v,
          })
        }
      />

      <button
        onClick={()=>
          onSave(state)
        }
        className="w-full rounded-xl bg-[#b48a45] px-4 py-3 font-medium text-black"
      >
        Save
      </button>

    </div>

  );

}
