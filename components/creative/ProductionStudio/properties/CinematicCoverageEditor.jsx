"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Aperture,
  Eye,
  Film,
  Move3D,
  Save,
  ShieldAlert,
} from "lucide-react";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function label(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function Field({ label: fieldLabel, value, onChange, compact = false }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[8px] font-semibold uppercase tracking-[0.16em] text-white/28">
        {fieldLabel}
      </span>
      {compact ? (
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border border-white/[0.075] bg-white/[0.018] px-2.5 py-2 text-[10px] leading-4 text-white/72 outline-none transition focus:border-[#D6A66A]/35 focus:bg-[#D6A66A]/[0.025]"
        />
      ) : (
        <textarea
          value={value ?? ""}
          rows={2}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y border border-white/[0.075] bg-white/[0.018] px-2.5 py-2 text-[10px] leading-4 text-white/72 outline-none transition focus:border-[#D6A66A]/35 focus:bg-[#D6A66A]/[0.025]"
        />
      )}
    </label>
  );
}

function Select({ label: fieldLabel, value, options, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[8px] font-semibold uppercase tracking-[0.16em] text-white/28">
        {fieldLabel}
      </span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-white/[0.075] bg-[#0A0A09] px-2.5 py-2 text-[10px] text-white/72 outline-none focus:border-[#D6A66A]/35"
      >
        <option value="">Unresolved</option>
        {options.map((option) => (
          <option key={option} value={option}>{label(option)}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label: fieldLabel, checked, onChange, warning = false }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border border-white/[0.065] bg-white/[0.012] px-2.5 py-2">
      <span className={`text-[9px] ${warning ? "text-[#D6A66A]/72" : "text-white/42"}`}>
        {fieldLabel}
      </span>
      <input
        type="checkbox"
        checked={checked === true}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[#D6A66A]"
      />
    </label>
  );
}

function Group({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="border border-white/[0.065] bg-black/20">
      <div className="flex items-start gap-2 border-b border-white/[0.055] px-3 py-2.5">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D6A66A]/58" strokeWidth={1.5} />
        <div>
          <div className="text-[9px] font-medium text-white/64">{title}</div>
          {subtitle ? <div className="mt-0.5 text-[8px] leading-3 text-white/22">{subtitle}</div> : null}
        </div>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </div>
  );
}

function CoverageState({ coverage }) {
  const warnings = [];
  if (!coverage.coverage_role) warnings.push("Coverage role unresolved");
  if (coverage.axis_break === true && !coverage.axis_break_motivation) {
    warnings.push("Axis break needs motivation");
  }
  if (
    coverage.eyeline_match_required === true &&
    !["MATCHED", "INTENTIONALLY_BROKEN"].includes(coverage.eyeline_match_status)
  ) {
    warnings.push("Eyeline relationship unresolved");
  }
  if (coverage.edit_compatibility_status && coverage.edit_compatibility_status !== "COMPATIBLE") {
    warnings.push("Edit relationship is not compatible");
  }

  return (
    <div className="flex items-center justify-between gap-3 border border-white/[0.065] bg-white/[0.015] px-3 py-2.5">
      <div>
        <div className="text-[8px] font-semibold uppercase tracking-[0.17em] text-white/25">Coverage state</div>
        <div className={`mt-1 text-[10px] font-medium ${warnings.length ? "text-[#D6A66A]/78" : "text-white/68"}`}>
          {warnings.length ? `${warnings.length} decision${warnings.length === 1 ? "" : "s"} need attention` : "Coherent professional coverage"}
        </div>
      </div>
      {warnings.length ? <ShieldAlert className="h-4 w-4 text-[#D6A66A]/70" /> : <Film className="h-4 w-4 text-white/34" />}
    </div>
  );
}

function SceneCoverageEditor({ item, onSave, saving }) {
  const source = object(item.coverage_plan || item.metadata?.coverage_plan);
  const [coveragePlan, setCoveragePlan] = useState(source);

  useEffect(() => {
    setCoveragePlan(object(item.coverage_plan || item.metadata?.coverage_plan));
  }, [item]);

  const update = (field, value) => {
    setCoveragePlan((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-3">
      <Group
        icon={Film}
        title="Scene Coverage Grammar"
        subtitle="The spatial and editorial rule every shot in this scene inherits."
      >
        <Field label="Spatial map" value={coveragePlan.spatial_map} onChange={(value) => update("spatial_map", value)} />
        <Field label="Dominant axis" value={coveragePlan.dominant_axis} onChange={(value) => update("dominant_axis", value)} />
        <Field label="Axis strategy" value={coveragePlan.axis_strategy} onChange={(value) => update("axis_strategy", value)} />
        <Field label="Re-establish strategy" value={coveragePlan.reestablish_strategy} onChange={(value) => update("reestablish_strategy", value)} />
      </Group>

      <Group
        icon={Aperture}
        title="Optical & Editorial Rhythm"
        subtitle="Control contrast and progression across the scene rather than isolated camera presets."
      >
        <Field label="Lens progression" value={coveragePlan.lens_progression} onChange={(value) => update("lens_progression", value)} />
        <Field label="Shot-size rhythm" value={coveragePlan.shot_size_rhythm} onChange={(value) => update("shot_size_rhythm", value)} />
        <Field label="Movement rhythm" value={coveragePlan.movement_rhythm} onChange={(value) => update("movement_rhythm", value)} />
        <Field label="Reveal hierarchy" value={coveragePlan.reveal_hierarchy} onChange={(value) => update("reveal_hierarchy", value)} />
        <Field label="Edit strategy" value={coveragePlan.edit_strategy} onChange={(value) => update("edit_strategy", value)} />
      </Group>

      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ coverage_plan: coveragePlan })}
        className="flex w-full items-center justify-center gap-2 border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]/82 transition hover:bg-[#D6A66A]/[0.12] disabled:opacity-40"
      >
        <Save className="h-3.5 w-3.5" />
        Save scene coverage
      </button>
    </div>
  );
}

function ShotCoverageEditor({ item, onSave, saving }) {
  const initialCoverage = object(item.coverage || item.metadata?.coverage);
  const initialCamera = object(item.camera);
  const initialContinuity = object(item.continuity);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [camera, setCamera] = useState(initialCamera);
  const [continuity, setContinuity] = useState(initialContinuity);

  useEffect(() => {
    setCoverage(object(item.coverage || item.metadata?.coverage));
    setCamera(object(item.camera));
    setContinuity(object(item.continuity));
  }, [item]);

  const updateCoverage = (field, value) => {
    setCoverage((current) => ({ ...current, [field]: value }));
  };
  const updateCamera = (field, value) => {
    setCamera((current) => ({ ...current, [field]: value }));
  };
  const updateContinuity = (field, value) => {
    setContinuity((current) => ({ ...current, [field]: value }));
  };

  const changed = useMemo(
    () =>
      JSON.stringify(initialCoverage) !== JSON.stringify(coverage) ||
      JSON.stringify(initialCamera) !== JSON.stringify(camera) ||
      JSON.stringify(initialContinuity) !== JSON.stringify(continuity),
    [initialCoverage, initialCamera, initialContinuity, coverage, camera, continuity],
  );

  return (
    <div className="space-y-3">
      <CoverageState coverage={coverage} />

      <Group
        icon={Film}
        title="Coverage Role"
        subtitle="Why this shot exists relative to the shots before and after it."
      >
        <Field label="Coverage role" value={coverage.coverage_role} onChange={(value) => updateCoverage("coverage_role", value)} />
        <Field label="Directorial reasoning" value={coverage.directorial_reasoning} onChange={(value) => updateCoverage("directorial_reasoning", value)} />
        <Field label="Shot-to-shot contrast" value={coverage.shot_to_shot_contrast} onChange={(value) => updateCoverage("shot_to_shot_contrast", value)} />
      </Group>

      <Group
        icon={Aperture}
        title="Camera & Lens"
        subtitle="Existing camera craft remains explicit and editable without becoming the creative idea."
      >
        <div className="grid grid-cols-2 gap-2">
          <Field compact label="Framing" value={camera.framing} onChange={(value) => updateCamera("framing", value)} />
          <Field compact label="Angle" value={camera.angle} onChange={(value) => updateCamera("angle", value)} />
          <Field compact label="Camera height" value={coverage.camera_height} onChange={(value) => updateCoverage("camera_height", value)} />
          <Field compact label="Subject distance" value={coverage.subject_distance} onChange={(value) => updateCoverage("subject_distance", value)} />
        </div>
        <Field label="Camera position" value={coverage.camera_position} onChange={(value) => updateCoverage("camera_position", value)} />
        <Field label="Lens intent" value={camera.lens_intent} onChange={(value) => updateCamera("lens_intent", value)} />
        <Field label="Movement path" value={camera.movement_path} onChange={(value) => updateCamera("movement_path", value)} />
        <Field label="Movement motivation" value={camera.movement_motivation} onChange={(value) => updateCamera("movement_motivation", value)} />
        <Field label="Focus behavior" value={camera.focus_transition} onChange={(value) => updateCamera("focus_transition", value)} />
        <Toggle label="Intentional stillness" checked={coverage.intentional_stillness} onChange={(value) => updateCoverage("intentional_stillness", value)} />
      </Group>

      <Group
        icon={Move3D}
        title="Axis & Geography"
        subtitle="Break spatial rules only as an explicit directorial decision, never by accident."
      >
        <Field label="Axis relationship" value={coverage.axis_relationship} onChange={(value) => updateCoverage("axis_relationship", value)} />
        <Toggle warning label="Intentional axis break" checked={coverage.axis_break} onChange={(value) => updateCoverage("axis_break", value)} />
        {coverage.axis_break ? (
          <>
            <Field label="Axis-break motivation" value={coverage.axis_break_motivation} onChange={(value) => updateCoverage("axis_break_motivation", value)} />
            <Field label="Re-establish strategy" value={coverage.reestablish_strategy} onChange={(value) => updateCoverage("reestablish_strategy", value)} />
          </>
        ) : null}
        <Field label="Spatial geography" value={continuity.spatial_geography} onChange={(value) => updateContinuity("spatial_geography", value)} />
      </Group>

      <Group
        icon={Eye}
        title="Eyeline & Screen Direction"
        subtitle="Protect orientation, entrances, exits and conversational geography across cuts."
      >
        <Field label="Eyeline" value={coverage.eyeline} onChange={(value) => updateCoverage("eyeline", value)} />
        <Toggle label="Eyeline match required" checked={coverage.eyeline_match_required} onChange={(value) => updateCoverage("eyeline_match_required", value)} />
        <Select
          label="Eyeline status"
          value={coverage.eyeline_match_status}
          options={["MATCHED", "NOT_REQUIRED", "INTENTIONALLY_BROKEN"]}
          onChange={(value) => updateCoverage("eyeline_match_status", value)}
        />
        <Field label="Screen direction" value={coverage.screen_direction || continuity.screen_direction} onChange={(value) => {
          updateCoverage("screen_direction", value);
          updateContinuity("screen_direction", value);
        }} />
        <Select
          label="Screen-direction status"
          value={coverage.screen_direction_status}
          options={["MATCHED", "NOT_REQUIRED", "INTENTIONALLY_BROKEN"]}
          onChange={(value) => updateCoverage("screen_direction_status", value)}
        />
        <Toggle warning label="Intentional direction break" checked={coverage.intentional_screen_direction_break} onChange={(value) => updateCoverage("intentional_screen_direction_break", value)} />
        {coverage.intentional_screen_direction_break ? (
          <Field label="Break motivation" value={coverage.screen_direction_break_motivation} onChange={(value) => updateCoverage("screen_direction_break_motivation", value)} />
        ) : null}
        <Field label="Entry / exit direction" value={coverage.entry_exit_direction} onChange={(value) => updateCoverage("entry_exit_direction", value)} />
      </Group>

      <Group
        icon={Film}
        title="Edit Relationship"
        subtitle="A shot is approved as part of an edit, not as an isolated attractive frame."
      >
        <Select
          label="Edit compatibility"
          value={coverage.edit_compatibility_status}
          options={["COMPATIBLE", "INCOMPATIBLE"]}
          onChange={(value) => updateCoverage("edit_compatibility_status", value)}
        />
        <Field label="Edit relationship" value={coverage.edit_relationship} onChange={(value) => updateCoverage("edit_relationship", value)} />
        <Field label="Match action" value={coverage.match_action} onChange={(value) => updateCoverage("match_action", value)} />
        <Field label="Continuity consequence" value={coverage.continuity_consequence} onChange={(value) => updateCoverage("continuity_consequence", value)} />
      </Group>

      <button
        type="button"
        disabled={saving || !changed}
        onClick={() => onSave({ coverage, camera, continuity })}
        className="flex w-full items-center justify-center gap-2 border border-[#D6A66A]/25 bg-[#D6A66A]/[0.08] px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#D6A66A]/82 transition hover:bg-[#D6A66A]/[0.12] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Save className="h-3.5 w-3.5" />
        Save professional direction
      </button>
    </div>
  );
}

export default function CinematicCoverageEditor({ type, item, onSave, saving }) {
  if (!item) return null;
  if (type === "scene") {
    return <SceneCoverageEditor item={item} onSave={onSave} saving={saving} />;
  }
  if (type === "shot") {
    return <ShotCoverageEditor item={item} onSave={onSave} saving={saving} />;
  }
  return null;
}
