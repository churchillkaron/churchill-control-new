"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Utensils,
  Coffee,
  Martini,
  Factory,
  ShoppingBag,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const businessTypes = [
  {
    id: "restaurant",
    title: "Restaurant",
    description: "Tables, POS, kitchen flow, recipes, dish stock, staff performance and service charge.",
    icon: Utensils,
    enabled: true,
  },
  {
    id: "cafe",
    title: "Café",
    description: "Counter sales, simple menu, drinks, light food, stock control and staff routines.",
    icon: Coffee,
    enabled: true,
  },
  {
    id: "bar",
    title: "Bar",
    description: "Drinks, bottle stock, bar performance, waste tracking and service charge logic.",
    icon: Martini,
    enabled: true,
  },
  {
    id: "production",
    title: "Production Business",
    description: "No tables. Focus on production orders, ingredients, inventory, cost and output control.",
    icon: Factory,
    enabled: true,
  },
  {
    id: "retail",
    title: "Retail",
    description: "Product sales, inventory, customers and simple stock movement. Coming later.",
    icon: ShoppingBag,
    enabled: false,
  },
];

export default function SystemSetupStepOne() {
  const [selectedType, setSelectedType] = useState("restaurant");

  const selectedBusiness = businessTypes.find((item) => item.id === selectedType);

  return (
    <main className="min-h-screen bg-[#070707] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,120,40,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,85,0,0.14),transparent_35%)]" />
      <div className="absolute inset-0 bg-black/40" />

      <section className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-orange-300 tracking-[0.3em] uppercase mb-2">System Setup</p>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Choose business type</h1>
            <p className="text-white/55 mt-3 max-w-2xl">
              This decides how the system works: POS, stock, staff, approvals, AI and finance rules.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.9)]" />
            <span className="text-sm text-white/70">Step 1 of 10</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {businessTypes.map((type) => {
              const Icon = type.icon;
              const active = selectedType === type.id;

              return (
                <button
                  key={type.id}
                  disabled={!type.enabled}
                  onClick={() => setSelectedType(type.id)}
                  className={`text-left rounded-3xl border p-1 transition-all duration-300 ${
                    active
                      ? "border-orange-400/80 bg-orange-500/10 shadow-[0_0_45px_rgba(249,115,22,0.18)]"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                  } ${!type.enabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Card className="bg-transparent border-0 shadow-none h-full">
                    <CardContent className="p-6 min-h-[210px] flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-5">
                          <div
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                              active ? "bg-orange-500 text-black" : "bg-white/10 text-orange-300"
                            }`}
                          >
                            <Icon size={26} />
                          </div>

                          {active && <CheckCircle2 className="text-orange-300" size={24} />}
                          {!type.enabled && (
                            <span className="text-xs px-3 py-1 rounded-full bg-white/10 text-white/50">
                              Later
                            </span>
                          )}
                        </div>

                        <h2 className="text-2xl font-semibold mb-3">{type.title}</h2>
                        <p className="text-sm leading-6 text-white/55">{type.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-3xl bg-white/[0.06] border border-white/10 backdrop-blur-xl p-6 h-fit sticky top-8"
          >
            <p className="text-sm text-orange-300 uppercase tracking-[0.25em] mb-3">Selected setup</p>
            <h3 className="text-3xl font-semibold mb-3">{selectedBusiness?.title}</h3>
            <p className="text-white/55 text-sm leading-6 mb-6">{selectedBusiness?.description}</p>

            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-white/45">POS Logic</span>
                <span className="text-white/85">
                  {selectedType === "production" ? "Orders only" : "Enabled"}
                </span>
              </div>
              <div className="flex justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-white/45">Table System</span>
                <span className="text-white/85">
                  {selectedType === "restaurant" ? "Enabled" : "Optional"}
                </span>
              </div>
              <div className="flex justify-between text-sm border-b border-white/10 pb-3">
                <span className="text-white/45">Stock Mode</span>
                <span className="text-white/85">
                  {selectedType === "production" ? "Production" : "Ingredient + Product"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/45">AI Setup</span>
                <span className="text-white/85">Assisted</span>
              </div>
            </div>

            <Button className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-semibold text-base">
              Continue to Business Structure
              <ArrowRight className="ml-2" size={18} />
            </Button>
          </motion.aside>
        </div>
      </section>
    </main>
  );
}
