"use client";

import { useState } from "react";

const GROUPS = [
  {
    title:"Management",
    users:[
      "Owner",
      "Manager",
      "Accounting",
      "Auditor",
    ],
  },
  {
    title:"Operations",
    users:[
      "Warehouse",
      "Purchasing",
      "Sales",
      "HR",
    ],
  },
];

export default function CommunicationEngine({

  title="Send",

  documentType,

  onSend,

}){

  const [message,setMessage]=
    useState("");

  const [selected,setSelected]=
    useState([]);

  function toggle(user){

    setSelected(current=>

      current.includes(user)

        ? current.filter(x=>x!==user)

        : [...current,user]

    );

  }

  return(

    <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

      <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
        Communication
      </div>

      <div className="mt-2 text-3xl font-light">
        {title}
      </div>

      <div className="mt-8 space-y-6">

        {GROUPS.map(group=>

          <div key={group.title}>

            <div className="mb-2 text-xs uppercase tracking-[0.25em] text-white/35">
              {group.title}
            </div>

            <div className="flex flex-wrap gap-2">

              {group.users.map(user=>

                <button

                  key={user}

                  onClick={()=>toggle(user)}

                  className={`rounded-xl border px-4 py-2 ${
                    selected.includes(user)

                      ? "border-amber-400 bg-amber-400/10"

                      : "border-white/10"
                  }`}

                >
                  {user}
                </button>

              )}

            </div>

          </div>

        )}

      </div>

      <textarea

        value={message}

        onChange={e=>setMessage(e.target.value)}

        className="mt-8 h-36 w-full rounded-2xl border border-white/10 bg-black/20 p-4"

        placeholder="Write message..."

      />

      <div className="mt-6 flex gap-3">

        <button className="rounded-xl border border-white/10 px-5 py-3">
          PDF
        </button>

        <button className="rounded-xl border border-white/10 px-5 py-3">
          Excel
        </button>

        <button className="rounded-xl border border-white/10 px-5 py-3">
          Native
        </button>

        <button

          onClick={()=>onSend?.({

            users:selected,

            message,

            documentType,

          })}

          className="ml-auto rounded-xl bg-amber-500 px-8 py-3 text-black"

        >
          Send
        </button>

      </div>

    </div>

  );

}
