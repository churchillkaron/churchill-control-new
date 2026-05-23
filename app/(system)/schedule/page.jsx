"use client";

import { useMemo, useState } from "react";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Copy,
  Save,
  Send,
  Plus,
  AlertTriangle,
  Clock3,
  Users,
  Sparkles,
  Wand2,
} from "lucide-react";

const staff = [
  { id: 1, name: "Sarah", role: "FOH", group: "SERVICE" },
  { id: 2, name: "Mia", role: "FOH", group: "SERVICE" },
  { id: 3, name: "Alex", role: "VIP", group: "SERVICE" },
  { id: 4, name: "Emma", role: "BAR", group: "BAR" },
  { id: 5, name: "Noah", role: "BAR", group: "BAR" },
  { id: 6, name: "Mike", role: "KITCHEN", group: "KITCHEN" },
  { id: 7, name: "Kai", role: "SECURITY", group: "SECURITY" },
  { id: 8, name: "Luna", role: "HOST", group: "SERVICE" },
];

const days = Array.from({ length: 31 }, (_, i) => i + 1);

const templates = {
  OFF: { code: "OFF", label: "Off", time: "", color: "bg-zinc-800/80 text-zinc-400 border-zinc-700" },
  OPEN: { code: "OPEN", label: "Open", time: "10-18", color: "bg-cyan-500/80 text-white border-cyan-300/40" },
  MID: { code: "MID", label: "Mid", time: "14-22", color: "bg-blue-500/80 text-white border-blue-300/40" },
  CLOSE: { code: "CLOSE", label: "Close", time: "18-02", color: "bg-fuchsia-500/80 text-white border-fuchsia-300/40" },
  VIP: { code: "VIP", label: "VIP", time: "20-03", color: "bg-amber-400/90 text-black border-amber-200/60" },
  BAR: { code: "BAR", label: "Bar", time: "17-01", color: "bg-purple-500/80 text-white border-purple-300/40" },
  KIT: { code: "KIT", label: "Kitchen", time: "16-00", color: "bg-sky-500/80 text-white border-sky-300/40" },
  SEC: { code: "SEC", label: "Security", time: "20-03", color: "bg-red-500/80 text-white border-red-300/40" },
};

const initialRoster = {
  Sarah: { 1: "CLOSE", 2: "CLOSE", 5: "CLOSE", 6: "VIP", 8: "CLOSE", 12: "CLOSE", 13: "CLOSE", 16: "VIP", 19: "CLOSE", 20: "CLOSE", 23: "VIP", 27: "CLOSE", 30: "VIP" },
  Mia: { 1: "MID", 2: "CLOSE", 8: "MID", 9: "CLOSE", 15: "MID", 16: "CLOSE", 22: "MID", 23: "CLOSE", 29: "MID", 30: "CLOSE" },
  Alex: { 2: "VIP", 3: "VIP", 6: "VIP", 7: "VIP", 10: "VIP", 14: "VIP", 17: "VIP", 21: "VIP", 24: "VIP", 28: "VIP", 31: "VIP" },
  Emma: { 1: "BAR", 4: "BAR", 5: "BAR", 8: "BAR", 11: "BAR", 12: "BAR", 15: "BAR", 18: "BAR", 19: "BAR", 22: "BAR", 25: "BAR", 26: "BAR", 29: "BAR" },
  Noah: { 3: "BAR", 4: "BAR", 7: "BAR", 8: "BAR", 15: "BAR", 16: "BAR", 22: "BAR", 23: "BAR", 29: "BAR", 30: "BAR" },
  Mike: { 1: "KIT", 2: "KIT", 3: "KIT", 6: "KIT", 7: "KIT", 10: "KIT", 13: "KIT", 14: "KIT", 17: "KIT", 21: "KIT", 24: "KIT", 28: "KIT" },
  Kai: { 5: "SEC", 6: "SEC", 12: "SEC", 13: "SEC", 19: "SEC", 20: "SEC", 26: "SEC", 27: "SEC" },
  Luna: { 5: "VIP", 6: "VIP", 12: "VIP", 13: "VIP", 19: "VIP", 20: "VIP", 26: "VIP", 27: "VIP" },
};

