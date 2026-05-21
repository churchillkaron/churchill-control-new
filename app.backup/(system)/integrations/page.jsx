"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import {
  ArrowRight,
  Bot,
  Brain,
  Building2,
  Cable,
  CreditCard,
  Globe,
  LayoutDashboard,
  Link2,
  Mail,
  MessageCircle,
  MessagesSquare,
  MonitorSmartphone,
  PlugZap,
  Receipt,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Webhook,
  Wifi,
} from "lucide-react";

const SECTIONS = [

  {
    title: "Integration Overview",
    description:
      "Main integration command center, external systems and enterprise connectivity visibility.",
    icon: LayoutDashboard,
    items: [
      { name: "Overview", route: "/integrations/overview" },
      { name: "Live Runtime", route: "/integrations/live" },
      { name: "Integration Dashboard", route: "/integrations/dashboard" },
      { name: "Connection Health", route: "/integrations/health" },
    ],
  },

  {
    title: "API & Webhooks",
    description:
      "API connectivity, webhooks and realtime integration infrastructure.",
    icon: Webhook,
    items: [
      { name: "API Runtime", route: "/integrations/api" },
      { name: "Webhook Runtime", route: "/integrations/webhooks" },
      { name: "API Logs", route: "/integrations/api-logs" },
      { name: "Connection Monitoring", route: "/integrations/monitoring" },
      { name: "Request Tracking", route: "/integrations/requests" },
    ],
  },

  {
    title: "OAuth & Platform Connections",
    description:
      "OAuth providers, authentication integrations and external platform connectivity.",
    icon: ShieldCheck,
    items: [
      { name: "OAuth Runtime", route: "/integrations/oauth" },
      { name: "Google Integration", route: "/integrations/google" },
      { name: "Meta Integration", route: "/integrations/meta" },
      { name: "Platform Tokens", route: "/integrations/tokens" },
      { name: "Authorization Logs", route: "/integrations/auth-logs" },
    ],
  },

  {
    title: "Communication Integrations",
    description:
      "Messaging infrastructure, communication providers and customer communication runtime.",
    icon: MessageCircle,
    items: [
      { name: "WhatsApp Runtime", route: "/integrations/whatsapp" },
      { name: "LINE Runtime", route: "/integrations/line" },
      { name: "Email Runtime", route: "/integrations/email" },
      { name: "SMS Runtime", route: "/integrations/sms" },
      { name: "Communication Logs", route: "/integrations/communication-logs" },
    ],
  },

  {
    title: "Payment & Finance",
    description:
      "Payment gateways, accounting integrations and financial connectivity.",
    icon: CreditCard,
    items: [
      { name: "Payment Gateways", route: "/integrations/payments" },
      { name: "Stripe Runtime", route: "/integrations/stripe" },
      { name: "Accounting Integrations", route: "/integrations/accounting" },
      { name: "Transaction Sync", route: "/integrations/transactions" },
      { name: "Financial APIs", route: "/integrations/financial-apis" },
    ],
  },

  {
    title: "Reservation & Delivery",
    description:
      "Reservation systems, delivery platforms and hospitality platform integrations.",
    icon: Store,
    items: [
      { name: "Reservation Platforms", route: "/integrations/reservations" },
      { name: "Booking Runtime", route: "/integrations/bookings" },
      { name: "Delivery Platforms", route: "/integrations/delivery" },
      { name: "POS Connectivity", route: "/integrations/pos" },
      { name: "Hospitality Platforms", route: "/integrations/hospitality" },
    ],
  },

  {
    title: "Marketing & Social",
    description:
      "Marketing platform integrations and social connectivity runtime.",
    icon: Globe,
    items: [
      { name: "Marketing Integrations", route: "/integrations/marketing" },
      { name: "Social Platforms", route: "/integrations/social" },
      { name: "Campaign Sync", route: "/integrations/campaigns" },
      { name: "Audience Sync", route: "/integrations/audiences" },
      { name: "Publishing Connections", route: "/integrations/publishing" },
    ],
  },

  {
    title: "Devices & Infrastructure",
    description:
      "POS devices, IoT systems and operational hardware integrations.",
    icon: MonitorSmartphone,
    items: [
      { name: "POS Devices", route: "/integrations/devices" },
      { name: "IoT Runtime", route: "/integrations/iot" },
      { name: "Sensor Runtime", route: "/integrations/sensors" },
      { name: "Printer Connections", route: "/integrations/printers" },
      { name: "Infrastructure Health", route: "/integrations/infrastructure" },
    ],
  },

  {
    title: "AI & External Services",
    description:
      "AI providers, external engines and enterprise service integrations.",
    icon: Brain,
    items: [
      { name: "AI Providers", route: "/integrations/ai" },
      { name: "External Services", route: "/integrations/services" },
      { name: "AI Runtime", route: "/integrations/ai-runtime" },
      { name: "Cloud Connections", route: "/integrations/cloud" },
      { name: "External APIs", route: "/integrations/external-apis" },
    ],
  },

  {
    title: "Integration Operations",
    description:
      "Integration observability, logs, failures and runtime operations.",
    icon: Server,
    items: [
      { name: "Integration Logs", route: "/integrations/logs" },
      { name: "Runtime Failures", route: "/integrations/failures" },
      { name: "Sync Operations", route: "/integrations/sync" },
      { name: "Execution Runtime", route: "/integrations/execution" },
      { name: "Audit Trail", route: "/integrations/audit" },
    ],
  },

];

