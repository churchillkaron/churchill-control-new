"use client";

import { useEffect, useRef, useState } from "react";

function emptyForm() {
  return {
    title: "",
    business_goal: "",
    creative_objective: "",
    target_audience: "",
    call_to_action: "",
    tone: "",
    emotion: "",
  };
}

function formFromBrief(brief = {}) {
  return {
    title: brief.title || "",
    business_goal: brief.business_goal || "",
    creative_objective:
      brief.creative_objective ||
      brief.campaign_goal ||
      "",
    target_audience:
      typeof brief.target_audience === "string"
        ? brief.target_audience
        : JSON.stringify(brief.target_audience || {}, null, 2),
    call_to_action:
      brief.call_to_action ||
      brief.requested_action ||
      "",
    tone: brief.tone || "",
    emotion: brief.emotion || "",
  };
}

function Field({ label, value, onChange, textarea = false }) {
  const className =
    "mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none";

  return (
    <div>
      <div className="text-xs uppercase tracking-[0.22em] text-white/40">
        {label}
      </div>
      {textarea ? (
        <textarea
          rows={5}
          className={className}
          value={value}
          onChange={onChange}
        />
      ) : (
        <input
          className={className}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export default function BriefWorkspace({ runtime }) {
  const brief = runtime.briefRuntime?.current || null;
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const creatingRef = useRef(false);

  useEffect(() => {
    async function ensureBrief() {
      if (brief) {
        setForm(formFromBrief(brief));
        return;
      }

      if (!runtime.organizationId || creatingRef.current) return;

      creatingRef.current = true;
      await fetch("/api/creative/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          title:
            runtime.missionRuntime?.current?.title ||
            runtime.missionRuntime?.current?.business_goal ||
            "Creative Brief",
          business_goal:
            runtime.missionRuntime?.current?.business_goal ||
            "",
          creative_mission_id: runtime.missionRuntime?.current?.id,
        }),
      });
      await runtime.refresh?.();
    }

    ensureBrief();
  }, [brief, runtime]);

  useEffect(() => {
    if (brief) setForm(formFromBrief(brief));
  }, [brief]);

  async function saveBrief() {
    if (!brief?.id) return;

    setSaving(true);
    try {
      await fetch("/api/creative/brief", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: brief.id,
          organization_id: runtime.organizationId,
          ...form,
        }),
      });
      await runtime.refresh?.();
    } finally {
      setSaving(false);
    }
  }

  async function completeBrief() {
    if (!brief?.id) return;

    await fetch("/api/creative/brief", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        id: brief.id,
        organization_id: runtime.organizationId,
        creative_mission_id: runtime.missionRuntime?.current?.id,
      }),
    });
    await runtime.refresh?.();
  }

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Creative Brief
        </div>
        <div className="mt-2 text-3xl font-semibold">
          {form.title || "Creative Brief"}
        </div>
      </div>

      <div className="mb-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={completeBrief}
          className="rounded-xl border border-[#c8a96a]/40 bg-[#c8a96a]/10 px-5 py-3 text-sm text-[#c8a96a]"
        >
          Complete Brief
        </button>
        <button
          type="button"
          onClick={saveBrief}
          disabled={saving}
          className="rounded-xl border border-[#c8a96a]/40 bg-[#c8a96a]/10 px-5 py-3 text-sm text-[#c8a96a]"
        >
          {saving ? "Saving..." : "Save Brief"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Field
          label="Business Goal"
          textarea
          value={form.business_goal}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              business_goal: event.target.value,
            }))
          }
        />
        <Field
          label="Creative Objective"
          textarea
          value={form.creative_objective}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              creative_objective: event.target.value,
            }))
          }
        />
        <Field
          label="Target Audience"
          textarea
          value={form.target_audience}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              target_audience: event.target.value,
            }))
          }
        />
        <Field
          label="Call To Action"
          textarea
          value={form.call_to_action}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              call_to_action: event.target.value,
            }))
          }
        />
        <Field
          label="Tone"
          value={form.tone}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              tone: event.target.value,
            }))
          }
        />
        <Field
          label="Emotion"
          value={form.emotion}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              emotion: event.target.value,
            }))
          }
        />
      </div>
    </div>
  );
}