export default function SchedulePage() {
  const [selectedDay, setSelectedDay] = useState(5);
  const [selectedTemplate, setSelectedTemplate] = useState("CLOSE");
  const [roster, setRoster] = useState(initialRoster);

  const selectedStats = useMemo(() => {
    const working = staff.filter((p) => roster[p.name]?.[selectedDay]);
    const byRole = working.reduce((acc, p) => {
      acc[p.role] = (acc[p.role] || 0) + 1;
      return acc;
    }, {});

    return {
      working: working.length,
      foh: (byRole.FOH || 0) + (byRole.VIP || 0) + (byRole.HOST || 0),
      bar: byRole.BAR || 0,
      kitchen: byRole.KITCHEN || 0,
      security: byRole.SECURITY || 0,
    };
  }, [roster, selectedDay]);

  function setCell(person, day) {
    setRoster((prev) => ({
      ...prev,
      [person.name]: {
        ...(prev[person.name] || {}),
        [day]: selectedTemplate,
      },
    }));
  }

  function clearCell(person, day) {
    setRoster((prev) => {
      const next = { ...prev, [person.name]: { ...(prev[person.name] || {}) } };
      delete next[person.name][day];
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="fixed inset-0 bg-black" />
      <div className="fixed top-[-260px] left-[-160px] w-[680px] h-[680px] bg-fuchsia-500/20 blur-3xl rounded-full" />
      <div className="fixed bottom-[-320px] right-[-180px] w-[760px] h-[760px] bg-purple-700/20 blur-3xl rounded-full" />

      <main className="relative z-10 p-5 lg:p-8">
        <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-fuchsia-300/70">
              Churchill Workforce Command
            </p>
            <h1 className="text-4xl lg:text-5xl font-black mt-2">
              Smart Monthly Roster
            </h1>
            <p className="text-zinc-400 mt-2">
              Click a shift template, then click cells to build the month.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <HeaderButton icon={<Wand2 size={17} />} text="AI Fill" />
            <HeaderButton icon={<Copy size={17} />} text="Copy Week" />
            <HeaderButton icon={<Save size={17} />} text="Save" />
            <HeaderButton primary icon={<Send size={17} />} text="Publish" />
          </div>
        </header>

        <section className="grid grid-cols-1 2xl:grid-cols-[1fr_390px] gap-5">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.04] backdrop-blur-3xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="flex items-center gap-3">
                <button className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
                  <ChevronLeft />
                </button>
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-[0.3em]">
                    May 2026
                  </p>
                  <h2 className="text-3xl font-black">Monthly Schedule</h2>
                </div>
                <button className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
                  <ChevronRight />
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {Object.keys(templates).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedTemplate(key)}
                    className={`shrink-0 rounded-2xl border px-4 py-3 text-sm font-black ${
                      selectedTemplate === key
                        ? "bg-white text-black border-white"
                        : "bg-white/10 border-white/10 text-zinc-300"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-auto">
              <div className="min-w-[1780px]">
                <div className="grid grid-cols-[230px_repeat(31,1fr)] border-b border-white/10">
                  <div className="sticky left-0 z-30 bg-black/90 backdrop-blur-2xl border-r border-white/10 p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-[0.3em]">Staff</p>
                  </div>

                  {days.map((day) => {
                    const peak = day % 7 === 5 || day % 7 === 6;
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={`h-20 border-r border-white/10 flex flex-col items-center justify-center ${
                          selectedDay === day
                            ? "bg-fuchsia-500/20"
                            : peak
                            ? "bg-fuchsia-500/[0.05]"
                            : "bg-black/20"
                        }`}
                      >
                        <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                          {["M", "T", "W", "T", "F", "S", "S"][(day - 1) % 7]}
                        </p>
                        <h3 className="text-xl font-black">{day}</h3>
                        {peak && <span className="text-[9px] text-fuchsia-300">PEAK</span>}
                      </button>
                    );
                  })}
                </div>

                {staff.map((person, index) => (
                  <div
                    key={person.id}
                    className={`grid grid-cols-[230px_repeat(31,1fr)] min-h-[82px] border-b border-white/10 ${
                      index % 2 === 0 ? "bg-white/[0.015]" : "bg-black/20"
                    }`}
                  >
                    <div className="sticky left-0 z-30 bg-black/90 backdrop-blur-2xl border-r border-white/10 p-4 flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${roleAvatar(person.role)}`}>
                        {person.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="font-black leading-none">{person.name}</h2>
                        <p className="text-xs text-zinc-500 mt-1">{person.role}</p>
                      </div>
                    </div>

                    {days.map((day) => {
                      const code = roster[person.name]?.[day];
                      const template = templates[code];
                      const peak = day % 7 === 5 || day % 7 === 6;

                      return (
                        <div
                          key={day}
                          onClick={() => setCell(person, day)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            clearCell(person, day);
                          }}
                          className={`border-r border-white/5 p-1 cursor-pointer ${
                            selectedDay === day ? "bg-fuchsia-500/[0.07]" : peak ? "bg-fuchsia-500/[0.025]" : ""
                          }`}
                        >
                          {template ? (
                            <div className={`h-full min-h-[66px] rounded-2xl border p-2 flex flex-col justify-center items-center shadow-xl ${template.color}`}>
                              <div className="text-[12px] font-black leading-none">
                                {template.code}
                              </div>
                              {template.time && (
                                <div className="text-[10px] font-bold opacity-90 mt-1 whitespace-nowrap">
                                  {template.time}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full min-h-[66px] rounded-2xl border border-white/[0.04] hover:border-white/20 hover:bg-white/[0.04]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[34px] border border-white/10 bg-white/[0.04] backdrop-blur-3xl p-5">
              <p className="text-zinc-500 text-xs uppercase tracking-[0.3em]">Selected Day</p>
              <h2 className="text-4xl font-black mt-2">May {selectedDay}</h2>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <Metric title="Working" value={selectedStats.working} />
                <Metric title="Service" value={selectedStats.foh} />
                <Metric title="Bar" value={selectedStats.bar} />
                <Metric title="Kitchen" value={selectedStats.kitchen} />
              </div>
            </section>

            <section className="rounded-[34px] border border-white/10 bg-black/35 backdrop-blur-3xl p-5">
              <p className="text-zinc-500 text-xs uppercase tracking-[0.3em]">Shift Templates</p>
              <h2 className="text-2xl font-black mt-2 mb-5">Active Template</h2>

              <div className={`rounded-3xl border p-5 ${templates[selectedTemplate].color}`}>
                <div className="text-3xl font-black">{templates[selectedTemplate].code}</div>
                <div className="text-sm font-bold mt-1">{templates[selectedTemplate].label}</div>
                <div className="text-sm opacity-80 mt-1">{templates[selectedTemplate].time || "No working hours"}</div>
              </div>

              <p className="text-zinc-500 text-sm mt-4">
                Left click = assign. Right click = clear.
              </p>
            </section>

            <section className="rounded-[34px] border border-fuchsia-500/20 bg-fuchsia-500/10 backdrop-blur-3xl p-5">
              <div className="flex items-center gap-3 mb-5">
                <Brain className="text-fuchsia-300" />
                <h2 className="text-2xl font-black">AI Schedule Logic</h2>
              </div>

              <div className="space-y-3">
                <AIItem icon={<AlertTriangle size={15} />} text="May 5 has VIP load. Add one extra FOH from 20-03." />
                <AIItem icon={<Clock3 size={15} />} text="Emma is near overtime if assigned another BAR shift." />
                <AIItem icon={<Users size={15} />} text="Kitchen coverage is low on May 10 and May 24." />
                <AIItem icon={<Sparkles size={15} />} text="Best team combo for Saturday: Sarah, Alex, Emma, Mike, Kai." />
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function roleAvatar(role) {
  if (role === "FOH") return "bg-gradient-to-br from-fuchsia-500 to-pink-600";
  if (role === "VIP") return "bg-gradient-to-br from-amber-400 to-orange-600 text-black";
  if (role === "BAR") return "bg-gradient-to-br from-purple-500 to-violet-700";
  if (role === "KITCHEN") return "bg-gradient-to-br from-sky-500 to-cyan-600";
  if (role === "SECURITY") return "bg-gradient-to-br from-red-500 to-zinc-700";
  if (role === "HOST") return "bg-gradient-to-br from-amber-400 to-orange-600 text-black";
  return "bg-white text-black";
}

function HeaderButton({ icon, text, primary }) {
  return (
    <button className={`rounded-2xl px-4 py-3 flex items-center gap-2 border ${
      primary ? "bg-gradient-to-r from-fuchsia-500 to-purple-700 border-fuchsia-400 text-white" : "bg-white/10 border-white/10 text-zinc-300"
    }`}>
      {icon}
      {text}
    </button>
  );
}

function Metric({ title, value }) {
  return (
    <div className="rounded-2xl bg-black/30 border border-white/10 p-4">
      <p className="text-zinc-500 text-[10px] uppercase tracking-[0.25em]">{title}</p>
      <h3 className="text-3xl font-black mt-2">{value}</h3>
    </div>
  );
}

function AIItem({ icon, text }) {
  return (
    <div className="rounded-2xl bg-black/30 border border-white/10 p-3 flex gap-3">
      <div className="text-fuchsia-300 mt-0.5">{icon}</div>
      <p className="text-sm text-zinc-300">{text}</p>
    </div>
  );
}
