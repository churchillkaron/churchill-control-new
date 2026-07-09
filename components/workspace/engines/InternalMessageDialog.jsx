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
      "Purchasing",
      "Warehouse",
      "Sales",
      "HR",
      "Finance",
    ],
  },

];

export default function InternalMessageDialog({

  open,

  onClose,

  payload,

}){

  const [selected,setSelected]=
    useState([]);

  const [message,setMessage]=
    useState("");

  if(!open) return null;

  function toggle(user){

    setSelected(current=>

      current.includes(user)

        ? current.filter(x=>x!==user)

        : [...current,user]

    );

  }

  return(

    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-xl">

      <div className="w-full max-w-5xl rounded-[36px] border border-white/10 bg-[#090909] p-8">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
              Internal Message
            </div>

            <div className="mt-2 text-4xl font-light text-white">

              {payload?.moduleKey}

            </div>

          </div>

          <button

            onClick={onClose}

            className="rounded-xl border border-white/10 px-5 py-3"

          >

            Close

          </button>

        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">

          <div>

            {GROUPS.map(group=>(

              <div
                key={group.title}
                className="mb-8"
              >

                <div className="mb-3 text-xs uppercase tracking-[0.25em] text-white/35">
                  {group.title}
                </div>

                <div className="flex flex-wrap gap-2">

                  {group.users.map(user=>(

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

                  ))}

                </div>

              </div>

            ))}

          </div>

          <div>

            <textarea

              value={message}

              onChange={e=>setMessage(e.target.value)}

              className="h-60 w-full rounded-3xl border border-white/10 bg-black/20 p-5"

              placeholder="Write message..."

            />

            <div className="mt-6 flex flex-wrap gap-3">

              <button className="rounded-xl border border-white/10 px-4 py-3">
                Attach Native
              </button>

              <button className="rounded-xl border border-white/10 px-4 py-3">
                Attach PDF
              </button>

              <button className="rounded-xl border border-white/10 px-4 py-3">
                Attach Excel
              </button>

            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">

              <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/35">
                Delivery
              </div>

              <div className="grid gap-3 sm:grid-cols-2">

                <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <input
                    type="radio"
                    name="delivery"
                    defaultChecked
                  />
                  Send Now
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <input
                    type="radio"
                    name="delivery"
                  />
                  Schedule
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <input
                    type="radio"
                    name="delivery"
                  />
                  Request Approval
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <input
                    type="radio"
                    name="delivery"
                  />
                  Save Draft
                </label>

              </div>

            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">


              <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/35">
                Attachments
              </div>

              <label className="mb-3 flex items-center gap-3">
                <input type="checkbox" defaultChecked />
                Native Document
              </label>

              <label className="mb-3 flex items-center gap-3">
                <input type="checkbox" defaultChecked />
                PDF
              </label>

              <label className="mb-3 flex items-center gap-3">
                <input type="checkbox"/>
                Excel
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox"/>
                AI Summary
              </label>

            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">

              <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/35">
                AI Assistant
              </div>

              <div className="mb-8 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

                <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/35">
                  Related Business Documents
                </div>

                <div className="grid gap-3 sm:grid-cols-2">

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <input type="checkbox" defaultChecked />
                    Original Record
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <input type="checkbox" defaultChecked />
                    Timeline
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <input type="checkbox"/>
                    Attachments
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <input type="checkbox"/>
                    Audit Trail
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <input type="checkbox"/>
                    Approval History
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                    <input type="checkbox"/>
                    Linked Documents
                  </label>

                </div>

              </div>

              <div className="mb-6 rounded-3xl border border-amber-400/20 bg-amber-400/5 p-5">

                <div className="text-xs uppercase tracking-[0.25em] text-[#D6A66A]">
                  Workflow
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">

                  <div className="rounded-full border border-white/10 px-4 py-2">
                    Export
                  </div>

                  <div>→</div>

                  <div className="rounded-full border border-white/10 px-4 py-2">
                    AI Summary
                  </div>

                  <div>→</div>

                  <div className="rounded-full border border-white/10 px-4 py-2">
                    Internal Message
                  </div>

                  <div>→</div>

                  <div className="rounded-full border border-white/10 px-4 py-2">
                    Approval
                  </div>

                </div>

              </div>

              <div className="grid gap-3">

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Generate Executive Summary
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Translate Message
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Rewrite Professionally
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Highlight Financial Changes
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Explain Report For Management
                </button>

              </div>

            </div>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">

              <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/35">
                AI Assistant
              </div>

              <div className="grid gap-3">

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Generate Executive Summary
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Translate Message
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Rewrite Professionally
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Highlight Financial Changes
                </button>

                <button className="rounded-xl border border-white/10 p-3 text-left hover:border-amber-400">
                  Explain Report For Management
                </button>

              </div>

            </div>

            <div className="mt-8 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">

              <div className="mb-4 text-xs uppercase tracking-[0.25em] text-white/35">
                Activity
              </div>

              <div className="space-y-3 text-sm">

                <div className="flex justify-between rounded-xl border border-white/10 p-3">
                  <span>Created</span>
                  <span className="text-white/45">Just now</span>
                </div>

                <div className="flex justify-between rounded-xl border border-white/10 p-3">
                  <span>Recipients</span>
                  <span className="text-white/45">
                    {selected.length}
                  </span>
                </div>

                <div className="flex justify-between rounded-xl border border-white/10 p-3">
                  <span>Attachments</span>
                  <span className="text-white/45">
                    Native / PDF
                  </span>
                </div>

                <div className="flex justify-between rounded-xl border border-white/10 p-3">
                  <span>Status</span>
                  <span className="text-emerald-300">
                    Ready
                  </span>
                </div>

              </div>

            </div>

            <button

              className="mt-8 w-full rounded-2xl bg-amber-500 py-4 text-lg font-medium text-black"

              onClick={()=>{

                if (process.env.NODE_ENV !== "production") console.log({

                  payload,

                  recipients:selected,

                  message,

                });

                onClose();

              }}

            >

              Send Internal Message

            </button>

          </div>

        </div>

      </div>

    </div>

  );

}
