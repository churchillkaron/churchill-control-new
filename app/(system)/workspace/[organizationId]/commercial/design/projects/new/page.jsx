"use client";

import { useRouter, useParams } from "next/navigation";
import { useState } from "react";

export const dynamic = "force-dynamic";

export default function NewCreativeProjectPage() {

  const router =
    useRouter();

  const { organizationId } =
    useParams();

  const [saving,setSaving] =
    useState(false);

  const [form,setForm] =
    useState({

      name: "",

      description: "",

      production_type: "VIDEO",

      objective: "",

    });

  async function save() {

    setSaving(true);

    const res =
      await fetch(
        "/api/creative/projects",
        {

          method:"POST",

          headers:{
            "Content-Type":"application/json",
          },

          body:JSON.stringify({

            organizationId,

            ...form,

          }),

        }
      );

    const json =
      await res.json();

    if(json.success){

      router.push(
        "/workspace/" +
        organizationId +
        "/commercial/design/projects"
      );

    }

    setSaving(false);

  }

  return (

    <div className="mx-auto max-w-3xl space-y-8">

      <h1 className="text-3xl font-semibold">
        New Creative Project
      </h1>

      <input
        className="w-full rounded-xl border p-3"
        placeholder="Project name"
        value={form.name}
        onChange={e=>
          setForm({
            ...form,
            name:e.target.value,
          })
        }
      />

      <textarea
        className="w-full rounded-xl border p-3"
        rows={5}
        placeholder="Describe what you want to create..."
        value={form.description}
        onChange={e=>
          setForm({
            ...form,
            description:e.target.value,
          })
        }
      />

      <select
        className="w-full rounded-xl border p-3"
        value={form.production_type}
        onChange={e=>
          setForm({
            ...form,
            production_type:e.target.value,
          })
        }
      >

        <option>VIDEO</option>
        <option>IMAGE</option>
        <option>MENU</option>
        <option>WEBSITE</option>
        <option>ADVERTISEMENT</option>
        <option>PRESENTATION</option>

      </select>

      <textarea
        className="w-full rounded-xl border p-3"
        rows={4}
        placeholder="Business objective"
        value={form.objective}
        onChange={e=>
          setForm({
            ...form,
            objective:e.target.value,
          })
        }
      />

      <button

        onClick={save}

        disabled={saving}

        className="rounded-xl bg-[#D6A66A] px-6 py-3 font-semibold text-black"

      >

        {saving
          ? "Creating..."
          : "Create Project"}

      </button>

    </div>

  );

}
