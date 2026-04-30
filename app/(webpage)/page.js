"use client";


import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || "Login failed");
        return;
      }

      router.push("/login/callback");
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  const liveStats = [
    { label: "Revenue Today", value: "฿42,850", icon: "/icons/result-growth.png" },
    { label: "Orders", value: "126", icon: "/icons/input-orders.png" },
    { label: "Stock Alerts", value: "7", icon: "/icons/action-alert.png" },
    { label: "AI Decisions", value: "24", icon: "/icons/ai-process.png" },
  ];

  const outcomeCards = [
    "Revenue ↑",
    "Costs ↓",
    "Staff accountable",
    "Marketing automated",
    "Decisions clear",
    "AI controlled",
  ];

  const flowSteps = [
    {
      title: "Input",
      subtitle: "Orders, staff, stock, suppliers, customers",
      icon: "/icons/input-box.png",
    },
    {
      title: "AI Process",
      subtitle: "AI analyzes data in real time",
      icon: "/icons/ai-process.png",
    },
    {
      title: "Decision",
      subtitle: "Smart decisions made instantly",
      icon: "/icons/decision-target.png",
    },
    {
      title: "Action",
      subtitle: "Tasks, notifications and automation",
      icon: "/icons/action-lightning.png",
    },
    {
      title: "Result",
      subtitle: "Higher profit, lower cost, better control",
      icon: "/icons/result-growth.png",
    },
  ];

  const automationCards = [
    {
      title: "Cost Control",
      text: "Track COGS, waste, stock usage and reduce cost automatically.",
      icon: "/icons/finance-cost.png",
    },
    {
      title: "Production",
      text: "Auto-plan production from stock, orders and forecast demand.",
      icon: "/icons/production.png",
    },
    {
      title: "AI Marketing",
      text: "AI creates content, captions and campaigns automatically.",
      icon: "/icons/marketing.png",
    },
    {
      title: "Design Tools",
      text: "Create professional visuals and brand assets with AI.",
      icon: "/icons/design-camera.png",
    },
    {
      title: "Auto Post",
      text: "Post approved campaigns to Google, social media, WhatsApp, LINE and email.",
      icon: "/icons/auto-post.png",
    },
    {
      title: "Auto Reply",
      text: "AI answers Google reviews, Facebook messages, WhatsApp, LINE and email.",
      icon: "/icons/auto-reply.png",
    },
    {
      title: "Staff & Salary",
      text: "Connect attendance, performance, approvals and salary calculation.",
      icon: "/icons/staff-salary.png",
    },
    {
      title: "Analytics",
      text: "Real-time reports and AI insights for better decisions.",
      icon: "/icons/result-growth.png",
    },
  ];

  const modules = [
    "Operations",
    "Dashboard",
    "AI Manager",
    "POS",
    "Stock",
    "Production",
    "Accounting",
    "Finance",
    "Salary",
    "Marketing",
    "Design",
    "Customers",
    "Approvals",
    "Alerts",
    "History",
    "Automation",
    "Integrations",
  ];

  const moduleDescriptions = {
    Operations: "Daily control, tasks and execution",
    Dashboard: "Real-time business overview",
    "AI Manager": "AI decision engine controlling operations",
    POS: "Orders, tables, payments",
    Stock: "Inventory and availability control",
    Production: "Kitchen → stock → cost flow",
    Accounting: "Invoices, expenses, tracking",
    Finance: "Profit, COGS, business health",
    Salary: "Performance-based payouts",
    Marketing: "Campaigns and automation",
    Design: "AI-generated visuals and assets",
    Customers: "CRM, behavior and loyalty",
    Approvals: "Control all critical actions",
    Alerts: "Detect issues and trigger actions",
    History: "Track performance and data",
    Automation: "Scheduled workflows",
    Integrations: "External platforms and tools",
  };

  const moduleIcons = {
    Operations: "/icons/operations.png",
    Dashboard: "/icons/dashboard.png",
    "AI Manager": "/icons/ai-process.png",
    POS: "/icons/pos.png",
    Stock: "/icons/input-box.png",
    Production: "/icons/production.png",
    Accounting: "/icons/accounting.png",
    Finance: "/icons/finance-cost.png",
    Salary: "/icons/salary.png",
    Marketing: "/icons/marketing.png",
    Design: "/icons/design-camera.png",
    Customers: "/icons/customers.png",
    Approvals: "/icons/approvals.png",
    Alerts: "/icons/action-alert.png",
    History: "/icons/history.png",
    Automation: "/icons/action-lightning.png",
    Integrations: "/icons/integrations.png",
  };

  const channels = [
    { name: "Google", icon: "/icons/google.png", note: "Reviews, search and business profile" },
    { name: "Facebook", icon: "/icons/facebook.png", note: "Messages, posts and campaigns" },
    { name: "Instagram", icon: "/icons/instagram.png", note: "Content, stories and campaigns" },
    { name: "TikTok", icon: "/icons/tiktok.png", note: "Short video distribution" },
    { name: "WhatsApp", icon: "/icons/whatsapp.png", note: "Customer chat automation" },
    { name: "LINE", icon: "/icons/line.png", note: "Customer communication" },
    { name: "Email", icon: "/icons/email.png", note: "Campaigns and replies" },
  ];

  return (
    <main className="min-h-screen text-white relative bg-black overflow-x-hidden">
      {/* FIXED BACKGROUND */}
      <div
        className="fixed inset-0 bg-cover bg-center opacity-45"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/65 via-black/45 to-black/80" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,122,0,0.22),transparent_35%)]" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.05),transparent_35%)]" />

      <div className="relative z-10">
        {/* HERO */}
        <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 grid lg:grid-cols-[1fr_0.95fr] gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-orange-300 mb-6">
              AI Powered Business Operation System
            </div>

            <h1 className="text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight">
              One System.
              <br />
              Full Control.
            </h1>

            <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
              Operations, production, cost control, staff, marketing, customer communication and AI — connected into one system that runs your business.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4 text-sm max-w-2xl">
              {outcomeCards.map((item) => (
                <div key={item} className="glass p-4 rounded-2xl">
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap gap-4">
              <a href="#login" className="btn-primary">
                Enter System →
              </a>
              <button className="btn-secondary">
                View Live Demo →
              </button>
            </div>

            <div className="mt-6 text-sm text-muted">
              Built for restaurants, production businesses, service operations and multi-location teams.
            </div>
          </div>

          <div className="space-y-5">
            <div className="glass-strong p-6 rounded-[2rem] border border-white/15">
              <div className="flex items-start justify-between gap-5 mb-6">
                <div>
                  <div className="text-sm text-muted">Live System</div>
                  <div className="text-2xl font-semibold">Control Center</div>
                </div>
                <div className="rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-xs text-green-400">
                  ● Online
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {liveStats.map((item) => (
                  <div key={item.label} className="glass p-4 rounded-2xl">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted">{item.label}</div>
                        <div className="mt-1 text-2xl font-bold">{item.value}</div>
                      </div>
                      <img src={item.icon} alt="" className="h-10 w-10 object-contain opacity-90" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 glass p-5 rounded-2xl border border-orange-500/25 bg-orange-500/5">
                <div className="flex items-center gap-4">
                  <img src="/icons/ai-brain.png" alt="AI Manager" className="h-14 w-14 object-contain" />
                  <div>
                    <div className="text-orange-400 font-semibold">AI Manager Action</div>
                    <div className="text-sm text-muted mt-1">
                      Low stock detected. Production task created and kitchen notified.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass p-5 rounded-[2rem] hidden lg:block">
              <div className="text-xs uppercase tracking-[0.22em] text-orange-300 mb-3">The Intelligence Core</div>
              <div className="flex items-center gap-5">
                <img src="/icons/ai-brain.png" alt="AI Core" className="h-28 w-28 object-contain drop-shadow-[0_0_30px_rgba(255,122,0,0.55)]" />
                <div>
                  <div className="text-xl font-semibold">AI Manager</div>
                  <div className="text-sm text-muted mt-2">
                    Reads the full business flow and turns data into decisions, approvals and actions.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FLOW */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="glass-strong rounded-[2rem] p-7 md:p-9 border border-orange-500/20">
            <div className="text-center mb-8">
              <div className="text-xs uppercase tracking-[0.22em] text-orange-300 mb-2">How It Works</div>
              <h2 className="text-3xl font-bold">Input → AI → Decision → Action → Result</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              {flowSteps.map((step, index) => (
                <div key={step.title} className="relative glass p-5 rounded-2xl text-center group hover:border-orange-400/40 transition">
                  {index < flowSteps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 h-[2px] w-8 bg-gradient-to-r from-orange-500 to-transparent" />
                  )}
                  <img src={step.icon} alt={step.title} className="mx-auto h-24 w-24 object-contain transition duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_24px_rgba(255,122,0,0.65)]" />
                  <div className="mt-4 text-sm font-bold uppercase tracking-wide">{step.title}</div>
                  <div className="mt-2 text-xs leading-5 text-muted">{step.subtitle}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AUTOMATION */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="mb-8">
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300 mb-2">The System Runs Your Business</div>
            <h2 className="text-3xl font-bold">From cost control to automatic customer replies</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {automationCards.map((card) => (
              <div key={card.title} className="glass p-5 rounded-2xl group hover:border-orange-400/40 transition">
                <img src={card.icon} alt={card.title} className="h-20 w-20 object-contain mb-4 transition duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_22px_rgba(255,122,0,0.55)]" />
                <div className="text-lg font-semibold">{card.title}</div>
                <div className="text-sm text-muted mt-2 leading-6">{card.text}</div>
              </div>
            ))}
          </div>
        </section>


        {/* DISTRIBUTION */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="glass-strong rounded-[2rem] p-8 md:p-10 border border-orange-500/20 text-center">
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300 mb-2">Distribution & Communication</div>
            <h2 className="text-3xl font-bold mb-4">AI creates. System approves. Channels publish.</h2>
            <p className="text-muted max-w-3xl mx-auto mb-9">
              The system can generate content, answer customers, reply to reviews and distribute campaigns across the channels where your business lives.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-5">
              {channels.map((channel) => (
                <div key={channel.name} className="group glass p-4 rounded-2xl hover:border-orange-400/40 transition">
                  <img
                    src={channel.icon}
                    alt={channel.name}
                    className="mx-auto h-24 w-24 object-contain transition duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_24px_rgba(255,122,0,0.55)]"
                  />
                  <div className="mt-3 text-sm font-semibold">{channel.name}</div>
                  <div className="mt-1 text-[11px] leading-4 text-muted">{channel.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LOGIN */}
        <section id="login" className="max-w-md mx-auto px-6 pt-8 pb-28">
          <div className="glass-strong rounded-[2rem] p-7 border border-orange-500/20">
            <h2 className="text-2xl font-semibold mb-2">Enter Your System</h2>
            <p className="text-sm text-muted mb-6">Secure access for owner, manager, staff, accounting and POS.</p>

            <form onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mb-4"
                required
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mb-4"
                required
              />

              {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

              <button className="btn-primary w-full" disabled={loading}>
                {loading ? "Entering..." : "Enter System →"}
              </button>

              <div className="mt-4 text-center text-xs text-muted">
                Secure • Private • Multi-tenant ready
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

