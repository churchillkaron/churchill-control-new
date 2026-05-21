"use client";

export const dynamic = "force-dynamic";

import PageWrapper from "@/components/PageWrapper";

export default function KnowledgeCoreDocsPage() {
  return (
    <PageWrapper
      title="Knowledge Core Docs"
      subtitle="Avantiqo + Churchill master architecture handover"
    >
      <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 max-w-6xl">
        <pre className="whitespace-pre-wrap text-sm leading-7 text-white/70">
{`AVANTIQO + CHURCHILL MASTER ARCHITECTURE HANDOVER

CORE VISION

AVANTIQO
Customer-facing SaaS platform.

Purpose:
- Landing page
- Login/Register
- Customer onboarding
- Pricing
- Module marketplace
- Business setup
- Subscription management
- Customer portal

Avantiqo is the FACE of the platform.

CHURCHILL
Universal Business Operating System.

Purpose:
- ERP engine
- Operations engine
- Finance engine
- AI engine
- Realtime engine
- Payroll engine
- Procurement engine
- Analytics engine
- Industry systems

Churchill is the SYSTEM ENGINE.

MASTER PLATFORM FLOW

AVANTIQO
Customer enters here
↓
Login / Register
↓
Choose business type
↓
Choose modules
↓
Create tenant/company
↓
Redirect into CHURCHILL SYSTEM

CHURCHILL then loads only enabled modules for that tenant.

INDUSTRY ARCHITECTURE

Industries are not single pages.
Industries are operational systems built on Churchill Core.

Restaurant OS:
- POS
- Kitchen
- Floor
- Expo
- Reservations
- Payroll
- Inventory
- Procurement
- Finance
- Marketing
- AI Forecasting

Hotel OS:
- Reservations
- Housekeeping
- Front Desk
- Maintenance
- Concierge
- Spa
- Payroll
- Finance
- Procurement
- AI Forecasting

Retail OS:
- Stores
- Warehouse
- Inventory
- Pricing
- Loyalty
- Ecommerce
- Procurement
- Finance
- Analytics

Construction OS:
- Projects
- Timelines
- Site Operations
- Workforce
- Equipment
- Payroll
- Procurement
- Billing
- Risk Analysis
- Compliance

ARCHITECTURE RULE

Everything must connect through:

Frontend
→ API Route
→ Domain Service
→ Shared Infrastructure
→ Database

Never create duplicate systems.

CURRENT IMPORTANT FILES

Platform:
- lib/platform/moduleRegistry.js
- lib/platform/industryRegistry.js
- lib/platform/modules/*
- lib/platform/navigation/*

Restaurant:
- app/(system)/pos/POSContent.js
- app/(system)/kitchen/page.js
- app/(system)/floor/page.jsx
- app/(system)/expo/page.jsx

Finance:
- app/(system)/finance/*
- app/api/finance/*
- lib/finance/*

Kitchen:
- app/api/kitchen/*
- lib/kitchen/*

Production:
- app/(system)/production/*
- app/api/production/*
- lib/production/*

Procurement:
- app/(system)/procurement/*
- app/api/procurement/*
- lib/procurement/*

Marketing:
- app/(system)/marketing/*
- app/api/marketing/*
- lib/marketing/*

AI:
- app/(system)/intelligence/*
- app/api/intelligence/*
- lib/intelligence/*
- lib/ai-*
- lib/ai/*

Shared:
- lib/shared/*
- lib/shared/supabase/*
- lib/shared/tenant/*
- lib/shared/auth/*
- lib/shared/approvals/*
- lib/shared/events/*

CURRENT RISK

The system is already large.
Main risk is not missing features.
Main risk is duplicate logic and architecture drift.

Before building anything:
1. Check this Knowledge Core
2. Check existing folders
3. Reuse existing systems
4. Connect to shared infrastructure
5. Do not create parallel logic

CURRENT PRIORITY

Do not build more random pages.

Focus on:
- Stabilize operational flow
- Connect systems
- Remove duplicate logic
- Improve dynamic module loading
- Improve tenant-based navigation
- Improve enterprise dashboard
- Improve AI orchestration

CRITICAL FLOWS TO KEEP STABLE

1. POS → Kitchen
2. Kitchen → Production
3. Production → Inventory
4. Payment → Finance
5. Shift Close → Payroll
6. Approval → Accounting
7. Marketing Queue → Publishing

DYNAMIC MODULE VISION

Avantiqo:
- Customer chooses business type
- Customer chooses modules
- Subscription activates tenant modules

Churchill:
- Reads enabled tenant modules
- Builds navigation dynamically
- Builds dashboard dynamically
- Loads permissions dynamically
- Loads AI access dynamically

TENANT MODULE MODEL

tenant
→ enabled modules
→ subscription
→ permissions
→ navigation
→ dashboards
→ AI access

LONG TERM VISION

Avantiqo + Churchill becomes:

Enterprise Multi-Industry AI Operating System

Supporting:
- Restaurants
- Hotels
- Retail
- Construction
- Healthcare
- Logistics
- Manufacturing
- Franchises
- Enterprise groups

All industries share:
- Finance
- AI
- Payroll
- Procurement
- Inventory
- Analytics
- Governance
- Realtime
- Identity

Only operational workflows change per industry.

FINAL RULE

This Knowledge Core must always be updated when:
- architecture changes
- new module is added
- flow changes
- new industry is added
- duplicate is found
- system direction changes
- onboarding/deployment rule changes

# PLATFORM ARCHITECTURE RULES

VERY IMPORTANT:

Modules and Workspaces are NOT the same thing.

---

# MODULES

Modules are:
- reusable business capabilities
- shared across industries
- platform-wide systems

Examples:

POS
Reservations
Inventory
Procurement
Finance
Accounting
Payroll
CRM
Customer Portal
Marketing AI
Owner AI
Analytics
Projects

Modules can be used by:
- restaurant
- hotel
- retail
- construction
- healthcare
- future industries

Example:
POS is ONE shared module.
NOT separate restaurant POS / hotel POS / retail POS.

Industry adapters modify workflows and UX.

---

# INDUSTRY WORKSPACES

Workspaces are:
- operational environments
- industry-specific workflows
- specialized operational interfaces

Restaurant workspaces:
- Floor
- Kitchen
- Expo

Hotel workspaces:
- Front Desk
- Housekeeping
- Maintenance
- Concierge

Retail workspaces:
- Stores
- Warehouse
- Pricing
- Loyalty

Construction workspaces:
- BOQ / Calculation
- Site Operations
- Materials
- Equipment
- Subcontractors
- Project Billing

---

# FINAL PLATFORM MODEL

Industry
→ operational context

Modules
→ shared business capabilities

Workspaces
→ industry operational environments

---

# IMPORTANT DEVELOPMENT RULE

If multiple industries can use it:
→ MODULE

If operationally specific to one industry:
→ WORKSPACE

Examples:

POS
→ MODULE

Reservations
→ MODULE

Inventory
→ MODULE

Kitchen
→ WORKSPACE

Floor
→ WORKSPACE

BOQ
→ WORKSPACE

Housekeeping
→ WORKSPACE

---

# ENTERPRISE NAVIGATION MODEL

Navigation should eventually become:

WORKSPACES
→ industry operational areas

BUSINESS
→ shared business modules

INTELLIGENCE
→ AI systems

Example Restaurant Tenant:

WORKSPACES
- Floor
- Kitchen
- Expo

BUSINESS
- POS
- Reservations
- Inventory
- Procurement
- Finance
- Payroll

INTELLIGENCE
- Analytics
- Marketing AI
- Owner AI

---

# IMPORTANT FUTURE RULE

DO NOT duplicate shared modules by industry.

WRONG:
- Restaurant POS
- Hotel POS
- Retail POS

CORRECT:
- POS Core Module
- Industry adapters/workflows

This rule is critical for scalability and avoiding architecture drift.

This is the single source of truth.`}
        </pre>
      </div>
    </PageWrapper>
  );
}
