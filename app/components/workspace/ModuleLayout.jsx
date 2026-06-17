"use client";

import { useState } from "react";
import { Tab } from "@headlessui/react";
import { Sparkles } from "lucide-react";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function ModuleLayout({ 
  moduleName, 
  tabs = [], 
  kpis = [], 
  sidePanel = null,
  children,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div className="p-6 space-y-6 text-white font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{moduleName}</h1>
        {tabs.length > 0 && (
          <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex}>
            <Tab.List className="flex space-x-4">
              {tabs.map((tab) => (
                <Tab
                  key={tab.name}
                  className={({ selected }) =>
                    classNames(
                      "px-4 py-2 rounded-lg text-sm font-medium",
                      selected
                        ? "bg-white/10 text-white backdrop-blur-lg"
                        : "text-white/60 hover:text-white"
                    )
                  }
                >
                  {tab.name}
                </Tab>
              ))}
            </Tab.List>
          </Tab.Group>
        )}
      </div>

      {/* KPI Row */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="p-4 bg-white/5 backdrop-blur-lg rounded-2xl flex items-center space-x-3 shadow-lg"
            >
              {kpi.icon && <kpi.icon className="w-6 h-6 text-gold-400" />}
              <div>
                <div className="text-sm text-white/70">{kpi.label}</div>
                <div className="text-xl font-semibold">{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {tabs.length > 0
            ? tabs[selectedIndex]?.content || children
            : children}
        </div>

        {/* Side Panel */}
        {sidePanel && (
          <div className="w-full lg:w-72 p-4 bg-white/5 backdrop-blur-lg rounded-2xl shadow-lg">
            {sidePanel}
          </div>
        )}
      </div>

      {/* Footer / Summary */}
      <div className="p-4 bg-white/5 backdrop-blur-lg rounded-2xl shadow-inner text-white/70">
        <Sparkles className="inline w-4 h-4 mr-2" /> Summary and actions
      </div>
    </div>
  );
}
