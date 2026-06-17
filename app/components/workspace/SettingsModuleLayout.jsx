"use client";
import { useState } from "react";
import { Tab } from "@headlessui/react";

function classNames(...classes){return classes.filter(Boolean).join(" ");}
export default function SettingsModuleLayout({moduleName,tabs=[],children}){
  const [selectedIndex,setSelectedIndex]=useState(0);
  return(
    <div className="p-6 space-y-6 text-white font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{moduleName}</h1>
        {tabs.length>0&&(
          <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex}>
            <Tab.List className="flex space-x-4">
              {tabs.map(tab=>(
                <Tab key={tab.name} className={({selected})=>classNames(
                  "px-4 py-2 rounded-lg text-sm font-medium",
                  selected?"bg-white/10 text-white backdrop-blur-lg":"text-white/60 hover:text-white"
                )}>{tab.name}</Tab>
              ))}
            </Tab.List>
          </Tab.Group>
        )}
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-6">{tabs.length>0?tabs[selectedIndex]?.content||children:children}</div>
      </div>
      <div className="p-4 bg-white/5 backdrop-blur-lg rounded-2xl shadow-inner text-white/70">Settings / Admin Actions</div>
    </div>
  );
}