const STATUS = [

  {
    label: "Integration Runtime",
    value: "ACTIVE",
  },

  {
    label: "Communication APIs",
    value: "ONLINE",
  },

  {
    label: "OAuth Systems",
    value: "RUNNING",
  },

  {
    label: "External Connectivity",
    value: "ARMED",
  },

];

const QUICK_ACTIONS = [

  "Review WhatsApp connections",
  "Analyze webhook failures",
  "Check OAuth tokens",
  "Monitor API requests",
  "Review email runtime",
  "Analyze integration health",

];

export default function IntegrationsPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10">

            <PlugZap className="h-5 w-5 text-blue-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-blue-400">

            Churchill Platform

          </div>

        </div>

        <div className="flex items-end justify-between gap-8">

          <div>

            <h1 className="mb-4 text-7xl font-light">

              Integrations

            </h1>

            <p className="max-w-5xl text-lg leading-relaxed text-white/50">

              Enterprise integration runtime for APIs, communication systems,
              external platforms, OAuth and operational connectivity.

            </p>

          </div>

          <Link
            href="/integrations/live"
            className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-5 py-4 text-sm font-medium text-blue-300 hover:bg-blue-500/20"
          >

            Open Integration Runtime

          </Link>

        </div>

      </div>

      <div className="mb-10 grid grid-cols-4 gap-6">

        {STATUS.map((item) => (

          <div
            key={item.label}
            className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6"
          >

            <div className="mb-5 h-8 w-8 rounded-2xl bg-blue-500/10" />

            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-white/30">

              {item.label}

            </div>

            <div className="text-3xl font-light">

              {item.value}

            </div>

          </div>

        ))}

      </div>

      <div className="mb-10 rounded-[40px] border border-blue-500/20 bg-blue-500/5 p-8">

        <div className="mb-6 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/10">

              <Sparkles className="h-8 w-8 text-blue-400" />

            </div>

            <div>

              <div className="mb-1 text-3xl font-light">

                Integration AI Command

              </div>

              <div className="text-white/40">

                Monitor APIs, communication systems and enterprise connectivity.

              </div>

            </div>

          </div>

          <Link
            href="/integrations/ai"
            className="rounded-2xl border border-blue-500/20 bg-black/30 px-5 py-3 text-sm text-blue-300"
          >

            Open Integration Intelligence

          </Link>

        </div>

        <div className="mb-5 flex items-center gap-4 rounded-3xl border border-white/10 bg-black/40 px-6 py-5">

          <Bot className="h-6 w-6 text-blue-400" />

          <input
            placeholder="Ask integration AI to monitor APIs, WhatsApp, LINE, email or external connectivity..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-white/20"
          />

          <button className="rounded-2xl bg-blue-500 px-6 py-3 font-medium text-white">

            Run

          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          {QUICK_ACTIONS.map((action) => (

            <button
              key={action}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/60 hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white"
            >

              {action}

            </button>

          ))}

        </div>

      </div>

      <div className="grid grid-cols-2 gap-6">

        {SECTIONS.map((section) => {

          const Icon = section.icon;

          return (

            <div
              key={section.title}
              className="rounded-[36px] border border-white/10 bg-white/[0.03] p-8"
            >

              <div className="mb-8 flex items-start justify-between gap-6">

                <div className="flex gap-5">

                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500/10">

                    <Icon className="h-8 w-8 text-blue-400" />

                  </div>

                  <div>

                    <div className="mb-2 text-3xl font-light">

                      {section.title}

                    </div>

                    <div className="max-w-xl text-white/45">

                      {section.description}

                    </div>

                  </div>

                </div>

                <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/40">

                  Runtime

                </div>

              </div>

              <div className="grid grid-cols-2 gap-3">

                {section.items.map((item) => (

                  <Link
                    key={item.route}
                    href={item.route}
                    className="group rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-blue-500/40 hover:bg-blue-500/5"
                  >

                    <div className="flex items-center justify-between gap-3">

                      <div className="text-white/70">

                        {item.name}

                      </div>

                      <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-blue-400" />

                    </div>

                  </Link>

                ))}

              </div>

            </div>

          );

        })}

      </div>

    </main>

  );

}
